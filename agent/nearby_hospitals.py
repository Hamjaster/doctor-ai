"""Find hospitals near the patient, nearest first, with directions links.

Three providers, tried in order:

1. Google Places (Nearby Search), when GOOGLE_MAPS_API_KEY is set. Needs the
   Places API (New) enabled on that key; AI Studio Gemini keys don't work.
2. OpenStreetMap through Nominatim. Free, no key, fast, coverage varies by area.
3. OpenStreetMap through the public Overpass API. Free, no key, often busy.

The patient's position comes from their browser. Without it, a place name the
patient says ("Gulberg, Lahore") is turned into coordinates with OpenStreetMap
Nominatim.
"""

from __future__ import annotations

import logging
import math
import os
import re
from dataclasses import dataclass

import aiohttp

logger = logging.getLogger("saathi.nearby_hospitals")

PLACES_URL = "https://places.googleapis.com/v1/places:searchNearby"
PLACES_FIELDS = ",".join(
    f"places.{f}"
    for f in (
        "displayName",
        "formattedAddress",
        "location",
        "nationalPhoneNumber",
        "currentOpeningHours.openNow",
        "googleMapsUri",
    )
)
OVERPASS_URL = "https://overpass-api.de/api/interpreter"
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
# OpenStreetMap's usage policy asks for an identifying User-Agent.
USER_AGENT = "doctor.ai/0.1 (nearby hospital lookup)"
SEARCH_RADIUS_METRES = 15_000
# Nominatim returns up to 50 matches in a box, not sorted by distance. Search a small box
# first so a dense city's nearest hospitals aren't crowded out, and widen if it's too few.
NOMINATIM_BOX_DEGREES = (0.03, 0.14)  # half-widths, about 3 km and 15 km
MAX_RESULTS = 5
# Keep lookups short: the patient may be in an emergency.
HTTP_TIMEOUT = aiohttp.ClientTimeout(total=8)


@dataclass
class Hospital:
    name: str
    lat: float
    lng: float
    distance_km: float
    address: str = ""
    phone: str = ""
    open_now: bool | None = None
    emergency: bool | None = None

    @property
    def directions_url(self) -> str:
        return f"https://www.google.com/maps/dir/?api=1&destination={self.lat},{self.lng}"


@dataclass
class HospitalResult:
    hospitals: list[Hospital]
    provider: str
    near: str


def parse_location(value: str) -> tuple[float, float] | None:
    """Parse the `saathi.location` attribute: "lat,lng" or "lat,lng,accuracy"."""
    try:
        lat, lng = (float(p) for p in value.split(",")[:2])
    except ValueError:
        return None
    if not (-90 <= lat <= 90 and -180 <= lng <= 180):
        return None
    return lat, lng


async def geocode(place: str) -> tuple[float, float] | None:
    params = {"q": place, "format": "json", "limit": "1"}
    try:
        async with aiohttp.ClientSession(
            timeout=HTTP_TIMEOUT, headers={"User-Agent": USER_AGENT}
        ) as http:
            async with http.get(NOMINATIM_URL, params=params) as resp:
                resp.raise_for_status()
                hits = await resp.json()
    except Exception as e:
        logger.warning("geocoding %r failed: %r", place, e)
        return None
    if not hits:
        return None
    return float(hits[0]["lat"]), float(hits[0]["lon"])


async def find_hospitals(lat: float, lng: float, near: str) -> HospitalResult:
    if os.getenv("GOOGLE_MAPS_API_KEY"):
        try:
            hospitals = await _google_places(lat, lng)
            if hospitals:
                return HospitalResult(hospitals, "google_places", near)
        except Exception as e:
            logger.warning("Google Places failed, falling back to OpenStreetMap: %r", e)
    for provider, search in (("nominatim", _nominatim), ("overpass", _overpass)):
        try:
            hospitals = await search(lat, lng)
            if hospitals:
                return HospitalResult(hospitals, provider, near)
        except Exception as e:
            logger.warning("%s lookup failed: %r", provider, e)
    return HospitalResult([], "none", near)


async def _google_places(lat: float, lng: float) -> list[Hospital]:
    body = {
        "includedTypes": ["hospital"],
        "maxResultCount": MAX_RESULTS,
        "rankPreference": "DISTANCE",
        "locationRestriction": {
            "circle": {
                "center": {"latitude": lat, "longitude": lng},
                "radius": float(SEARCH_RADIUS_METRES),
            }
        },
    }
    headers = {
        "X-Goog-Api-Key": os.environ["GOOGLE_MAPS_API_KEY"],
        "X-Goog-FieldMask": PLACES_FIELDS,
    }
    async with aiohttp.ClientSession(timeout=HTTP_TIMEOUT) as http:
        async with http.post(PLACES_URL, json=body, headers=headers) as resp:
            if resp.status != 200:
                raise RuntimeError(f"HTTP {resp.status}: {(await resp.text())[:200]}")
            data = await resp.json()

    hospitals = []
    for p in data.get("places", []):
        loc = p.get("location", {})
        if "latitude" not in loc:
            continue
        h_lat, h_lng = loc["latitude"], loc["longitude"]
        hospitals.append(
            Hospital(
                name=p.get("displayName", {}).get("text", "Hospital"),
                lat=h_lat,
                lng=h_lng,
                distance_km=_distance_km(lat, lng, h_lat, h_lng),
                address=p.get("formattedAddress", ""),
                phone=p.get("nationalPhoneNumber", ""),
                open_now=p.get("currentOpeningHours", {}).get("openNow"),
            )
        )
    return sorted(hospitals, key=lambda h: h.distance_km)[:MAX_RESULTS]


