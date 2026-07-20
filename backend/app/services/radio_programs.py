import json
import uuid
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

from app.models import RadioStation


def parse_programs_list(raw: Optional[str]) -> List[Dict[str, Any]]:
    if not raw:
        return []
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, list):
            return [p for p in parsed if isinstance(p, dict)]
    except (json.JSONDecodeError, TypeError):
        pass
    return []


def valid_programs(programs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return [p for p in programs if str(p.get("title", "")).strip()]


def ensure_program_ids(programs: List[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], bool]:
    changed = False
    result: List[Dict[str, Any]] = []
    for program in programs:
        item = dict(program)
        if not item.get("id"):
            item["id"] = str(uuid.uuid4())
            changed = True
        result.append(item)
    return result, changed


def ensure_station_program_ids(station: RadioStation, db: Session) -> List[Dict[str, Any]]:
    programs = valid_programs(parse_programs_list(station.programs_list))
    if not programs:
        return []
    updated, changed = ensure_program_ids(programs)
    if changed:
        station.programs_list = json.dumps(updated)
        db.add(station)
        db.commit()
        db.refresh(station)
    return updated


def station_has_programs(station: RadioStation) -> bool:
    return len(valid_programs(parse_programs_list(station.programs_list))) > 0


def normalize_programs_list_raw(raw: Optional[str]) -> Optional[str]:
    programs = valid_programs(parse_programs_list(raw))
    if not programs:
        return raw
    updated, _ = ensure_program_ids(programs)
    return json.dumps(updated)


def _parse_time_minutes(value: Optional[str]) -> Optional[int]:
    if not value or ":" not in value:
        return None
    try:
        hours_str, minutes_str = value.split(":", 1)
        hours = int(hours_str)
        minutes = int(minutes_str)
    except (TypeError, ValueError):
        return None
    if hours < 0 or hours > 23 or minutes < 0 or minutes > 59:
        return None
    return hours * 60 + minutes


def _program_to_ranges(from_min: int, to_min: int) -> List[tuple[int, int]]:
    """Half-open ranges [start, end) — end minute is exclusive."""
    if from_min == to_min:
        return []
    if from_min < to_min:
        return [(from_min, to_min)]
    return [(from_min, 1440), (0, to_min)]


def _ranges_overlap(first: List[tuple[int, int]], second: List[tuple[int, int]]) -> bool:
    for a_start, a_end in first:
        for b_start, b_end in second:
            if a_start < b_end and b_start < a_end:
                return True
    return False


def validate_programs_no_overlap(programs: List[Dict[str, Any]]) -> Optional[str]:
    slots: List[tuple[int, Dict[str, Any], List[tuple[int, int]]]] = []
    for index, program in enumerate(programs):
        from_min = _parse_time_minutes(program.get("timeFrom"))
        to_min = _parse_time_minutes(program.get("timeTo"))
        if from_min is None or to_min is None or from_min == to_min:
            continue
        ranges = _program_to_ranges(from_min, to_min)
        if not ranges:
            continue
        slots.append((index, program, ranges))

    for i in range(len(slots)):
        for j in range(i + 1, len(slots)):
            idx_a, prog_a, ranges_a = slots[i]
            idx_b, prog_b, ranges_b = slots[j]
            if not _ranges_overlap(ranges_a, ranges_b):
                continue

            title_a = str(prog_a.get("title") or "").strip() or f"Program {idx_a + 1}"
            title_b = str(prog_b.get("title") or "").strip() or f"Program {idx_b + 1}"
            time_a = f"{prog_a.get('timeFrom')}–{prog_a.get('timeTo')}"
            time_b = f"{prog_b.get('timeFrom')}–{prog_b.get('timeTo')}"
            return (
                f"Program schedules cannot overlap. \"{title_a}\" ({time_a}) overlaps with "
                f"\"{title_b}\" ({time_b}). Back-to-back slots are allowed when one ends at the "
                f"same time the next starts (for example 1:00–2:00 then 2:00–3:00)."
            )

    return None
