from __future__ import annotations

from typing import Any

BONUS_OUTCOMES = frozenset(
    {"MonsterMash", "Fireball", "HotSpot", "BatteryCharger", "StormBonus"}
)

OUTCOME_LABELS = {
    "EvoLeaf": "Folha",
    "MonsterMash": "Monster Mash",
    "Fireball": "Fireball",
    "HotSpot": "Hot Spot",
    "BatteryCharger": "Battery Charger",
    "StormBonus": "Lightning Storm",
    "Leaf1": "Folha 1",
    "Leaf2": "Folha 2",
    "LilBlues": "Lil Blues",
    "BigOranges": "Big Oranges",
    "Bubble Surprise": "Bubble Surprise",
    "Candy Drop": "Candy Drop",
    "Sweet Spins": "Sweet Spins",
}


def _to_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _extract_wheel_context(result: dict[str, Any]) -> tuple[dict[str, Any], float | None] | None:
    outcome = result.get("outcome")
    if isinstance(outcome, dict) and isinstance(outcome.get("wheelResult"), dict):
        return outcome["wheelResult"], _to_float(outcome.get("maxMultiplier"))

    wheel = result.get("wheelResult")
    if isinstance(wheel, dict):
        return wheel, _to_float(wheel.get("maxMultiplier"))

    return None


def parse_wheel_item(item: dict[str, Any]) -> dict[str, Any] | None:
    data = item.get("data")
    if not isinstance(data, dict):
        return None

    result = data.get("result")
    if not isinstance(result, dict):
        return None

    extracted = _extract_wheel_context(result)
    if not extracted:
        return None

    wheel, outcome_multiplier = extracted

    sector_raw = wheel.get("wheelSector")
    round_id = data.get("id") or item.get("id")
    if not round_id:
        return None

    bonus = wheel.get("bonusRound")
    wheel_type = str(wheel.get("type") or "")
    max_multiplier = outcome_multiplier if outcome_multiplier is not None else _to_float(
        wheel.get("maxMultiplier")
    )

    if wheel_type == "WinningNumber" and isinstance(sector_raw, str):
        label = sector_raw
        if wheel.get("isSugarbomb"):
            bomb = wheel.get("sugarbombMultiplier")
            label = f"{sector_raw} · Sugar Bomb" + (f" ×{bomb}" if bomb else "")
        return {
            "round_id": str(round_id),
            "sector": sector_raw,
            "outcome": sector_raw,
            "outcome_label": label,
            "is_bonus": False,
            "max_multiplier": max_multiplier,
            "finalized_at": data.get("settledAt"),
        }

    if wheel_type == "BonusRound" and isinstance(sector_raw, str):
        bonus_sector = str(wheel.get("bonusWheelSector") or sector_raw)
        label = OUTCOME_LABELS.get(bonus_sector, bonus_sector)
        if bonus_sector != sector_raw and sector_raw == "Bubble Surprise":
            label = f"Bubble Surprise -> {label}"
        return {
            "round_id": str(round_id),
            "sector": sector_raw,
            "outcome": bonus_sector,
            "outcome_label": label,
            "is_bonus": True,
            "max_multiplier": max_multiplier,
            "finalized_at": data.get("settledAt"),
        }

    if isinstance(sector_raw, dict):
        outcome = str(sector_raw.get("outcome") or "")
        sector = str(sector_raw.get("type") or "")
        is_bonus = outcome in BONUS_OUTCOMES or isinstance(bonus, dict)
        label = OUTCOME_LABELS.get(outcome, outcome)
    elif isinstance(sector_raw, str):
        sector_name = sector_raw
        sector_id = wheel.get("sectorId")
        sector = str(sector_id) if sector_id is not None else sector_name
        if wheel_type == "Bonus":
            outcome = sector_name
            is_bonus = True
            label = OUTCOME_LABELS.get(sector_name, sector_name)
        else:
            outcome = wheel_type or sector_name
            is_bonus = False
            leaf_label = OUTCOME_LABELS.get(sector_name, sector_name)
            label = OUTCOME_LABELS.get(outcome, outcome) if outcome == sector_name else leaf_label
    else:
        return None

    return {
        "round_id": str(round_id),
        "sector": sector,
        "outcome": outcome,
        "outcome_label": label,
        "is_bonus": is_bonus,
        "max_multiplier": max_multiplier,
        "finalized_at": data.get("settledAt"),
    }


def parse_dice_item(item: dict[str, Any]) -> dict[str, Any] | None:
    data = item.get("data")
    if not isinstance(data, dict):
        return None

    result = data.get("result")
    if not isinstance(result, dict):
        return None

    round_id = data.get("id") or item.get("id")
    if not round_id:
        return None

    dice = []
    for key in ("first", "second", "third"):
        if result.get(key) is not None:
            dice.append(int(result[key]))
    if len(dice) < 3 and isinstance(result.get("value"), str):
        for char in result["value"]:
            code = ord(char)
            if 0x2680 <= code <= 0x2685:
                dice.append(code - 0x2680 + 1)
    if len(dice) != 3:
        return None

    dice.sort()
    total = sum(dice)
    is_triple = dice[0] == dice[1] == dice[2]

    return {
        "round_id": str(round_id),
        "sector": f"{dice[0]}-{dice[1]}-{dice[2]}",
        "outcome": str(total),
        "outcome_label": f"Soma {total}" + (" · trinca" if is_triple else ""),
        "is_bonus": is_triple,
        "max_multiplier": float(total),
        "finalized_at": data.get("settledAt"),
    }


_WHEEL_API_SLUGS = frozenset(
    {
        "lightningstorm",
        "crazytime",
        "crazytimea",
        "monopolylive",
        "dreamcatcher",
        "icefishing",
        "sweetbonanza",
    }
)


def parse_item(item: dict[str, Any], *, api_slug: str) -> dict[str, Any] | None:
    if api_slug in _WHEEL_API_SLUGS:
        return parse_wheel_item(item)
    if api_slug == "megasicbo":
        return parse_dice_item(item)
    # tenta roda primeiro, depois dados
    row = parse_wheel_item(item)
    return row if row else parse_dice_item(item)
