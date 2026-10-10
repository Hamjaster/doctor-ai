"""Look up medical guidance on the web and return a short answer with real sources.

Two providers, tried in order:

1. Gemini with Google Search grounding. Broadest coverage, but the Gemini API
   only allows it on keys with billing enabled. A failure disables it for a
   while so every lookup doesn't pay for a doomed request.
2. Free public references, no key: MedlinePlus health topics (US National
   Library of Medicine) for conditions and symptoms, and FDA drug labels for
   medicines, linked to their DailyMed pages. Gemini answers the question using
   only the excerpts that matched.
"""

from __future__ import annotations

import asyncio
import html
import logging
import os
import re
import time
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from urllib.parse import quote

import aiohttp
from pydantic import BaseModel
from google import genai
from google.genai import types

logger = logging.getLogger("saathi.medical_search")

ANSWER_MODEL = os.getenv("SAATHI_SEARCH_MODEL", "gemini-flash-latest")
# Summarising a few excerpts is light work, so try the faster model first and fall back to
# ANSWER_MODEL. Either can be overloaded or slow at peak times.
SUMMARY_MODEL = os.getenv("SAATHI_SUMMARY_MODEL", "gemini-flash-lite-latest")
GOOGLE_SEARCH_RETRY_SECONDS = 600
# Keep lookups short: the patient is waiting on a live call.
GEMINI_TIMEOUT_SECONDS = 12
SUMMARY_ATTEMPTS = ((SUMMARY_MODEL, 6), (ANSWER_MODEL, 8))  # (model, timeout in seconds)
MEDLINEPLUS_URL = "https://wsearch.nlm.nih.gov/ws/query"
OPENFDA_LABEL_URL = "https://api.fda.gov/drug/label.json"
DAILYMED_URL = "https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid="
# FDA labels use US names; map the names patients in Pakistan and the UK use.
DRUG_NAME_ALIASES = {
    "paracetamol": "acetaminophen",
    "panadol": "acetaminophen",
    "calpol": "acetaminophen",
    "salbutamol": "albuterol",
    "adrenaline": "epinephrine",
    "frusemide": "furosemide",
    "glibenclamide": "glyburide",
    "lignocaine": "lidocaine",
    "brufen": "ibuprofen",
    "disprin": "aspirin",
}
# Label sections worth reading. Dosage is left out on purpose: the prompt sends
# patients to the packet or a pharmacist for doses.
DRUG_LABEL_SECTIONS = (
    "purpose",
    "indications_and_usage",
    "do_not_use",
    "ask_doctor",
    "ask_doctor_or_pharmacist",
    "stop_use",
    "pregnancy_or_breast_feeding",
    "warnings",
)
MAX_SOURCES = 5
HTTP_TIMEOUT = aiohttp.ClientTimeout(total=8)

ANSWER_INSTRUCTIONS = """You are a clinical reference assistant helping an AI doctor during a live consult.
Answer the question accurately and concisely, in at most 120 words of plain text.
Prefer authoritative sources: WHO, CDC, NHS, NICE, NIH and MedlinePlus, Mayo Clinic,
national health ministries, and peer-reviewed guidelines. Avoid forums, blogs, and sellers.
State what is uncertain. Do not invent facts that the sources don't support."""


class _GroundedAnswer(BaseModel):
    answer: str
    used_excerpts: list[int]


@dataclass
class Source:
    title: str
    url: str


@dataclass
class LookupResult:
    answer: str
    sources: list[Source] = field(default_factory=list)
    provider: str = ""


