from enum import Enum
from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, field_validator


class QuestionType(str, Enum):
    FREQUENCY = "Frequency"
    PLANNING_STATUS = "Planning Status"
    CONFIDENCE = "Confidence"


class Answer(BaseModel):
    question_id: str
    score: int
    notes: Optional[str] = None

    @field_validator("score")
    @classmethod
    def validate_score(cls, v):
        if not (0 <= v <= 4):
            raise ValueError("Score must be between 0 and 4")
        return v


class AssessmentResponse(BaseModel):
    catalyst: Literal[
        "Crisis",
        "Economic Uncertainty",
        "New Opportunity",
        "Steady Growth",
        "Lifestyle Change",
        "Operational Adjustments"
    ]
    answers: List[Answer]
    area_notes: Dict[str, str] = {}
    skipped_sections: List[str] = []
    owner_focus_area: Optional[Literal[
        "Financials",
        "Customers_Marketing",
        "Products_Services",
        "Operations",
        "Employees",
        "Leadership",
        "not_sure",
    ]] = "not_sure"


class CategoryScore(BaseModel):
    name: str
    raw_score: float
    normalized_score: Optional[float]
    tier: Optional[str]
    questions_answered: int
    total_questions: int


class AssessmentReport(BaseModel):
    category_scores: Dict[str, CategoryScore]
    overall_score: float
    overall_tier: str
    priority_categories: List[str]
