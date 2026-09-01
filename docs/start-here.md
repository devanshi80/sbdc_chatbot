# Start Here

This is the plain-English handoff guide for the Business Assessment Tool.

The tool asks business owners a guided set of questions, scores their answers across six business areas, and uses AI to turn those results into practical recommendations. It is built as one web app: the same service shows the website, receives answers, generates recommendations, and creates the PDF report.

## Who This Is For

- Program staff who need to understand what the tool does
- SBDC team members who may update questions or recommendation language
- Operations staff who may own Render, GitHub, OpenRouter, or Qualtrics
- A future developer who may maintain the code

## The Main Documents

- [README.md](/Users/devanshijain/SBDC/README.md): project summary, setup, and links
- [deployment.md](/Users/devanshijain/SBDC/docs/deployment.md): how to put the app on Render
- [operations.md](/Users/devanshijain/SBDC/docs/operations.md): recurring maintenance tasks
- [file-guide.md](/Users/devanshijain/SBDC/docs/file-guide.md): what each file is for
- [content-editing-guide.md](/Users/devanshijain/SBDC/docs/content-editing-guide.md): what SBDC can safely edit
- [prompt-and-ai-guide.md](/Users/devanshijain/SBDC/docs/prompt-and-ai-guide.md): how the recommendation prompts work
- [troubleshooting.md](/Users/devanshijain/SBDC/docs/troubleshooting.md): common issues and fixes
- [handoff-checklist.md](/Users/devanshijain/SBDC/docs/handoff-checklist.md): final transfer checklist

## How The App Works 

1. The browser loads the website from Render.
2. The app loads questions from `questions.json`.
3. The business owner answers questions and may add notes.
4. The backend scores the answers using `rules.json`.
5. The backend chooses priority signals using `priority_rankings.json`.
6. The backend sends a carefully written prompt to OpenRouter.
7. OpenRouter returns recommendation text.
8. The website shows priority cards first, then the longer recommendations.
9. The user can download a PDF report.
10. A Qualtrics survey prompt appears after the full recommendations load.

## What SBDC Can Change Without Rebuilding The App

SBDC can update many parts by editing JSON files or a small text value:

- Assessment questions: `questions.json`
- Recommendation source language: `functional_area.json`
- Tone and opening language: `tone.json`
- Catalyst definitions: `catalyst.json`
- Priority weighting: `priority_rankings.json`
- Survey link: `app.js`
- AI model choice: Render environment variable `OPENROUTER_MODEL`

For step-by-step guidance, use [content-editing-guide.md](/Users/devanshijain/SBDC/docs/content-editing-guide.md).

## What Needs More Care

- Changing how scores are calculated
- Changing the prompt structure in `services.py`
- Changing PDF layout in `main.py`
- Changing the website flow in `app.js`
- Adding user accounts, saved reports, a database, or new integrations

## Security Basics

- Never put real API keys in GitHub.
- Keep the OpenRouter key in Render environment variables only.
- Rotate the OpenRouter key after handoff.
- Treat free-text area notes as potentially sensitive business information.
- Review the security diagrams in `docs/security/`.

