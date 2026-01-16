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
from datetime import datetime

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
        width, height = letter
        x, y = 50, height - 60
        
        def write_line(text: str, font="Helvetica", size=11, indent=0, bold=False):
            nonlocal y
            if bold:
                font = "Helvetica-Bold"
            pdf.setFont(font, size)
            
            # Handle multi-line text and word wrapping
            lines = str(text).split("\n")
            for line in lines:
                # Word wrap for long lines
                words = line.split()
                current_line = ""
                for word in words:
                    test_line = current_line + (" " if current_line else "") + word
                    if pdf.stringWidth(test_line, font, size) < (width - 100 - indent):
                        current_line = test_line
                    else:
                        if current_line:
                            pdf.drawString(x + indent, y, current_line)
                            y -= size + 4
                            if y < 60:
                                pdf.showPage()
                                y = height - 60
                                pdf.setFont(font, size)
                            current_line = word
                        else:
                            # Single word too long, just print it
                            pdf.drawString(x + indent, y, word)
                            y -= size + 4
                            if y < 60:
                                pdf.showPage()
                                y = height - 60
                                pdf.setFont(font, size)
                            current_line = ""
                
                if current_line:
                    pdf.drawString(x + indent, y, current_line)
                    y -= size + 4
                    if y < 60:
                        pdf.showPage()
                        y = height - 60
                        pdf.setFont(font, size)

        def clean_markdown(text: str) -> str:
            """Remove markdown formatting from text"""
            import re
            # Remove ### headers
            text = re.sub(r'^###\s+', '', text, flags=re.MULTILINE)
            # Remove ** bold markers
            text = re.sub(r'\*\*([^*]+)\*\*', r'\1', text)
            return text
        
        def add_spacing(pixels=10):
            nonlocal y
            y -= pixels
        
        # Header
        write_line("SBDC Assessment Results", size=18, bold=True)
        add_spacing(5)
        pdf.setLineWidth(1)
        pdf.line(50, y, width - 50, y)
        add_spacing(20)
        
        # Overview Section
        write_line(f"Catalyst: {payload.get('catalyst', 'N/A')}", size=12, bold=True)
        add_spacing(15)
        
        write_line(f"Overall Score: {payload.get('overall_score', 'N/A')}", size=12)
        write_line(f"Overall Tier: {payload.get('overall_tier', 'N/A')}", size=12)
        add_spacing(20)
        
        # Category Scores Section
        cats = payload.get("category_scores") or payload.get("category_details") or {}
        if isinstance(cats, dict) and cats:
            write_line("Category Scores", size=14, bold=True)
            add_spacing(10)
            
            for name, info in cats.items():
                write_line(f"• {name}", size=11, bold=True, indent=10)
                write_line(f"  {info}", size=10, indent=20)
                add_spacing(8)
            
            add_spacing(15)
        
        # Recommendations Section
        write_line("Recommendations", size=14, bold=True)
        add_spacing(10)

        recs = payload.get("recommendations", [])
        if isinstance(recs, list) and recs:
            for i, r in enumerate(recs, 1):
                cleaned_rec = clean_markdown(r)  # Add this line
                write_line(f"{i}. ", size=11, bold=True, indent=10)
                y += 15
                write_line(cleaned_rec, size=11, indent=25)  # Use cleaned version
                add_spacing(12)
        else:
            write_line(str(recs), indent=10)
        
        # Footer
        y = 40
        pdf.setFont("Helvetica", 8)
        pdf.drawString(50, y, f"Generated on {payload.get('catalyst', '')} - {str(datetime.now().date())}")
        
        pdf.save()
        buffer.seek(0)
        
        return Response(
            content=buffer.getvalue(),
            media_type="application/pdf",
            headers={"Content-Disposition": "attachment; filename=SBDC_Assessment_Results.pdf"},
        )
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF generation failed: {str(e)}")

