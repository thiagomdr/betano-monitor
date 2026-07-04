from __future__ import annotations

from typing import Any

# Nomes oficiais do endpoint /fixtures/statistics (API-Football)
STAT_SHOTS_ON = "Shots on Goal"
STAT_SHOTS_TOTAL = "Total Shots"
STAT_CORNERS = "Corner Kicks"
STAT_GOAL_KICKS = "Goal Kicks"
STAT_POSSESSION = "Ball Possession"
STAT_SAVES = "Goalkeeper Saves"


def _to_int(value: Any) -> int | None:
    if value is None:
        return None
    if isinstance(value, str):
        value = value.strip().rstrip("%")
        if not value:
            return None
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return None


def minute_from_fixture(item: dict[str, Any]) -> int | None:
    fixture = item.get("fixture")
    if not isinstance(fixture, dict):
        return None
    status = fixture.get("status")
    if not isinstance(status, dict):
        return None
    return _to_int(status.get("elapsed"))


def injury_time_from_fixture(item: dict[str, Any]) -> int | None:
    fixture = item.get("fixture")
    if not isinstance(fixture, dict):
        return None
    status = fixture.get("status")
    if not isinstance(status, dict):
        return None
    return _to_int(status.get("extra"))


def score_from_fixture(item: dict[str, Any]) -> tuple[int | None, int | None]:
    goals = item.get("goals")
    if not isinstance(goals, dict):
        return None, None
    return _to_int(goals.get("home")), _to_int(goals.get("away"))


