from __future__ import annotations

import json
import logging
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from typing import Any

from src.casinoscores.parsers import parse_item
from src.casinoscores.slug import api_base_url, api_slug_from_page_slug, page_slug_from_url

logger = logging.getLogger(__name__)

API_USER_AGENT = "casinoscores-monitor/1.0"
DEFAULT_PAGE_SIZE = 200
DEFAULT_DURATION_MINUTES = 4320  # 72h — máximo usual da API


def _api_get_json(url: str, *, timeout: int = 90) -> Any:
    request = urllib.request.Request(
        url,
        headers={"Accept": "application/json", "User-Agent": API_USER_AGENT},
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def _build_page_url(
    api_base: str,
    *,
    page: int,
    size: int,
    duration_minutes: int,
) -> str:
    params = urllib.parse.urlencode(
        {
            "page": page,
            "size": size,
            "sort": "data.settledAt,desc",
            "duration": duration_minutes,
        }
    )
    return f"{api_base}?{params}"


def fetch_all_rows(
    page_url: str,
    *,
    duration_minutes: int = DEFAULT_DURATION_MINUTES,
    page_size: int = DEFAULT_PAGE_SIZE,
) -> dict[str, Any]:
    page_slug = page_slug_from_url(page_url)
    api_slug = api_slug_from_page_slug(page_slug)
    api_base = api_base_url(page_url)

    by_id: dict[str, dict[str, Any]] = {}
    page = 0

    while True:
        url = _build_page_url(
            api_base,
            page=page,
            size=page_size,
            duration_minutes=duration_minutes,
        )
        payload = _api_get_json(url)
        if not isinstance(payload, list):
            raise ValueError(f"Resposta inesperada da API: {type(payload)}")

        if not payload:
            break

        for item in payload:
            if not isinstance(item, dict):
                continue
            row = parse_item(item, api_slug=api_slug)
            if row:
                by_id[row["round_id"]] = row

        logger.info("Pagina %s: %s itens (%s unicos)", page, len(payload), len(by_id))

        if len(payload) < page_size:
            break
        page += 1

    rows = sorted(
        by_id.values(),
        key=lambda r: r.get("finalized_at") or "",
        reverse=True,
    )

    display_name = page_slug.replace("-", " ").title()

    return {
        "game": display_name,
        "page_slug": page_slug,
        "api_slug": api_slug,
        "source_url": page_url.strip(),
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "duration_minutes": duration_minutes,
        "total": len(rows),
        "rows": rows,
    }
