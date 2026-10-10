"""Look up medical guidance on the web and return a short answer with real sources.

Two providers, tried in order:

1. Gemini with Google Search grounding. Broadest coverage, but the Gemini API
   only allows it on keys with billing enabled. A failure disables it for a
   while so every lookup doesn't pay for a doomed request.
2. MedlinePlus (US National Library of Medicine). Free, no key. Gemini answers
   the question using only the MedlinePlus pages that matched.
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

import aiohttp
from pydantic import BaseModel
from google import genai
from google.genai import types

logger = logging.getLogger("saathi.medical_search")

ANSWER_MODEL = os.getenv("SAATHI_SEARCH_MODEL", "gemini-flash-latest")
GOOGLE_SEARCH_RETRY_SECONDS = 600
# Keep lookups short: the patient is waiting on a live call.
GEMINI_TIMEOUT_SECONDS = 12
MEDLINEPLUS_URL = "https://wsearch.nlm.nih.gov/ws/query"
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

    async def _generate(self, **kwargs) -> types.GenerateContentResponse:
        return await asyncio.wait_for(
            self._client.aio.models.generate_content(model=ANSWER_MODEL, **kwargs),
            timeout=GEMINI_TIMEOUT_SECONDS,
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
        topics = await _search_medlineplus(keywords or question)
        if not topics:
            return LookupResult(
                answer="No matching reference pages were found. Rely on clinical judgement "
                "and advise an in-person doctor if unsure.",
                provider="medlineplus",
            )

        excerpts = "\n\n".join(
            f"[{i}] {t.title} ({t.url})\n{summary}" for i, (t, summary) in enumerate(topics, 1)
        )
        prompt = (
            f"Question: {question}\n\nAnswer using only these MedlinePlus excerpts. "
            "If they don't cover it, say so. In used_excerpts, list the numbers of the "
            f"excerpts your answer actually relies on.\n\n{excerpts}"
        )
        try:
            response = await self._generate(
                contents=prompt,
                config=types.GenerateContentConfig(
                    system_instruction=ANSWER_INSTRUCTIONS,
                    response_mime_type="application/json",
                    response_schema=_GroundedAnswer,
                ),
            )
            parsed = _GroundedAnswer.model_validate_json(response.text or "{}")
            answer = parsed.answer.strip()
            used = [topics[i - 1][0] for i in dict.fromkeys(parsed.used_excerpts) if 1 <= i <= len(topics)]
        except Exception as e:
            logger.warning("summarising MedlinePlus excerpts failed: %r", e)
            answer = "\n\n".join(f"{t.title}: {s[:600]}" for t, s in topics)
            used = [t for t, _ in topics]
        return LookupResult(answer=answer, sources=used, provider="medlineplus")


async def _search_medlineplus(term: str, limit: int = 3) -> list[tuple[Source, str]]:
    params = {"db": "healthTopics", "term": term, "retmax": str(limit)}
    async with aiohttp.ClientSession(timeout=HTTP_TIMEOUT) as http:
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