class MedicalSearch:
    def __init__(self, api_key: str | None = None) -> None:
        self._client = genai.Client(api_key=api_key or os.environ["GOOGLE_API_KEY"])
        self._google_search_disabled_until = 0.0

    async def look_up(self, question: str, keywords: str) -> LookupResult:
        if time.monotonic() >= self._google_search_disabled_until:
            try:
                return await self._google_search(question)
            except Exception as e:  # quota, billing, network: fall back
                logger.warning("google search grounding failed, using MedlinePlus: %s", e)
                self._google_search_disabled_until = time.monotonic() + GOOGLE_SEARCH_RETRY_SECONDS
        return await self._medlineplus(question, keywords)

    async def _generate(
        self, model: str = ANSWER_MODEL, timeout: float = GEMINI_TIMEOUT_SECONDS, **kwargs
    ) -> types.GenerateContentResponse:
        return await asyncio.wait_for(
            self._client.aio.models.generate_content(model=model, **kwargs), timeout=timeout
        )

    async def _google_search(self, question: str) -> LookupResult:
        response = await self._generate(
            contents=question,
            config=types.GenerateContentConfig(
                system_instruction=ANSWER_INSTRUCTIONS,
                tools=[types.Tool(google_search=types.GoogleSearch())],
            ),
        )
        metadata = response.candidates[0].grounding_metadata if response.candidates else None
        chunks = (metadata.grounding_chunks or []) if metadata else []
        raw = [(c.web.title or "", c.web.uri) for c in chunks if c.web and c.web.uri]
        sources = await _resolve_redirects(raw[:MAX_SOURCES])
        if not sources:
            raise RuntimeError("google search returned no sources")
        return LookupResult(answer=(response.text or "").strip(), sources=sources, provider="google")

    async def _medlineplus(self, question: str, keywords: str) -> LookupResult:
        term = keywords or question
        topics, labels = await asyncio.gather(
            _search_medlineplus(term), _search_drug_labels(term), return_exceptions=True
        )
        for name, result in (("MedlinePlus", topics), ("FDA labels", labels)):
            if isinstance(result, BaseException):
                logger.warning("%s search failed: %r", name, result)
        topics = topics if isinstance(topics, list) else []
        labels = labels if isinstance(labels, list) else []
        # Drug labels first: when a medicine is named, its label is the most specific source.
        topics = (labels + topics)[:MAX_SOURCES]
        if not topics:
            return LookupResult(
                answer="No matching reference pages were found. Rely on clinical judgement "
                "and advise an in-person doctor if unsure.",
                provider="references",
            )

        excerpts = "\n\n".join(
            f"[{i}] {t.title} ({t.url})\n{summary}" for i, (t, summary) in enumerate(topics, 1)
        )
        prompt = (
            f"Question: {question}\n\nAnswer using only these reference excerpts. "
            "If they don't cover it, say so. In used_excerpts, list the numbers of the "
            f"excerpts your answer actually relies on.\n\n{excerpts}"
        )
        config = types.GenerateContentConfig(
            system_instruction=ANSWER_INSTRUCTIONS,
            response_mime_type="application/json",
            response_schema=_GroundedAnswer,
        )
        for model, timeout in SUMMARY_ATTEMPTS:
            try:
                response = await self._generate(model, timeout, contents=prompt, config=config)
                parsed = _GroundedAnswer.model_validate_json(response.text or "{}")
            except Exception as e:
                logger.warning("summarising reference excerpts with %s failed: %r", model, e)
                continue
            used = [topics[i - 1][0] for i in dict.fromkeys(parsed.used_excerpts) if 1 <= i <= len(topics)]
            return LookupResult(answer=parsed.answer.strip(), sources=used, provider="references")

        # No model could summarise. Hand the live model the raw excerpts, and cite only the
        # most specific ones: any drug labels, plus the best-matching health topic.
        raw = labels + [t for t in topics if t not in labels][:1]
        return LookupResult(
            answer="\n\n".join(f"{t.title}: {s[:600]}" for t, s in raw),
            sources=[t for t, _ in raw],
            provider="references",
        )


async def _search_medlineplus(term: str, limit: int = 3) -> list[tuple[Source, str]]:
    async with aiohttp.ClientSession(timeout=HTTP_TIMEOUT) as http:
        results = await _query_medlineplus(http, term, limit)
        if results:
            return results
        # The whole phrase matched nothing, e.g. "cetirizine penicillin allergy". Try each word.
        per_word = await asyncio.gather(
            *(_query_medlineplus(http, w, limit) for w in _search_words(term)),
            return_exceptions=True,
        )
    seen: set[str] = set()
    merged: list[tuple[Source, str]] = []
    for batch in per_word:
        for source, summary in batch if isinstance(batch, list) else []:
            if source.url not in seen:
                seen.add(source.url)
                merged.append((source, summary))
    return merged[:limit]


