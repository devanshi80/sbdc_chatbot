# File Guide

This guide explains what each project file does in plain language.

## Main App Files

- `index.html`: The web page structure users see in the browser.
- `styles.css`: The visual design, spacing, colors, and responsive layout.
- `app.js`: The browser-side experience. It loads questions, saves in-progress answers in the browser, handles navigation, submits answers, shows results, downloads the PDF, and opens the survey prompt.
- `main.py`: The backend web service. It defines the app's API routes, serves the frontend files, runs assessment requests, and creates PDFs.
- `services.py`: The main business logic. It loads the JSON files, calculates scores, selects priority signals, builds prompts, calls OpenRouter, and formats recommendation results.
- `priority.py`: The priority selection helper. It combines low scores, catalyst rankings, and owner notes to identify useful recommendation candidates.
- `schema.py`: The expected request and response shapes. This helps the backend check that incoming assessment data is valid.
- `config.py`: Loads the JSON configuration files so the app can use them.

## Content And Configuration Files

- `questions.json`: The assessment questions, answer labels, question IDs, and section groupings.
- `rules.json`: The scoring tiers and whole-business summary language.
- `functional_area.json`: The recommendation library used as source material for full recommendations.
- `tone.json`: Tone and opening language based on the business situation and tier.
- `catalyst.json`: The business situations a user can choose, such as Economic Uncertainty or New Opportunity.
- `priority_rankings.json`: Weighting used to decide which question gaps matter most for each business situation.
- `.env.example`: A safe template showing which environment variables are needed. It should not contain real secrets.
- `requirements.txt`: Python packages needed to run the app.
- `runtime.txt`: Python runtime hint for deployment platforms such as Render.

## Images

- `wsb_logo.png`: Logo image used by the website.
- `image 2.png`, `image3.png`: Project image assets. Review whether these are still used before removing them.

## Tests

- `tests/test_priority.py`: Automated checks for the priority selection logic.

## Documentation

- `README.md`: Main project overview.
- `docs/start-here.md`: Plain-English handoff starting point.
- `docs/deployment.md`: Render deployment steps.
- `docs/operations.md`: Routine maintenance steps.
- `docs/content-editing-guide.md`: How to edit questions, recommendations, survey links, and related content.
- `docs/prompt-and-ai-guide.md`: How the AI prompting works.
- `docs/troubleshooting.md`: Common problems and fixes.
- `docs/handoff-checklist.md`: Ownership transfer checklist.
- `docs/security/network-diagram.md`: Runtime network diagram.
- `docs/security/data-flow-diagram.md`: User data flow diagram.

## Files Most People Should Not Need To Edit

Most non-developer maintenance can happen in the JSON files. The Python and JavaScript files should be edited more carefully because a small syntax error can stop the app from loading or deploying.

