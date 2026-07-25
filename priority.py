import re
from typing import Any, Dict, Iterable, List, Optional


GAP_SCORES = {
    0: 5.0,
    1: 4.0,
    2: 3.0,
    3: 1.5,
    4: 0.0,
}

NOTE_SIGNAL_PATTERNS = {
    "financial_urgency": [
        r"\bcash\b",
        r"\bpayroll\b",
        r"\brent\b",
        r"\bdebt\b",
        r"\bbill(s)?\b",
        r"\bcan'?t afford\b",
        r"\btight\b",
    ],
    "capacity_constraint": [
        r"\boverwhelm(ed|ing)?\b",
        r"\bburn(ed)? out\b",
        r"\bno time\b",
        r"\btoo much\b",
        r"\bcapacity\b",
    ],
    "demand_issue": [
        r"\bcustomer(s)? (aren'?t|are not) buying\b",
        r"\bsales (slowed|down|declined|dropped)\b",
        r"\bdemand\b",
        r"\blosing customer(s)?\b",
    ],
    "supplier_risk": [
        r"\bsupplier(s)?\b",
        r"\bvendor(s)?\b",
        r"\binventory\b",
        r"\bdelays?\b",
        r"\bcost(s)? keep changing\b",
    ],
    "owner_dependency": [
        r"\bonly i\b",
        r"\bonly me\b",
        r"\bdepends on me\b",
        r"\bin my head\b",
    ],
    "team_process_issue": [
        r"\bteam confusion\b",
        r"\bpeople don'?t follow through\b",
        r"\bunclear role(s)?\b",
        r"\btraining\b",
        r"\bcommunication\b",
    ],
    "opportunity_feasibility": [
        r"\bnew opportunity\b",
        r"\bgrant\b",
        r"\bpartnership\b",
        r"\blaunch\b",
        r"\bexpand\b",
    ],
    "applicability_clarification": [
        r"\bdoes not apply\b",
        r"\bdoesn'?t apply\b",
        r"\bnot applicable\b",
        r"\bno employees\b",
        r"\bdon'?t have employees\b",
    ],
}


def importance_weight(rank: int) -> float:
    return max(1.0, 5.25 - (0.25 * rank))


def detect_note_signals(note: str) -> List[str]:
    lowered = (note or "").lower()
    signals = []

    for signal, patterns in NOTE_SIGNAL_PATTERNS.items():
        if any(re.search(pattern, lowered) for pattern in patterns):
            signals.append(signal)

    return signals


def _get_value(obj: Any, key: str, default: Any = None) -> Any:
    if isinstance(obj, dict):
        return obj.get(key, default)
    return getattr(obj, key, default)


def _normalize_answers(answers: Iterable[Any]) -> Dict[str, int]:
    normalized = {}
    for answer in answers:
        question_id = _get_value(answer, "question_id")
        score = _get_value(answer, "score")
        if question_id is None or score is None:
            continue
        try:
            normalized[question_id] = int(score)
        except (TypeError, ValueError):
            continue
    return normalized


def _lowest_scoring_areas(category_scores: Dict[str, Any]) -> set[str]:
    scored = {
        area: _get_value(score, "normalized_score")
        for area, score in category_scores.items()
        if _get_value(score, "normalized_score") is not None
        and _get_value(score, "questions_answered", 0) > 0
    }
    if not scored:
        return set()

    lowest = min(scored.values())
    return {area for area, score in scored.items() if score == lowest}


def calculate_priority_candidates(
    *,
    catalyst: str,
    questions: Dict[str, Any],
    rankings: Dict[str, Dict[str, int]],
    category_scores: Dict[str, Any],
    answers: Iterable[Any],
    area_notes: Optional[Dict[str, str]] = None,
    area_note_signals: Optional[Dict[str, List[str]]] = None,
    question_to_area_map: Optional[Dict[str, str]] = None,
    limit: int = 8,
) -> List[Dict[str, Any]]:
    area_notes = area_notes or {}
    area_note_signals = area_note_signals or {}
    question_to_area_map = question_to_area_map or {
        q["id"]: area
        for area, area_questions in questions.get("assessment", {}).items()
        for q in area_questions
    }
    questions_by_id = {
        q["id"]: q
        for area_questions in questions.get("assessment", {}).values()
        for q in area_questions
    }
    answer_scores = _normalize_answers(answers)
    lowest_areas = _lowest_scoring_areas(category_scores)
    candidates = []

    for question_id, user_score in answer_scores.items():
        question = questions_by_id.get(question_id)
        area = question_to_area_map.get(question_id)
        if not question or not area or question.get("exclude_from_scoring", False):
            continue

        gap_score = GAP_SCORES.get(user_score, 0.0)
        if gap_score <= 0:
            continue

        catalyst_rank = rankings.get(question_id, {}).get(catalyst)
        if catalyst_rank is None:
            continue

        base_score = importance_weight(catalyst_rank) * gap_score
        candidate_score = base_score
        if area in lowest_areas:
            candidate_score *= 1.2

        area_score = category_scores.get(area)
        area_tier = _get_value(area_score, "tier")
        if area_tier in {"Responding", "Building"}:
            candidate_score *= 1.1

        note = area_notes.get(area, "")
        note_signals = area_note_signals.get(area)
        if note_signals is None:
            note_signals = detect_note_signals(note)
        boost_signals = [
            signal
            for signal in note_signals
            if signal != "applicability_clarification"
        ]
        note_boost = min(base_score * 0.25, base_score * 0.10 * len(boost_signals))
        candidate_score += note_boost

        candidates.append({
            "question_id": question_id,
            "question": question["question"],
            "area": area,
            "user_score": user_score,
            "catalyst_rank": catalyst_rank,
            "priority_score": round(candidate_score, 4),
            "note_signals": note_signals,
            "area_note_excerpt": note[:500],
        })

    return sorted(
        candidates,
        key=lambda item: (
            item["priority_score"],
            -item["catalyst_rank"],
            -item["user_score"],
        ),
        reverse=True,
    )[:limit]
