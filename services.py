from dotenv import load_dotenv
import os
import json
import random
from typing import Any, List, Dict
import google.generativeai as genai
from config import config

from schema import AssessmentResponse, AssessmentReport, CategoryScore


load_dotenv()
api_key = os.getenv("GEMINI_API_KEY")


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
        # Normalize catalyst name to match JSON keys
        catalyst_key = catalyst.replace(" ", "_")
        
        # Get tier for functional area lookup
        tier_key = "Responding" if result.overall_tier == "Responding" else \
                    "Building_Phase" if result.overall_tier == "Building" else "Optimizing"
        
        # Catalyst Context
        catalyst_info = config.catalysts.get(catalyst, {})
        catalyst_definition = catalyst_info.get("definition", "No definition available.")
        focus_areas = catalyst_info.get("primary_focus_areas", [])
        
        # Business Summary
        diagnosis = config.rules["whole_business_summaries"].get(
            f"Mostly {result.overall_tier}", "Your business is evolving."
        )

        # Enhanced Prompt Assembly
        prompt_parts = [
            "You are an experienced small business advisor with expertise across retail, service, manufacturing, and professional services.",
            "",
            "## BUSINESS CONTEXT:",
            f"**Current Situation:** {catalyst}",
            f"**What This Means:** {catalyst_definition}",
            f"**Overall Business State:** {diagnosis}",
            "",
            "## KEY PRIORITIES FOR THIS SITUATION:",
        ]
        
        for i, focus in enumerate(focus_areas[:5], 1):
            prompt_parts.append(f"{i}. {focus}")
        
        prompt_parts.extend([
            "",
            "## CRITICAL WRITING GUIDELINES:",
            "**DO NOT:**",
            "- Use phrases like 'Of course', 'Here are', or other unnecessary preambles",
            "- Use headings like 'WHAT to do', 'WHY it matters', 'HOW to start'",
            "- Show scores or tier levels to the user (e.g., '(Current Score: 0.50 - Building)')",
            "- Use bullet points with • symbols",
            "",
            "**DO:**",
            "- Start each functional area directly with the opening statement provided",
            "- Write each recommendation as a cohesive 2-3 sentence paragraph",
            "- Naturally integrate what to do, why it matters, and how to start within the paragraph flow",
            "- Use plain, conversational language at 8th-grade reading level",
            "- Define business terms in parentheses when first used",
            "- Keep total length: 150-200 words per functional area",
            "",
            "## FUNCTIONAL AREA RECOMMENDATIONS:",
            "You must provide recommendations for ALL 6 functional areas in this exact order: Customers_Marketing, Employees, Financials, Leadership, Operations, Products_Services ",
            ""
        ])

        # Sort areas by priority (lowest scores first)
        sorted_areas = sorted(result.category_scores.values(), key=lambda c: c.normalized_score)

        for i, cat in enumerate(sorted_areas, 1):
            tier = cat.tier
            area = cat.name
            
            # Get tone introduction
            tier_intros = config.tone_matrix.get(tier, {})
            catalyst_intros = tier_intros.get(catalyst, tier_intros.get("general_intros", [""]))
            intro = random.choice(catalyst_intros) if catalyst_intros else ""

            # Get detailed guidance from functional_areas.json
            detailed_data = (
                config.functional_areas
                .get(tier_key, {})
                .get(catalyst_key, {})
                .get(area, [])
            )

            # Format recommendations
            if detailed_data:
                # Extract recommendations
                recommendations_text = "\n".join([
                    f"  {j+1}. {rec['recommendation']}" 
                    for j, rec in enumerate(detailed_data[:3])  # Limit to 3 recommendations
                ])
                
                prompt_parts.append(
                    f"### {i}. {area.replace('_', ' & ')}\n"
                    f"\n"
                    f"**Opening Statement (use this exactly):** {intro}\n"
                    f"\n"
                    f"**Base Your Advice On These Core Recommendations:**\n"
                    f"{recommendations_text}\n"
                    f"\n"
                    f"**Instructions:** Expand each recommendation above into a 2-3 sentence paragraph. "
                    f"Each paragraph should naturally explain the specific action, its business impact, "
                    f"and a concrete first step—but without using those as headings. "
                    f"Write in a conversational but professional tone. Keep it concise and actionable.\n"
                    f"{'─' * 80}\n"
                )
            else:
                prompt_parts.append(
                    f"### {i}. {area.replace('_', ' & ')}\n"
                    f"\n"
                    f"**Opening Statement (use this exactly):** {intro}\n"
                    f"\n"
                    f"Provide 3 practical recommendations for this area based on the {tier} tier "
                    f"and {catalyst} context. Each recommendation should be a 2-3 sentence paragraph.\n"
                    f"{'─' * 80}\n"
                )

        prompt_parts.extend([
            "",
            "## FORMATTING REQUIREMENTS:",
            "- Use clear headings for each functional area (e.g., '1. Financials', '2. Operations')",
            "- Number your recommendations (1, 2, 3) within each area",
            "- Write each recommendation as a cohesive paragraph, NOT bullet points",
            "- Use **bold** sparingly for key terms only",
            "- Do NOT show scores or tier information",
            "",
            "## LENGTH REQUIREMENT:",
            "- Total response: 1,200 - 1,500 words",
            "- Each functional area: 150-200 words (roughly 3 paragraphs of 2-3 sentences each)",
            "",
            "Begin your recommendations now, starting directly with the first functional area:"
        ])

        prompt = "\n".join(prompt_parts)

        try:
            generation_config = {
                "temperature": 0.7,
                "top_p": 0.9,
                "top_k": 40,
                "max_output_tokens": 6000,
            }
            
            response = self.model.generate_content(
                prompt,
                generation_config=generation_config
            )
            
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