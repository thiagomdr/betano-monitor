"""Baixa jogos de futebol ao vivo com estatisticas (API-Football) e grava JSON do painel.

Uso:
  python scripts/fetch_football_live.py
  python scripts/fetch_football_live.py --min-minute 85 --max-stats 15

Requer API_FOOTBALL_KEY no ambiente ou no arquivo .env
(cadastro gratuito: https://www.api-football.com/)

Odds: conferir manualmente na Betano (este feed nao traz odds).
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from src.football.analyze import build_row, minute_from_fixture
from src.football.api_football import fetch_fixture_statistics, fetch_live_fixtures, load_api_key

WEB_DATA = ROOT / "web" / "data"
GAME_CONFIG = ROOT / "web" / "game.json"
OUT_FILE = WEB_DATA / "football-live.json"


def main() -> None:
    parser = argparse.ArgumentParser(description="Futebol live API-Football (stats 85'+)")
    parser.add_argument("--min-minute", type=int, default=85, help="Minuto minimo (padrao 85)")
    parser.add_argument(
        "--max-stats",
        type=int,
        default=15,
        help="Maximo de jogos para buscar estatisticas (plano free ~100 req/dia)",
    )
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(message)s")

    api_key = load_api_key(ROOT / ".env")
    if not api_key:
        raise SystemExit(
            "API_FOOTBALL_KEY ausente. Crie a key gratuita em https://www.api-football.com/\n"
            "e coloque no .env:\n"
            "API_FOOTBALL_KEY=sua_chave"
        )

    fixtures = fetch_live_fixtures(api_key)
    logging.info("Jogos live: %s", len(fixtures))

    candidates = []
    for item in fixtures:
        minute = minute_from_fixture(item)
        if minute is not None and minute >= args.min_minute:
            candidates.append(item)

    candidates.sort(key=lambda it: -(minute_from_fixture(it) or 0))
    logging.info("Com minuto >= %s: %s", args.min_minute, len(candidates))

    rows = []
    stats_calls = 0
    for item in candidates[: args.max_stats]:
        fixture = item.get("fixture") if isinstance(item.get("fixture"), dict) else {}
        fixture_id = fixture.get("id")
        stats = []
        if fixture_id is not None:
            stats = fetch_fixture_statistics(api_key, fixture_id)
            stats_calls += 1
            logging.info("Stats fixture %s ok", fixture_id)
        row = build_row(item, stats, min_minute=args.min_minute)
        if row:
            rows.append(row)

    # jogos alem do limite de stats: ainda listar sem numeros
    for item in candidates[args.max_stats :]:
        row = build_row(item, None, min_minute=args.min_minute)
        if row:
            row["signal"] = (row.get("signal") or "") + " · stats nao buscadas (limite)"
            rows.append(row)

    payload = {
        "source": "api-football",
        "bookmaker": "Betano (odds manuais no site)",
        "min_minute": args.min_minute,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "live_total": len(fixtures),
        "candidates": len(candidates),
        "stats_calls": stats_calls,
        "total": len(rows),
        "notes": [
            "Stats: chutes a gol, escanteios; tiros de meta so se a liga fornecer.",
            "Odds: abrir a partida na Betano e conferir manter placar / sem mais gols.",
            "Plano free API-Football: ~100 requests/dia — use com moderacao.",
        ],
        "rows": rows,
    }

    WEB_DATA.mkdir(parents=True, exist_ok=True)
    OUT_FILE.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    GAME_CONFIG.write_text(
        json.dumps(
            {
                "name": "Futebol Live · Manter Placar (85'+)",
                "sourceUrl": "https://www.api-football.com/",
                "dataFile": "data/football-live.json",
                "mode": "football-live",
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    print(f"OK: {payload['total']} jogos >= {args.min_minute}' -> {OUT_FILE.relative_to(ROOT)}")
    print(f"Stats buscadas: {stats_calls} requests extras")
    print(f"Config: {GAME_CONFIG.relative_to(ROOT)}")
    print("Abra o painel: powershell -File scripts/serve-monitor.ps1")


if __name__ == "__main__":
    main()
