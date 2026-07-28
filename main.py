from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
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

@app.get("/health")
async def health_check():
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
        service_instance = service
        result: AssessmentReport = service_instance.calculate_scores(response)

        priority_recommendations = service_instance.generate_priority_recommendations(
            result,
            response.catalyst,
            response.answers,
            response.area_notes,
            response.owner_focus_area,
        )
        
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
            "priority_recommendations": priority_recommendations,
            "owner_focus_area": response.owner_focus_area,
            "tier_distribution": service_instance.get_tier_distribution(result),
            "skipped_sections": response.skipped_sections
        }
        return response_data

    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/recommendations")
async def generate_full_recommendations(response: AssessmentResponse) -> Dict[str, Any]:
    try:
        service_instance = service
        result: AssessmentReport = service_instance.calculate_scores(response)

        recommendation_result = service_instance.generate_recommendations(
            result,
            response.catalyst,
            response.answers,
            response.area_notes,
            response.skipped_sections,
            response.owner_focus_area,
        )

        if isinstance(recommendation_result, dict):
            return recommendation_result

        return {"recommendations": recommendation_result, "recommendation_rationales": []}

    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/export-pdf")
async def export_pdf(payload: Dict[str, Any]):
    try:
        buffer = BytesIO()
        pdf = canvas.Canvas(buffer, pagesize=letter)
        pdf.setTitle("SBDC Assessment Results")
        width, height = letter
        x, y = 50, height - 10
        
        # Get user's answers from payload
        answers_dict = {}
        if "answers" in payload:
            for answer in payload["answers"]:
                answers_dict[answer["question_id"]] = answer["score"]
        area_notes = payload.get("area_notes", {})
        
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

        def write_wrapped_text(text: str, size=10, indent=0, force_bold=False):
            """Write wrapped text at a fixed size without markdown heading scaling."""
            nonlocal y

            segments, _ = parse_markdown_line(text)
            current_x = x + indent

            for segment in segments:
                content = segment["text"]
                font = "Helvetica-Bold" if segment["bold"] or force_bold else "Helvetica"
                pdf.setFont(font, size)

                for word in content.split():
                    word_width = pdf.stringWidth(word + " ", font, size)
                    if current_x + word_width > width - 50:
                        y -= size + 4
                        current_x = x + indent

                        if y < 60:
                            pdf.showPage()
                            y = height - 60
                            current_x = x + indent

                        pdf.setFont(font, size)

                    pdf.drawString(current_x, y, word)
                    current_x += word_width

            y -= size + 4
            if y < 60:
                pdf.showPage()
                y = height - 60

        def write_recommendations_section(markdown_text: str):
            for raw_line in markdown_text.split("\n"):
                line = raw_line.strip()
                if not line:
                    add_spacing(6)
                    continue

                if line.startswith("###"):
                    add_spacing(4)
                    heading = line[3:].strip()
                    write_wrapped_text(heading, size=12, force_bold=True)
                    add_spacing(4)
                    continue

                indent = 12 if re.match(r"^\d+[\.)]\s+", line) else 0
                write_wrapped_text(line, size=10, indent=indent)
                add_spacing(3)
        
        def add_spacing(pixels=10):
            nonlocal y
            y -= pixels

        def pdf_color(hex_value: str):
            from reportlab.lib.colors import HexColor
            return HexColor(hex_value)

        def ensure_space(required_height: float):
            nonlocal y
            if y - required_height < 60:
                pdf.showPage()
                y = height - 60

        def wrap_pdf_lines(text: str, box_width: float, size=8.5, font="Helvetica"):
            pdf.setFont(font, size)
            words = str(text or "").split()
            lines = []
            current = ""

            for word in words:
                candidate = f"{current} {word}".strip()
                if pdf.stringWidth(candidate, font, size) <= box_width:
                    current = candidate
                    continue
                if current:
                    lines.append(current)
                current = word

            if current:
                lines.append(current)

            return lines

        def draw_wrapped_in_box(text: str, left: float, top: float, box_width: float, size=8.5, font="Helvetica"):
            line_height = size + 3
            cursor_y = top
            for line in wrap_pdf_lines(text, box_width, size, font):
                pdf.drawString(left, cursor_y, line)
                cursor_y -= line_height

            return cursor_y

        def priority_card_height(item: Dict[str, Any], card_width: float) -> float:
            inner_width = card_width - 24
            label = str(item.get("label", "Key Area to Consider")).upper()
            title = item.get("title", "")
            summary = item.get("summary", item.get("what_to_do", ""))
            first_step = str(item.get("first_step", "")).strip()
            first_step_width = inner_width - pdf.stringWidth("First step: ", "Helvetica-Bold", 8.2)

            content_height = 20
            content_height += len(wrap_pdf_lines(label, inner_width, 7.5, "Helvetica-Bold")) * 10.5 + 3
            content_height += len(wrap_pdf_lines(title, inner_width, 11, "Helvetica-Bold")) * 14 + 5
            content_height += len(wrap_pdf_lines(summary, inner_width, 8.2, "Helvetica")) * 11.2 + 5
            if first_step:
                content_height += max(
                    11.2,
                    len(wrap_pdf_lines(first_step, first_step_width, 8.2, "Helvetica")) * 11.2,
                )

            return max(220, content_height + 16)

        def normalize_priority_cards(raw_cards):
            if not isinstance(raw_cards, list):
                return []

            normalized = []
            for item in raw_cards:
                if not isinstance(item, dict):
                    continue

                card_type = str(item.get("type", "key_area")).strip().lower().replace("-", "_").replace(" ", "_")
                normalized.append({
                    "type": "quick_win" if card_type == "quick_win" else "key_area",
                    "label": item.get("label") or ("Quick Win" if card_type == "quick_win" else "Key Area to Consider"),
                    "title": item.get("title") or item.get("area") or "Recommended Next Step",
                    "summary": item.get("summary") or item.get("what_to_do") or item.get("recommendation") or "",
                    "first_step": item.get("first_step") or item.get("next_step") or "",
                })

                if len(normalized) == 3:
                    break

            return normalized

        def fallback_priority_cards_from_categories():
            categories = payload.get("priority_categories", [])
            if not isinstance(categories, list):
                categories = []

            cards = []
            for area in categories[:2]:
                cards.append({
                    "type": "key_area",
                    "label": "Key Area to Consider",
                    "title": str(area or "Business Planning"),
                    "summary": "Use the recommendations for this area as a starting point for your next advisor conversation.",
                    "first_step": "Choose one recommendation in this area and write down the decision it would help you make.",
                })

            if len(cards) < 3:
                cards.append({
                    "type": "quick_win",
                    "label": "Quick Win",
                    "title": "Report Review Starter",
                    "summary": "Start with the part of the report that feels most connected to your current business decision.",
                    "first_step": "Note one recommendation you want to act on this week.",
                })

            return cards[:3]

        def draw_priority_cards(cards):
            nonlocal y
            card_gap = 12
            card_width = (width - 100 - (card_gap * 2)) / 3
            visible_cards = normalize_priority_cards(cards)
            if not visible_cards:
                return

            card_height = max(priority_card_height(item, card_width) for item in visible_cards)
            ensure_space(card_height + 16)
            card_top = y

            for index, item in enumerate(visible_cards):
                left = x + index * (card_width + card_gap)
                is_quick_win = item.get("type") == "quick_win"
                fill_color = pdf_color("#fff3e8" if is_quick_win else "#f3f8fb")
                border_color = pdf_color("#f4d5bd" if is_quick_win else "#d7e4ef")
                accent_color = pdf_color("#c5050c" if is_quick_win else "#0c2848")
                text_color = pdf_color("#334155")
                muted_color = pdf_color("#64748b")

                pdf.setFillColor(pdf_color("#e6edf4" if not is_quick_win else "#f7dfcb"))
                pdf.roundRect(left + 2, card_top - card_height - 2, card_width, card_height, 8, fill=1, stroke=0)

                pdf.setFillColor(fill_color)
                pdf.setStrokeColor(border_color)
                pdf.setLineWidth(1)
                pdf.roundRect(left, card_top - card_height, card_width, card_height, 8, fill=1, stroke=1)

                pdf.setFillColor(accent_color)
                pdf.rect(left, card_top - 4, card_width, 4, fill=1, stroke=0)

                inner_left = left + 12
                inner_width = card_width - 24
                cursor_y = card_top - 20

                pdf.setFillColor(muted_color)
                cursor_y = draw_wrapped_in_box(
                    str(item.get("label", "Key Area to Consider")).upper(),
                    inner_left,
                    cursor_y,
                    inner_width,
                    size=7.5,
                    font="Helvetica-Bold",
                ) - 3

                pdf.setFillColor(pdf_color("#111827"))
                cursor_y = draw_wrapped_in_box(
                    item.get("title", ""),
                    inner_left,
                    cursor_y,
                    inner_width,
                    size=11,
                    font="Helvetica-Bold",
                ) - 5

                pdf.setFillColor(text_color)
                cursor_y = draw_wrapped_in_box(
                    item.get("summary", item.get("what_to_do", "")),
                    inner_left,
                    cursor_y,
                    inner_width,
                    size=8.2,
                    font="Helvetica",
                ) - 5

                first_step = str(item.get("first_step", "")).strip()
                if first_step:
                    pdf.setFillColor(text_color)
                    pdf.setFont("Helvetica-Bold", 8.2)
                    pdf.drawString(inner_left, cursor_y, "First step:")
                    label_width = pdf.stringWidth("First step: ", "Helvetica-Bold", 8.2)
                    pdf.setFont("Helvetica", 8.2)
                    draw_wrapped_in_box(
                        first_step,
                        inner_left + label_width,
                        cursor_y,
                        inner_width - label_width,
                        size=8.2,
                        font="Helvetica",
                    )

            y = card_top - card_height - 18
            pdf.setFillColor(pdf_color("#000000"))
            pdf.setStrokeColor(pdf_color("#000000"))
        
        # Header
        try:
            logo_width = 300
            logo_height = 150
            logo_x = (width - logo_width) / 2  
            pdf.drawImage("image3.png", logo_x, y - logo_height, width=logo_width, height=logo_height, preserveAspectRatio=True, mask='auto')
        except:
            pass  # If logo not found, skip silently

        y -= 150
        pdf.setFont("Helvetica-Bold", 18)
        pdf.drawString(x, y, "SBDC Assessment Results")
        y -= 25
        
        pdf.setLineWidth(1)
        pdf.line(50, y, width - 50, y)
        add_spacing(20)
        
        # Overview Section
        pdf.setFont("Helvetica-Bold", 12)
        pdf.drawString(x, y, f"Catalyst: {payload.get('catalyst', 'N/A')}")
        add_spacing(25)

        priority_recommendations = normalize_priority_cards(payload.get("priority_recommendations", []))
        if not priority_recommendations:
            priority_recommendations = fallback_priority_cards_from_categories()

        if priority_recommendations:
            pdf.setFont("Helvetica-Bold", 14)
            pdf.drawString(x, y, "Next Steps to Move Your Business Forward")
            add_spacing(15)

            snapshot_intro_paragraphs = [
                (
                    "In our many years of working with small businesses, we know that planning for your "
                    "business' future can feel overwhelming or hard to prioritize."
                ),
                (
                    "Below, you'll find three recommendations. These include two key areas to consider - "
                    "based on what you indicated as your business strengths, challenges, and reason for "
                    "planning - and one quick win that should help you take a step in the right direction "
                    "quickly. These recommendations are meant to highlight possible next steps for your own "
                    "planning and/or areas to discuss with your SBDC Consultant so they can best support you."
                ),
                (
                    "If these suggestions aren't a fit, or they are not something you can work on right now, "
                    "review the additional recommendations for more ideas to consider."
                ),
            ]
            for paragraph in snapshot_intro_paragraphs:
                write_formatted_line(paragraph, base_size=9)
                add_spacing(5)
            add_spacing(10)

            draw_priority_cards(priority_recommendations)

            add_spacing(10)

        pdf.setFont("Helvetica-Bold", 14)
        pdf.drawString(x, y, "Recommendations")
        add_spacing(15)

        recommendations_intro = (
            "Think of this assessment as a starting point for your conversation with an SBDC consultant. "
            "The recommendations below are meant to highlight possible next steps and help your advisor "
            "understand where they can best support you."
        )
        write_formatted_line(recommendations_intro, base_size=9)
        add_spacing(12)

        recs_text = payload.get("recommendations", "")
        if isinstance(recs_text, str) and recs_text:
            write_recommendations_section(recs_text)

        # ── DISCLAIMER ───────────────────────────────────────────────────────
        add_spacing(20)
        pdf.setLineWidth(0.5)
        pdf.line(50, y, width - 50, y)
        add_spacing(15)

        pdf.setFont("Helvetica-Bold", 11)
        pdf.drawString(x, y, "About This Tool")
        add_spacing(12)

        disclaimer_paragraphs = [
            (
                "This tool uses artificial intelligence (AI) to generate personalized planning insights "
                "based on your responses. The system was developed through a collaboration between the "
                "Wisconsin Small Business Development Center (SBDC) and the UW–Madison Tech Exploration Lab."
            ),
            (
                "The guidance and examples provided by this tool are based on best practices developed "
                "through more than 45 years of SBDC experience supporting small businesses and entrepreneurs. "
                "These practices were translated into structured prompts and frameworks that the AI uses to "
                "generate tailored recommendations."
            ),
            (
                "The technology behind this tool was built using Google's Gemini AI platform (2.0) and "
                "developed with technical support from the UW–Madison Tech Exploration Lab. The Lab is a "
                "collaboration between the Wisconsin Institute for Discovery, the Wisconsin School of Business, "
                "and other campus partners, and connects organizations with talented students to solve "
                "real-world problems."
            ),
            (
                "While this tool is designed to provide helpful ideas and structured guidance, AI-generated "
                "content can occasionally contain errors, omissions, or misinterpretations. The recommendations "
                "are intended to support reflection and planning—not to replace professional advice."
            ),
            (
                "For deeper discussion, interpretation of results, or personalized strategy support, we "
                "encourage you to connect with an SBDC consultant for confidential, one-on-one advising."
            ),
        ]

        for para in disclaimer_paragraphs:
            write_formatted_line(para, base_size=9)
            add_spacing(8)

        # ── PAGE BREAK BEFORE RESPONSES ──────────────────────────────────────
        pdf.showPage()
        y = height - 60

        
        # Detailed Responses Section
        pdf.setFont("Helvetica-Bold", 14)
        pdf.drawString(x, y, "Your Responses by Category")
        add_spacing(15)
        
        # Iterate through each functional area
        for area_name, questions in config.questions["assessment"].items():
            area_details = payload.get("category_details", {}).get(area_name, {})
            area_note = area_notes.get(area_name, "").strip()
            if area_details.get("questions_answered", 0) == 0 and not area_note:
                continue
            # Area header
            pdf.setFont("Helvetica-Bold", 12)
            display_name = area_name.replace("_", " & ")
            pdf.drawString(x, y, display_name)
            add_spacing(12)

            if area_note:
                write_formatted_line("**Additional context shared:**", base_size=10, indent=5)
                write_formatted_line(area_note, base_size=10, indent=10)
                add_spacing(8)
            
            if area_details.get("questions_answered", 0) > 0:
                # Questions for this area
                for q in questions:
                    q_id = q["id"]
                    q_text = q["question"]
                    
                    # Get user's answer
                    user_score = answers_dict.get(q_id, "N/A")
                    
                    # Get the label for the score
                    score_label = "Not Answered"
                    if user_score != "N/A" and str(user_score) in q["scoring_scale"]:
                        score_label = q["scoring_scale"][str(user_score)]
                    
                    # Question text (wrapped)
                    pdf.setFont("Helvetica", 10)
                    write_formatted_line(f"**{q_id}:** {q_text}", base_size=10, indent=5)
                    
                    # Answer
                    pdf.setFont("Helvetica-Oblique", 10)
                    pdf.drawString(x + 10, y, f"Your answer: {user_score} - {score_label}")
                    add_spacing(18)
                    
                    # Check if we need a new page
                    if y < 100:
                        pdf.showPage()
                        y = height - 60
            
            # Add space between areas
            add_spacing(15)
            
            # Check if we need a new page
            if y < 150:
                pdf.showPage()
                y = height - 60
        
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

app.mount("/", StaticFiles(directory=".", html=True), name="static")