async def _nominatim(lat: float, lng: float) -> list[Hospital]:
    hospitals: list[Hospital] = []
    async with aiohttp.ClientSession(
        timeout=HTTP_TIMEOUT, headers={"User-Agent": USER_AGENT}
    ) as http:
        for half in NOMINATIM_BOX_DEGREES:
            params = {
                "amenity": "hospital",
                "format": "jsonv2",
                "limit": "50",
                "bounded": "1",
                "extratags": "1",
                "viewbox": f"{lng - half},{lat + half},{lng + half},{lat - half}",
            }
            async with http.get(NOMINATIM_URL, params=params) as resp:
                resp.raise_for_status()
                hits = await resp.json()
            hospitals = [_from_osm(lat, lng, h, float(h["lat"]), float(h["lon"])) for h in hits]
            hospitals = [h for h in hospitals if h.name]
            if len(hospitals) >= MAX_RESULTS:
                break
    return _nearest(hospitals)


def _from_osm(lat: float, lng: float, hit: dict, h_lat: float, h_lng: float) -> Hospital:
    tags = hit.get("extratags") or {}
    emergency = tags.get("emergency")
    return Hospital(
        name=(hit.get("name") or "").strip(),
        lat=h_lat,
        lng=h_lng,
        distance_km=_distance_km(lat, lng, h_lat, h_lng),
        # display_name runs from the place itself out to the country; keep the local part.
        address=", ".join(hit.get("display_name", "").split(", ")[1:4]),
        phone=tags.get("phone") or tags.get("contact:phone", ""),
        emergency=None if emergency is None else emergency == "yes",
    )


# OpenStreetMap tags clinics, labs and single-specialty hospitals as hospitals too. They
# can't take an emergency, so they go after general hospitals.
NOT_FOR_EMERGENCIES = re.compile(
    r"\b(eye|dental|opd|lab|laboratory|rehabilitation|handicapped|physiotherapy|skin|"
    r"fertility|ivf|diagnostic|imaging|x-?ray|blood bank)\b",
    re.IGNORECASE,
)


def _nearest(hospitals: list[Hospital]) -> list[Hospital]:
    def unsuitable(h: Hospital) -> bool:
        return h.emergency is False or (not h.emergency and bool(NOT_FOR_EMERGENCIES.search(h.name)))

    hospitals.sort(key=lambda h: (unsuitable(h), h.distance_km))
    return hospitals[:MAX_RESULTS]


async def _overpass(lat: float, lng: float) -> list[Hospital]:
    query = (
        "[out:json][timeout:8];"
        f'nwr["amenity"="hospital"](around:{SEARCH_RADIUS_METRES},{lat},{lng});'
        "out center tags 40;"
    )
    async with aiohttp.ClientSession(
        timeout=HTTP_TIMEOUT, headers={"User-Agent": USER_AGENT}
    ) as http:
        async with http.post(OVERPASS_URL, data={"data": query}) as resp:
            resp.raise_for_status()
            data = await resp.json(content_type=None)

    hospitals = []
    for el in data.get("elements", []):
        tags = el.get("tags", {})
        h_lat = el.get("lat") or el.get("center", {}).get("lat")
        h_lng = el.get("lon") or el.get("center", {}).get("lon")
        if h_lat is None or h_lng is None or not tags.get("name"):
            continue
        address = ", ".join(
            tags[k] for k in ("addr:street", "addr:suburb", "addr:city") if tags.get(k)
        )
        emergency = tags.get("emergency")
        hospitals.append(
            Hospital(
                name=(tags.get("name:en") or tags["name"]).strip(),
                lat=h_lat,
                lng=h_lng,
                distance_km=_distance_km(lat, lng, h_lat, h_lng),
                address=address,
                phone=tags.get("phone") or tags.get("contact:phone", ""),
                emergency=None if emergency is None else emergency == "yes",
            )
        )
    return _nearest(hospitals)


def _distance_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(a))


def _details(h: Hospital) -> str:
    bits = [f"{h.distance_km:.1f} km away"]
    if h.emergency:
        bits.append("has an emergency department")
    if h.open_now is not None:
        bits.append("open now" if h.open_now else "may be closed now")
    if h.phone:
        bits.append(f"phone {h.phone}")
    return ", ".join(bits)


def format_hospitals_markdown(result: HospitalResult) -> str:
    lines = ["**Hospitals near you:**"]
    lines += [
        f"- [{h.name}]({h.directions_url}): {_details(h)}" for h in result.hospitals
    ]
    return "\n".join(lines)


def describe_for_agent(result: HospitalResult) -> str:
    lines = []
    for i, h in enumerate(result.hospitals, 1):
        where = f", {h.address}" if h.address else ""
        lines.append(f"{i}. {h.name}{where} ({_details(h)})")
    return "\n".join(lines)
