from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict, Any
from schema import AssessmentResponse, AssessmentReport
from io import BytesIO
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from fastapi import Response
from services import AssessmentService
from config import config

app = FastAPI()

# CORS setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

service = AssessmentService()

@app.get("/questions")
async def get_questions() -> Dict[str, Any]:
    return config.questions

@app.get("/tone-options")
async def get_tone_options() -> Dict[str, Any]:
    return config.tone_matrix

@app.post("/assess")
async def assess_business(response: AssessmentResponse) -> Dict[str, Any]:
    try:
        result: AssessmentReport = service.calculate_scores(response)

        recommendations = service.generate_recommendations(result, response.catalyst)
        
        response_data = {
            "overall_score": result.overall_score,
            "overall_tier": result.overall_tier,
            "priority_categories": result.priority_categories,
            "category_details": {
                name: {
                    "score": cs.normalized_score,
                    "tier": cs.tier,
                    "questions_answered": cs.questions_answered,
                    "total_questions": cs.total_questions
                }
                for name, cs in result.category_scores.items()
            },
            "recommendations": recommendations,
            "tier_distribution": service.get_tier_distribution(result)
        }
        return response_data

    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/export-pdf")
async def export_pdf(payload: Dict[str, Any]):
    try:
        buffer = BytesIO()
        pdf = canvas.Canvas(buffer, pagesize=letter)
        pdf.setFont("Helvetica", 11)

        x, y = 40, 750

        def write_line(s: str):
            nonlocal y
            for line in str(s).split("\n"):
                pdf.drawString(x, y, line[:110])  
                y -= 15
                if y < 50:
                    pdf.showPage()
                    pdf.setFont("Helvetica", 11)
                    y = 750

        # Header
        write_line("SBDC Assessment Results")
        write_line("-" * 60)
        write_line(f"Catalyst: {payload.get('catalyst', '')}")
        write_line(f"Overall Score: {payload.get('overall_score', '')}")
        write_line(f"Overall Tier: {payload.get('overall_tier', '')}")
        write_line("")

        cats = payload.get("category_scores") or payload.get("category_details") or {}
        if isinstance(cats, dict) and cats:
            write_line("Category Scores:")
            for name, info in cats.items():
                write_line(f"- {name}: {info}")
            write_line("")

        recs = payload.get("recommendations", [])
        write_line("Recommendations:")
        if isinstance(recs, list):
            for i, r in enumerate(recs, 1):
                write_line(f"{i}. {r}")
                write_line("")
        else:
            write_line(str(recs))

        pdf.save()
        buffer.seek(0)

        return Response(
            content=buffer.getvalue(),
            media_type="application/pdf",
            headers={"Content-Disposition": "attachment; filename=results.pdf"},
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

