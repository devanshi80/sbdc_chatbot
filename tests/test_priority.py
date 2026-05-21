import asyncio
import importlib
import json
import os
import sys
import unittest
from pathlib import Path
from types import ModuleType, SimpleNamespace

from priority import calculate_priority_candidates
from schema import Answer, AssessmentResponse


def category(score, tier="Building", answered=1):
    return SimpleNamespace(
        normalized_score=score,
        tier=tier,
        questions_answered=answered,
    )


class PriorityScoringTests(unittest.TestCase):
    def setUp(self):
        self.questions = {
            "assessment": {
                "Financials": [
                    {"id": "FIN-001", "question": "I monitor cash flow"},
                    {"id": "FIN-002", "question": "I use accounting software", "exclude_from_scoring": True},
                ],
                "Marketing": [
                    {"id": "MKT-001", "question": "I post on social media"},
                ],
            }
        }
        self.rankings = {
            "FIN-001": {"Crisis": 1},
            "FIN-002": {"Crisis": 1},
            "MKT-001": {"Crisis": 50},
        }
        self.category_scores = {
            "Financials": category(0.5),
            "Marketing": category(0.5),
        }

    def test_high_rank_low_score_beats_low_rank_low_score(self):
        candidates = calculate_priority_candidates(
            catalyst="Crisis",
            questions=self.questions,
            rankings=self.rankings,
            category_scores=self.category_scores,
            answers=[
                {"question_id": "FIN-001", "score": 1},
                {"question_id": "MKT-001", "score": 1},
            ],
        )

        self.assertEqual(candidates[0]["question_id"], "FIN-001")

    def test_score_four_does_not_create_candidate(self):
        candidates = calculate_priority_candidates(
            catalyst="Crisis",
            questions=self.questions,
            rankings=self.rankings,
            category_scores=self.category_scores,
            answers=[{"question_id": "FIN-001", "score": 4}],
        )

        self.assertEqual(candidates, [])

    def test_excluded_and_invalid_scores_are_ignored(self):
        candidates = calculate_priority_candidates(
            catalyst="Crisis",
            questions=self.questions,
            rankings=self.rankings,
            category_scores=self.category_scores,
            answers=[
                {"question_id": "FIN-002", "score": 0},
                {"question_id": "FIN-001", "score": "N/A"},
            ],
        )

        self.assertEqual(candidates, [])

    def test_lowest_area_boost_affects_ordering(self):
        candidates = calculate_priority_candidates(
            catalyst="Crisis",
            questions=self.questions,
            rankings={
                "FIN-001": {"Crisis": 3},
                "MKT-001": {"Crisis": 1},
            },
            category_scores={
                "Financials": category(0.1),
                "Marketing": category(0.9),
            },
            answers=[
                {"question_id": "FIN-001", "score": 0},
                {"question_id": "MKT-001", "score": 0},
            ],
        )

        self.assertEqual(candidates[0]["question_id"], "FIN-001")

    def test_free_response_boost_is_capped(self):
        base = calculate_priority_candidates(
            catalyst="Crisis",
            questions=self.questions,
            rankings=self.rankings,
            category_scores=self.category_scores,
            answers=[{"question_id": "FIN-001", "score": 1}],
        )[0]["priority_score"]

        boosted = calculate_priority_candidates(
            catalyst="Crisis",
            questions=self.questions,
            rankings=self.rankings,
            category_scores=self.category_scores,
            answers=[{"question_id": "FIN-001", "score": 1}],
            area_notes={
                "Financials": "Cash is tight, payroll is coming, rent is due, and debt payments are stressful."
            },
        )[0]["priority_score"]

        self.assertLessEqual(boosted - base, base * 0.25)


class PriorityConfigCoverageTests(unittest.TestCase):
    def test_every_scorable_question_has_all_catalyst_rankings(self):
        questions = json.loads(Path("questions.json").read_text())["assessment"]
        rankings = json.loads(Path("priority_rankings.json").read_text())["rankings"]
        catalysts = {
            "Economic Uncertainty",
            "Crisis",
            "New Opportunity",
            "Steady Growth",
            "Lifestyle Change",
            "Operational Adjustments",
        }

        scorable_ids = {
            question["id"]
            for area_questions in questions.values()
            for question in area_questions
            if not question.get("exclude_from_scoring", False)
        }

        self.assertEqual(scorable_ids, set(rankings.keys()))
        for question_id in scorable_ids:
            self.assertEqual(catalysts, set(rankings[question_id].keys()))


