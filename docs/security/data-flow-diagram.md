# Data Flow Diagram

This diagram shows how user-supplied data and LLM output move through the application.

## Data Elements

- Assessment answers
- Area notes entered by the business owner
- Derived scoring and tier calculations
- AI-generated recommendations
- PDF export payload

## Mermaid Diagram

```mermaid
flowchart TD
    U[User Input]
    F[Frontend\nindex.html + app.js]
    L[Browser localStorage]
    B[FastAPI Backend\nPOST /assess]
    S[AssessmentService]
    CFG[Config JSON Files]
    AI[Google Gemini API]
    R[Assessment Response JSON]
    P[PDF Export Endpoint\nPOST /export-pdf]
    PDF[Generated PDF]

    U -->|Answers and area notes| F
    F -->|Persist sanitized notes and answers| L
    F -->|Submit JSON payload| B
    B -->|Validate request body| S
    S -->|Read prompts, rules, and scoring config| CFG
    S -->|Build prompt with answers and notes| AI
    AI -->|Return recommendation text| S
    S -->|Return scores and recommendations| R
    R --> F
    F -->|Render sanitized markdown/HTML| U
    F -->|Send recommendations and answers| P
    P -->|Create PDF in memory| PDF
    PDF -->|Binary PDF response| F
```

## Trust Boundaries

- Boundary 1: Browser to backend
  User-controlled data enters the system through `answers` and `area_notes`.
- Boundary 2: Backend to third-party AI provider
  Prompt content built from user responses is sent to Google Gemini.
- Boundary 3: LLM output back into the browser
  Recommendation text is rendered in the frontend and must be sanitized before HTML insertion.

## Current Implementation References

- Frontend submission flow: [app.js](/Users/devanshijain/SBDC/app.js:659)
- Local persistence: [app.js](/Users/devanshijain/SBDC/app.js:81)
- Backend assessment endpoint: [main.py](/Users/devanshijain/SBDC/main.py:41)
- Gemini integration: [services.py](/Users/devanshijain/SBDC/services.py:36)
- PDF export endpoint: [main.py](/Users/devanshijain/SBDC/main.py:74)
