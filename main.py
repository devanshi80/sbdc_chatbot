from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict, Any
from schema import AssessmentResponse, AssessmentReport

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
async def export_pdf(conversation: Dict[str, Any]):
    """
    Expected input structure:
    {
        "messages": [
            {"role": "user", "content": "text..."},
            {"role": "ai", "content": "text..."}
        ]
    }
    """

    try:
        buffer = BytesIO()
        pdf = canvas.Canvas(buffer, pagesize=letter)
        pdf.setFont("Helvetica", 11)

        x, y = 40, 750

        for msg in conversation["messages"]:
            text = f"{msg['role'].upper()}: {msg['content']}"

            for line in text.split("\n"):
                pdf.drawString(x, y, line)
                y -= 15

                # Create new page if we run out of space
                if y < 50:
                    pdf.showPage()
                    pdf.setFont("Helvetica", 11)
                    y = 750

        pdf.save()
        buffer.seek(0)

        return Response(
            content=buffer.getvalue(),
            media_type="application/pdf",
            headers={
                "Content-Disposition": "attachment; filename=conversation.pdf"
            }
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