class AssessResponseShapeTests(unittest.TestCase):
    def test_assess_returns_priority_recommendations(self):
        os.environ.setdefault("GEMINI_API_KEY", "test-key")
        if "reportlab" not in sys.modules:
            reportlab = ModuleType("reportlab")
            pdfgen = ModuleType("reportlab.pdfgen")
            canvas = ModuleType("reportlab.pdfgen.canvas")
            lib = ModuleType("reportlab.lib")
            pagesizes = ModuleType("reportlab.lib.pagesizes")
            canvas.Canvas = object
            pagesizes.letter = (612, 792)
            sys.modules["reportlab"] = reportlab
            sys.modules["reportlab.pdfgen"] = pdfgen
            sys.modules["reportlab.pdfgen.canvas"] = canvas
            sys.modules["reportlab.lib"] = lib
            sys.modules["reportlab.lib.pagesizes"] = pagesizes

        if "google.generativeai" not in sys.modules:
            google = ModuleType("google")
            generativeai = ModuleType("google.generativeai")
            generativeai.configure = lambda **kwargs: None
            generativeai.GenerativeModel = lambda *args, **kwargs: SimpleNamespace()
            sys.modules["google"] = google
            sys.modules["google.generativeai"] = generativeai

        main = importlib.import_module("main")

        class FakeService:
            def calculate_scores(self, response):
                return SimpleNamespace(
                    overall_score=0.5,
                    overall_tier="Building",
                    priority_categories=["Financials"],
                    category_scores={
                        "Financials": SimpleNamespace(
                            normalized_score=0.5,
                            tier="Building",
                            questions_answered=1,
                            total_questions=1,
                        )
                    },
                )

            def generate_priority_recommendations(self, result, catalyst, answers, area_notes):
                return [
                    {"type": "key_area", "label": "Key Area to Consider", "title": "A", "summary": "B", "first_step": "C"},
                    {"type": "key_area", "label": "Key Area to Consider", "title": "D", "summary": "E", "first_step": "F"},
                    {"type": "quick_win", "label": "Quick Win", "title": "G", "summary": "H", "first_step": "I"},
                ]

            def generate_recommendations(self, result, catalyst, answers, area_notes):
                return "Full report"

            def get_tier_distribution(self, result):
                return {"Responding": 0, "Building": 1, "Optimizing": 0}

        original_service = main.service
        main.service = FakeService()
        try:
            response = AssessmentResponse(
                catalyst="Crisis",
                answers=[Answer(question_id="FIN-001", score=1)],
                area_notes={},
            )
            payload = asyncio.run(main.assess_business(response))
        finally:
            main.service = original_service

        self.assertEqual(len(payload["priority_recommendations"]), 3)
        self.assertEqual(payload["priority_recommendations"][2]["type"], "quick_win")
        self.assertIn("summary", payload["priority_recommendations"][0])
        self.assertEqual(payload["recommendations"], "Full report")

    def test_fallback_priority_copy_is_specific(self):
        os.environ.setdefault("GEMINI_API_KEY", "test-key")
        if "google.generativeai" not in sys.modules:
            google = ModuleType("google")
            generativeai = ModuleType("google.generativeai")
            generativeai.configure = lambda **kwargs: None
            generativeai.GenerativeModel = lambda *args, **kwargs: SimpleNamespace()
            sys.modules["google"] = google
            sys.modules["google.generativeai"] = generativeai

        services = importlib.import_module("services")
        service = services.AssessmentService.__new__(services.AssessmentService)
        cards = service._fallback_priority_recommendations(
            [{"area": "Financials", "question": "I have a clear budget"}],
            "Steady Growth",
        )

        all_text = " ".join(
            str(value)
            for card in cards
            for value in card.values()
        ).lower()
        self.assertNotIn("worth discussing", all_text)
        self.assertNotIn("responses point", all_text)
        self.assertNotIn("responses suggest", all_text)
        self.assertTrue(all(card.get("summary") for card in cards))


if __name__ == "__main__":
    unittest.main()
