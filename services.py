from dotenv import load_dotenv
import os
import json
import random
from typing import Any, List, Dict
import google.generativeai as genai
from config import config  # includes functional_area.json now

from schema import AssessmentResponse, AssessmentReport, CategoryScore


load_dotenv()
api_key = os.getenv("GEMINI_API_KEY")
print("GEMINI_API_KEY:", api_key)  # debug check


class AssessmentService:
    def __init__(self):
        base_path = os.path.dirname(__file__)
        self.questions = self._load_config(os.path.join(base_path, "questions.json"))
        self.tone_matrix = self._load_config(os.path.join(base_path, "tone.json"))
        self.rules = self._load_config(os.path.join(base_path, "rules.json"))

        # Map question_id -> functional area
        self.question_to_area_map = {
            q["id"]: area
            for area, questions in self.questions["assessment"].items()
            for q in questions
        }

        # Initialize Gemini model
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise ValueError("GEMINI_API_KEY environment variable not set.")
        genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel("models/gemini-2.5-pro")

    def _load_config(self, path: str) -> Any:
        if not os.path.exists(path):
            raise FileNotFoundError(f"Configuration file not found: {path}")
        with open(path, "r") as f:
            return json.load(f)

    # ---------------------------
    # SCORE CALCULATION
    # ---------------------------
    def calculate_scores(self, response: AssessmentResponse) -> AssessmentReport:
        scores_by_area = {
            area: {"total_score": 0, "answered": 0, "total": len(questions)}
            for area, questions in self.questions["assessment"].items()
        }

        for answer in response.answers:
            if answer.score >= 0:
                area = self.question_to_area_map.get(answer.question_id)
                if area:
                    scores_by_area[area]["total_score"] += answer.score
                    scores_by_area[area]["answered"] += 1

        category_scores = {}
        priority_categories = []
        total_normalized = 0
        count = 0

        for area, data in scores_by_area.items():
            norm_score = (
                data["total_score"] / (data["answered"] * 4)
                if data["answered"] > 0
                else 0.0
            )
            tier = self._get_tier(norm_score)

            if tier in ["Responding", "Building"]:
                priority_categories.append(area)

            category_scores[area] = CategoryScore(
                name=area,
                raw_score=data["total_score"],
                normalized_score=round(norm_score, 2),
                tier=tier,
                questions_answered=data["answered"],
                total_questions=data["total"],
            )

            if data["answered"] > 0:
                total_normalized += norm_score
                count += 1

        overall_score = round(total_normalized / count, 2) if count > 0 else 0.0
        overall_tier = self._get_tier(overall_score)

        return AssessmentReport(
            category_scores=category_scores,
            overall_score=overall_score,
            overall_tier=overall_tier,
            priority_categories=priority_categories,
        )

    # ---------------------------
    # RECOMMENDATION GENERATION
    # ---------------------------
    def generate_recommendations(self, result: AssessmentReport, catalyst: str) -> str:
        # --- Catalyst Context ---
        catalyst_info = config.catalysts.get(catalyst, {})
        catalyst_definition = catalyst_info.get("definition", "No definition available.")

        # --- Business Summary ---
        diagnosis = config.rules["whole_business_summaries"].get(
            f"Mostly {result.overall_tier}", "Your business is evolving."
        )

        # --- Prompt Assembly ---
        prompt_parts = [
            "You are a small business advisor providing actionable, practical advice.",
            f"CATALYST: {catalyst}",
            f"DEFINITION: {catalyst_definition}",
            f"DIAGNOSIS: {diagnosis}",
            "TASK: For each functional area, use tone introductions, structured advice, and relevant examples from the data below.",
        ]

        sorted_areas = sorted(result.category_scores.values(), key=lambda c: c.normalized_score)

        for i, cat in enumerate(sorted_areas):
            tier = cat.tier
            area = cat.name

            # Tone introduction from tone.json
            tier_intros = config.tone_matrix.get(tier, {})
            catalyst_intros = tier_intros.get(catalyst, tier_intros.get("general_intros", [""]))
            intro = random.choice(catalyst_intros)

            # Detailed guidance from functional_area.json
            detailed_data = (
                config.functional_areas
                .get(tier, {})
                .get(catalyst, {})
                .get(area, [])
            )

            # Format recommendations
            if detailed_data:
                tone_instructions = ", ".join(
                    sorted({a.get("tone_focus", "").strip() for a in detailed_data if a.get("tone_focus")})
                )
                    
                action_list = "\n".join([f"- {a['recommendation']}" for a in detailed_data])
                action_snippets = (
                f"Write these recommendations using a {tone_instructions.lower()} tone:\n{action_list}"
                if tone_instructions
                else action_list
            )
            else:
                action_snippets = "- No detailed recommendations found for this area."

            prompt_parts.append(
                f"\n### AREA {i+1}: {area}\n"
                f"- Tier: {tier}\n"
                f"- Begin with: \"{intro}\"\n"
                f"- Then include:\n{action_snippets}\n"
            )

        prompt_parts.append("\nEnd of prompt. Provide concise, business-focused recommendations per area.")

        prompt = "\n".join(prompt_parts)

        try:
            response = self.model.generate_content(prompt)
            return response.text
        except Exception as e:
            return f"Error generating recommendations: {e}"

    # ---------------------------
    # UTILITIES
    # ---------------------------
    def _get_tier(self, score: float) -> str:
        bounds = self.rules["tier_boundaries"]
        if score <= bounds["Responding"][1]:
            return "Responding"
        elif score <= bounds["Building"][1]:
            return "Building"
        return "Optimizing"

    def get_tier_distribution(self, result: AssessmentReport) -> Dict[str, int]:
        distribution = {"Responding": 0, "Building": 0, "Optimizing": 0}
        for category in result.category_scores.values():
            distribution[category.tier] += 1
        return distribution
