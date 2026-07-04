from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

API_BASE = "https://v3.football.api-sports.io"
USER_AGENT = "betano-monitor-football/1.0"


def load_api_key(env_path: Path | None = None) -> str:
    for name in ("API_FOOTBALL_KEY", "APISPORTS_KEY"):
        key = os.environ.get(name, "").strip()
        if key:
            return key

    if env_path is None:
        env_path = Path(__file__).resolve().parents[2] / ".env"
    if env_path.is_file():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            name, value = line.split("=", 1)
            if name.strip() in {"API_FOOTBALL_KEY", "APISPORTS_KEY"}:
                return value.strip().strip('"').strip("'")
    return ""


def _get_json(path: str, params: dict[str, Any], api_key: str, *, timeout: int = 60) -> Any:
    query = urllib.parse.urlencode({k: v for k, v in params.items() if v is not None})
    url = f"{API_BASE}{path}"
    if query:
        url = f"{url}?{query}"
    request = urllib.request.Request(
        url,
        headers={
            "Accept": "application/json",
            "User-Agent": USER_AGENT,
            "x-apisports-key": api_key,
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"API-Football HTTP {exc.code}: {body[:300]}") from exc


def fetch_live_fixtures(api_key: str) -> list[dict[str, Any]]:
    payload = _get_json("/fixtures", {"live": "all"}, api_key)
    response = payload.get("response") if isinstance(payload, dict) else None
    if not isinstance(response, list):
        raise ValueError(f"Resposta inesperada em /fixtures?live=all: {type(response)}")
    return [item for item in response if isinstance(item, dict)]


def fetch_fixture_statistics(api_key: str, fixture_id: int | str) -> list[dict[str, Any]]:
    payload = _get_json("/fixtures/statistics", {"fixture": fixture_id}, api_key)
    response = payload.get("response") if isinstance(payload, dict) else None
    if not isinstance(response, list):
        return []
    return [item for item in response if isinstance(item, dict)]