async def _query_medlineplus(
    http: aiohttp.ClientSession, term: str, limit: int
) -> list[tuple[Source, str]]:
    params = {"db": "healthTopics", "term": term, "retmax": str(limit)}
    async with http.get(MEDLINEPLUS_URL, params=params) as resp:
        resp.raise_for_status()
        body = await resp.text()

    results: list[tuple[Source, str]] = []
    for doc in ET.fromstring(body).iter("document"):
        fields: dict[str, str] = {}
        for content in doc.findall("content"):
            name = content.get("name", "")
            if name not in fields:
                fields[name] = _strip_html(content.text or "")
        url = doc.get("url")
        if url and fields.get("title"):
            summary = fields.get("FullSummary") or fields.get("snippet") or ""
            results.append((Source(title=fields["title"] + " (MedlinePlus)", url=url), summary[:3000]))
    return results


async def _search_drug_labels(term: str, limit: int = 2) -> list[tuple[Source, str]]:
    """Find FDA labels for any medicine named in the search terms."""
    names = list(dict.fromkeys(DRUG_NAME_ALIASES.get(w, w) for w in _search_words(term)))
    async with aiohttp.ClientSession(timeout=HTTP_TIMEOUT) as http:
        labels = await asyncio.gather(*(_drug_label(http, n) for n in names), return_exceptions=True)
    return [label for label in labels if isinstance(label, tuple)][:limit]


async def _drug_label(http: aiohttp.ClientSession, name: str) -> tuple[Source, str] | None:
    # Generic names only: brand names like "Diarrhea Relief" match symptoms, not medicines.
    query = f'openfda.generic_name:"{name}"'
    url = f"{OPENFDA_LABEL_URL}?search={quote(query, safe=':+')}&limit=5"
    async with http.get(url) as resp:
        if resp.status == 404:  # openFDA's "no matches"
            return None
        resp.raise_for_status()
        results = (await resp.json()).get("results") or []
    if not results:
        return None
    # Prefer an adult product; children's labels lead with children's doses.
    def brand(r: dict) -> str:
        return " ".join(r.get("openfda", {}).get("brand_name", [])).lower()

    def names_drug(r: dict) -> bool:
        # Skip combination and homeopathic products: the drug must be one of at most two ingredients.
        generic = " ".join(r.get("openfda", {}).get("generic_name", [])).lower()
        ingredients = [i.strip() for i in re.split(r",| and ", generic) if i.strip()]
        return 0 < len(ingredients) <= 2 and any(i.split()[0] == name for i in ingredients)

    matches = [r for r in results if names_drug(r)]
    if not matches:
        return None
    label = next((r for r in matches if not re.search(r"child|infant|junior|kid", brand(r))), matches[0])
    sections = [_strip_html(label[k][0]) for k in DRUG_LABEL_SECTIONS if label.get(k)]
    if not sections or not label.get("set_id"):
        return None
    generic = (label.get("openfda", {}).get("generic_name") or [name])[0].title()
    source = Source(title=f"{generic} drug label (FDA, DailyMed)", url=DAILYMED_URL + label["set_id"])
    return source, " ".join(sections)[:3000]


def _search_words(term: str) -> list[str]:
    """Split search terms into words worth searching on their own."""
    words = re.findall(r"[a-zA-Z][a-zA-Z-]{3,}", term.lower())
    return list(dict.fromkeys(w for w in words if w not in _STOP_WORDS))[:4]


_STOP_WORDS = {"with", "from", "safe", "safety", "take", "taking", "dose", "dosage", "during", "after", "treatment", "symptoms", "medicine", "medication"}


async def _resolve_redirects(raw: list[tuple[str, str]]) -> list[Source]:
    """Google grounding returns redirect links; follow them to the real page URL."""

    async def resolve(http: aiohttp.ClientSession, title: str, uri: str) -> Source:
        try:
            async with http.get(uri, allow_redirects=True) as resp:
                return Source(title=title or str(resp.url.host), url=str(resp.url))
        except Exception:
            return Source(title=title, url=uri)

    async with aiohttp.ClientSession(timeout=HTTP_TIMEOUT) as http:
        resolved = await asyncio.gather(*(resolve(http, t, u) for t, u in raw))

    seen: set[str] = set()
    unique = []
    for s in resolved:
        if s.url not in seen:
            seen.add(s.url)
            unique.append(s)
    return unique


def _strip_html(text: str) -> str:
    text = re.sub(r"<[^>]+>", " ", html.unescape(text))
    return re.sub(r"\s+", " ", text).strip()


def format_sources_markdown(result: LookupResult) -> str:
    lines = ["**Sources Saathi checked:**"]
    lines += [f"- [{s.title}]({s.url})" for s in result.sources]
    return "\n".join(lines)
