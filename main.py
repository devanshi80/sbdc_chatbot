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
import re

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

@app.get("/")
async def root():
    """Health check endpoint for Render"""
    return {"status": "ok", "message": "SBDC Assessment API is running"}

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
        
        def parse_markdown_line(text: str):
            """Parse a line and return segments with formatting info"""
            segments = []
            
            # Check if line starts with ### (heading)
            is_heading = text.strip().startswith("###")
            if is_heading:
                text = text.strip()[3:].strip()
                # Entire line is bold
                segments.append({"text": text, "bold": True})
                return segments, is_heading
            
            # Parse **bold** markers
            parts = re.split(r'(\*\*.*?\*\*)', text)
            for part in parts:
                if part.startswith("**") and part.endswith("**"):
                    # Bold text
                    segments.append({"text": part[2:-2], "bold": True})
                elif part:
                    # Regular text
                    segments.append({"text": part, "bold": False})
            
            return segments, is_heading
        
        def write_formatted_line(text: str, base_size=11, indent=0, force_bold=False):
            """Write a line with inline bold formatting"""
            nonlocal y
            
            segments, is_heading = parse_markdown_line(text)
            
            # Use larger font for headings
            size = base_size + 1 if is_heading else base_size
            
            current_x = x + indent
            
            for segment in segments:
                content = segment["text"]
                is_bold = segment["bold"] or force_bold
                font = "Helvetica-Bold" if is_bold else "Helvetica"
                
                pdf.setFont(font, size)
                
                # Word wrap
                words = content.split()
                for word in words:
                    word_width = pdf.stringWidth(word + " ", font, size)
                    
                    # Check if we need to wrap
                    if current_x + word_width > width - 50:
                        # Move to next line
                        y -= size + 4
                        current_x = x + indent
                        
                        if y < 60:
                            pdf.showPage()
                            y = height - 60
                            current_x = x + indent
                        
                        pdf.setFont(font, size)
                    
                    pdf.drawString(current_x, y, word)
                    current_x += word_width
            
            # Move to next line after finishing this one
            y -= size + 4
            if y < 60:
                pdf.showPage()
                y = height - 60
        
        def add_spacing(pixels=10):
            nonlocal y
            y -= pixels
        
        # Header
        pdf.setFont("Helvetica-Bold", 18)
        pdf.drawString(x, y, "SBDC Assessment Results")
        y -= 25
        
        pdf.setLineWidth(1)
        pdf.line(50, y, width - 50, y)
        add_spacing(20)
        
        # Overview Section
        pdf.setFont("Helvetica-Bold", 12)
        pdf.drawString(x, y, f"Catalyst: {payload.get('catalyst', 'N/A')}")
        y -= 20
        
        pdf.setFont("Helvetica", 12)
        pdf.drawString(x, y, f"Overall Score: {payload.get('overall_score', 'N/A')}")
        y -= 18
        pdf.drawString(x, y, f"Overall Tier: {payload.get('overall_tier', 'N/A')}")
        add_spacing(25)
        
        # Recommendations Section
        pdf.setFont("Helvetica-Bold", 14)
        pdf.drawString(x, y, "Recommendations")
        add_spacing(15)

        # Handle recommendations (comes as a single string with markdown)
        recs_text = payload.get("recommendations", "")
        
        if isinstance(recs_text, str) and recs_text:
            # Split by lines
            lines = recs_text.split("\n")
            
            for line in lines:
                line = line.strip()
                if not line:
                    # Empty line - add small spacing
                    add_spacing(8)
                    continue
                
                # Write the line with formatting
                write_formatted_line(line, base_size=11, indent=0)
        
        # Footer
        y = 40
        pdf.setFont("Helvetica", 8)
        pdf.drawString(50, y, f"Generated {str(datetime.now().strftime('%B %d, %Y'))}")
        
        pdf.save()
        buffer.seek(0)
        
        return Response(
            content=buffer.getvalue(),
            media_type="application/pdf",
            headers={"Content-Disposition": "attachment; filename=SBDC_Assessment_Results.pdf"},
        )
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF generation failed: {str(e)}")

