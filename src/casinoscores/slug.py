from __future__ import annotations

import re
from urllib.parse import urlparse

API_BASE = "https://api-cs.casino.org/svc-evolution-game-events/api"

# Slugs conhecidos onde o path da página ≠ slug da API
_SLUG_OVERRIDES = {
    "mega-sic-bo": "megasicbo",
    "lightning-storm": "lightningstorm",
    "lightning-roulette": "lightningroulette",
    "crazy-time": "crazytime",
    "crazy-time-a": "crazytimea",
    "monopoly-live": "monopolylive",
    "dream-catcher": "dreamcatcher",
    "ice-fishing": "icefishing",
    "sweet-bonanza-candyland": "sweetbonanza",
}


def page_slug_from_url(url: str) -> str:
    path = urlparse(url.strip()).path.rstrip("/")
    segment = path.split("/")[-1] if path else ""
    if not segment:
        raise ValueError(f"URL sem slug de jogo: {url}")
    return segment.lower()


def api_slug_from_page_slug(page_slug: str) -> str:
    normalized = page_slug.lower().strip()
    if normalized in _SLUG_OVERRIDES:
        return _SLUG_OVERRIDES[normalized]
    return re.sub(r"[^a-z0-9]", "", normalized)


def api_base_url(page_url: str) -> str:
    page_slug = page_slug_from_url(page_url)
    api_slug = api_slug_from_page_slug(page_slug)
    return f"{API_BASE}/{api_slug}"
