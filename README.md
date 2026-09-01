# SBDC Business Assessment Tool

An AI-powered business assessment tool for the Wisconsin Small Business Development Center. Users answer questions across six business areas, choose the current business situation they are planning around, and receive priority recommendation cards plus a longer downloadable report.

The app is a single FastAPI service that serves both the backend API and the static frontend.

## What The App Does

- Presents a guided assessment from `questions.json`
- Scores answers by functional area using `rules.json`
- Generates three priority recommendation cards
- Generates additional recommendations asynchronously after the first result screen appears
- Exports the completed assessment and recommendations as a PDF
- Shows a Qualtrics survey prompt 10 seconds after full recommendations finish loading

## Tech Stack

- Backend: Python, FastAPI
- Frontend: Vanilla HTML, CSS, JavaScript
- AI provider: OpenRouter API
- PDF generation: ReportLab
- Hosting: Render Web Service

## Repository Layout

- `main.py`: FastAPI routes, static file serving, PDF export
- `services.py`: scoring support, OpenRouter calls, recommendation generation
- `schema.py`: Pydantic request/response models
- `app.js`: frontend assessment flow, results UI, survey popup
- `styles.css`: frontend styling
- `questions.json`: assessment questions
- `functional_area.json`: recommendation anchor library
- `tone.json`: tone/opening copy by tier and catalyst
- `rules.json`: scoring and tier rules
- `catalyst.json`: catalyst definitions and focus areas
- `priority_rankings.json`: priority card selection weights
- `docs/`: deployment, operations, handoff, and security docs

## Prerequisites

- Python 3.9+
- An OpenRouter API key owned by the organization running the app

## Local Setup

1. Clone the repository.

```bash
git clone https://github.com/devanshi80/sbdc_chatbot.git
cd sbdc_chatbot
```

2. Create and activate a virtual environment.

```bash
python -m venv .venv
source .venv/bin/activate
```

3. Install dependencies.

```bash
pip install -r requirements.txt
```

4. Create local environment variables.

```bash
cp .env.example .env
```

Edit `.env` and set `OPENROUTER_API_KEY`.

5. Run the app.

```bash
uvicorn main:app --reload
```

Open `http://127.0.0.1:8000`.

## Required Environment Variables

Only one secret is required:

- `OPENROUTER_API_KEY`: OpenRouter API key used for model and embedding calls

Optional variables are documented in `.env.example` and [docs/deployment.md](docs/deployment.md).

## Deployment

This app is intended to run on Render as a Web Service.

Recommended Render commands:

```bash
pip install -r requirements.txt
```

```bash
uvicorn main:app --host 0.0.0.0 --port $PORT
```

See [docs/deployment.md](docs/deployment.md) for full Render setup and environment variable instructions.

## Operations

Common maintenance tasks are documented in [docs/operations.md](docs/operations.md), including:

- Updating the Qualtrics survey link
- Rotating the OpenRouter API key
- Updating questions, scoring, prompts, and recommendation anchors
- Running local validation checks

## Documentation For Handoff

Recommended reading order for SBDC:

1. [docs/start-here.md](docs/start-here.md)
2. [docs/file-guide.md](docs/file-guide.md)
3. [docs/content-editing-guide.md](docs/content-editing-guide.md)
4. [docs/prompt-and-ai-guide.md](docs/prompt-and-ai-guide.md)
5. [docs/deployment.md](docs/deployment.md)
6. [docs/troubleshooting.md](docs/troubleshooting.md)
7. [docs/handoff-checklist.md](docs/handoff-checklist.md)

## Handoff

Use [docs/handoff-checklist.md](docs/handoff-checklist.md) to transfer ownership of:

- GitHub repository
- Render service and billing
- OpenRouter/OpenAI API billing and keys
- Qualtrics survey ownership
- Documentation and operational access

## Security Notes

- Do not commit real API keys or `.env` files.
- Use an SBDC-owned API key and Render billing account for production.
- Rotate keys after handoff.
- Existing security diagrams are in [docs/security/network-diagram.md](docs/security/network-diagram.md) and [docs/security/data-flow-diagram.md](docs/security/data-flow-diagram.md).

## Verification Commands

```bash
python -m unittest discover -s tests
node --check app.js
python -m py_compile main.py services.py schema.py priority.py
```
