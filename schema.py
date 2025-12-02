from pydantic import BaseModel, validator
from typing import Dict, List, Optional, Literal
from enum import Enum


# Question types (optional, for frontend use or future validation)
class QuestionType(str, Enum):
    FREQUENCY = "Frequency"
    PLANNING_STATUS = "Planning Status"
    CONFIDENCE = "Confidence"


# User's response to one question
class Answer(BaseModel):
    question_id: str
    score: int
    notes: Optional[str] = None

    @validator("score")
    def validate_score(cls, v):
        if not (0 <= v <= 4):
            raise ValueError("Score must be between 0 and 4")
        return v


# Request body format for POST /assess
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


# Per-category computed score
class CategoryScore(BaseModel):
    name: str
    raw_score: float
    normalized_score: float
    tier: str
    questions_answered: int
    total_questions: int


# Final full response from calculate_scores()
class AssessmentReport(BaseModel):
    category_scores: Dict[str, CategoryScore]
    overall_score: float
    overall_tier: str
    priority_categories: List[str]