def _stats_map(team_block: dict[str, Any]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    stats = team_block.get("statistics")
    if not isinstance(stats, list):
        return out
    for row in stats:
        if not isinstance(row, dict):
            continue
        typ = row.get("type")
        if typ:
            out[str(typ)] = row.get("value")
    return out


def parse_team_stats(stats_response: list[dict[str, Any]]) -> dict[str, dict[str, int | None]]:
    """Retorna home/away com chutes a gol, escanteios, tiros de meta (se houver)."""
    result = {
        "home": {
            "shots_on_target": None,
            "shots_total": None,
            "corners": None,
            "goal_kicks": None,
            "possession": None,
            "saves": None,
        },
        "away": {
            "shots_on_target": None,
            "shots_total": None,
            "corners": None,
            "goal_kicks": None,
            "possession": None,
            "saves": None,
        },
    }
    if len(stats_response) < 2:
        # tenta mapear pelo que vier
        for idx, block in enumerate(stats_response[:2]):
            side = "home" if idx == 0 else "away"
            smap = _stats_map(block)
            result[side] = {
                "shots_on_target": _to_int(smap.get(STAT_SHOTS_ON)),
                "shots_total": _to_int(smap.get(STAT_SHOTS_TOTAL)),
                "corners": _to_int(smap.get(STAT_CORNERS)),
                "goal_kicks": _to_int(smap.get(STAT_GOAL_KICKS)),
                "possession": _to_int(smap.get(STAT_POSSESSION)),
                "saves": _to_int(smap.get(STAT_SAVES)),
            }
        return result

    # API devolve home primeiro, depois away (ordem do fixture)
    for idx, side in enumerate(("home", "away")):
        smap = _stats_map(stats_response[idx])
        result[side] = {
            "shots_on_target": _to_int(smap.get(STAT_SHOTS_ON)),
            "shots_total": _to_int(smap.get(STAT_SHOTS_TOTAL)),
            "corners": _to_int(smap.get(STAT_CORNERS)),
            "goal_kicks": _to_int(smap.get(STAT_GOAL_KICKS)),
            "possession": _to_int(smap.get(STAT_POSSESSION)),
            "saves": _to_int(smap.get(STAT_SAVES)),
        }
    return result


def maintain_score_signal(
    *,
    minute: int | None,
    home_score: int | None,
    away_score: int | None,
    home_stats: dict[str, int | None],
    away_stats: dict[str, int | None],
) -> str:
    if minute is None or minute < 85:
        return "fora da janela"
    if home_score is None or away_score is None:
        return "sem placar"

    if home_score > away_score:
        leader, trailer = "casa", "fora"
        trailer_stats = away_stats
        leader_stats = home_stats
    elif away_score > home_score:
        leader, trailer = "fora", "casa"
        trailer_stats = home_stats
        leader_stats = away_stats
    else:
        leader, trailer = "empate", "ambos"
        # no empate, pressao = soma dos dois
        shots = (home_stats.get("shots_on_target") or 0) + (away_stats.get("shots_on_target") or 0)
        corners = (home_stats.get("corners") or 0) + (away_stats.get("corners") or 0)
        pressure = shots * 2 + corners
        if pressure <= 8:
            return f"manter empate · pressao baixa (SOT {shots}, esc {corners})"
        if pressure <= 16:
            return f"manter empate · pressao media (SOT {shots}, esc {corners})"
        return f"manter empate · pressao alta (SOT {shots}, esc {corners})"

    t_sot = trailer_stats.get("shots_on_target") or 0
    t_corners = trailer_stats.get("corners") or 0
    l_sot = leader_stats.get("shots_on_target") or 0
    pressure = t_sot * 2 + t_corners

    if pressure <= 4:
        risk = "pressao baixa no lider"
    elif pressure <= 10:
        risk = "pressao media no lider"
    else:
        risk = "pressao alta no lider"

    return (
        f"manter placar ({leader}) · {risk} "
        f"(perdedor SOT {t_sot}/esc {t_corners} · lider SOT {l_sot})"
    )


def build_row(
    item: dict[str, Any],
    stats_response: list[dict[str, Any]] | None,
    *,
    min_minute: int = 85,
) -> dict[str, Any] | None:
    minute = minute_from_fixture(item)
    if minute is None or minute < min_minute:
        return None

    fixture = item.get("fixture") if isinstance(item.get("fixture"), dict) else {}
    league = item.get("league") if isinstance(item.get("league"), dict) else {}
    teams = item.get("teams") if isinstance(item.get("teams"), dict) else {}
    home_team = teams.get("home") if isinstance(teams.get("home"), dict) else {}
    away_team = teams.get("away") if isinstance(teams.get("away"), dict) else {}
    home_score, away_score = score_from_fixture(item)

    team_stats = parse_team_stats(stats_response or [])
    home_stats = team_stats["home"]
    away_stats = team_stats["away"]

    return {
        "fixture_id": fixture.get("id"),
        "home": home_team.get("name"),
        "away": away_team.get("name"),
        "league": league.get("name"),
        "country": league.get("country"),
        "minute": minute,
        "injury_time": injury_time_from_fixture(item),
        "status": (fixture.get("status") or {}).get("short")
        if isinstance(fixture.get("status"), dict)
        else None,
        "home_score": home_score,
        "away_score": away_score,
        "score": (
            f"{home_score}-{away_score}"
            if home_score is not None and away_score is not None
            else "—"
        ),
        "home_shots_on_target": home_stats.get("shots_on_target"),
        "away_shots_on_target": away_stats.get("shots_on_target"),
        "home_shots_total": home_stats.get("shots_total"),
        "away_shots_total": away_stats.get("shots_total"),
        "home_corners": home_stats.get("corners"),
        "away_corners": away_stats.get("corners"),
        "home_goal_kicks": home_stats.get("goal_kicks"),
        "away_goal_kicks": away_stats.get("goal_kicks"),
        "home_possession": home_stats.get("possession"),
        "away_possession": away_stats.get("possession"),
        "signal": maintain_score_signal(
            minute=minute,
            home_score=home_score,
            away_score=away_score,
            home_stats=home_stats,
            away_stats=away_stats,
        ),
        "betano_hint": "Conferir odd de manter placar / sem mais gols na Betano",
    }
