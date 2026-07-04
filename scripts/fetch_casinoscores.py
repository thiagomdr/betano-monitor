"""Baixa resultados CasinoScores e grava JSON para o painel local.

Uso:
  python scripts/fetch_casinoscores.py "https://www.casino.org/casinoscores/pt-br/sweet-bonanza-candyland/"
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from src.casinoscores.fetch import DEFAULT_DURATION_MINUTES, fetch_all_rows
from src.casinoscores.slug import page_slug_from_url

WEB_DATA = ROOT / "web" / "data"
GAME_CONFIG = ROOT / "web" / "game.json"


def main() -> None:
    parser = argparse.ArgumentParser(description="Download CasinoScores → JSON local")
    parser.add_argument("url", help="URL da página CasinoScores do jogo")
    parser.add_argument(
        "--duration",
        type=int,
        default=DEFAULT_DURATION_MINUTES,
        help="Janela em minutos (padrao 4320 = 72h)",
    )
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(message)s")

    payload = fetch_all_rows(args.url, duration_minutes=args.duration)

    page_slug = page_slug_from_url(args.url)
    WEB_DATA.mkdir(parents=True, exist_ok=True)
    out_path = WEB_DATA / f"{page_slug}.json"
    out_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    game_config = {
        "name": payload["game"],
        "sourceUrl": args.url.strip(),
        "dataFile": f"data/{page_slug}.json",
    }
    GAME_CONFIG.write_text(
        json.dumps(game_config, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print(f"OK: {payload['total']} resultados -> {out_path.relative_to(ROOT)}")
    print(f"Config: {GAME_CONFIG.relative_to(ROOT)}")
    print("Abra o painel: powershell -File scripts/serve-monitor.ps1")


if __name__ == "__main__":
    main()
