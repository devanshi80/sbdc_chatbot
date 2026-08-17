# Operations

This document covers common maintenance tasks after handoff.

## Update The Qualtrics Survey Link

The survey popup link is defined in `app.js`:

```js
const surveyUrl = "https://uwmadison.co1.qualtrics.com/jfe/form/SV_3C8TWBh3zFHZNFc";
```

To update it:

1. Replace the URL with the new SBDC Qualtrics link.
2. Run `node --check app.js`.
3. Commit and push the change.
4. Deploy on Render.
5. Generate a report and confirm the popup opens the new link.

## Update The API Key

Use an organization-owned OpenRouter key in Render.

1. Create the new key in OpenRouter.
2. In Render, update `OPENROUTER_API_KEY`.
3. Restart or redeploy the service.
4. Run a test assessment.
5. Revoke the old key.

Do not paste real keys into GitHub, documentation, screenshots, issue comments, or chat logs.

## Update Models

Model names are controlled by environment variables:

- `OPENROUTER_MODEL`
- `OPENROUTER_PRIORITY_MODEL`
- `OPENROUTER_RECOMMENDATION_MODEL`
- `OPENROUTER_SIGNAL_MODEL`
- `OPENROUTER_EMBEDDING_MODEL`

Use task-specific variables when only one part of the app should change. For example, update `OPENROUTER_RECOMMENDATION_MODEL` if full recommendations need a different model but priority cards should stay unchanged.

## Update Assessment Questions

Assessment questions live in `questions.json`.

After editing:

1. Keep question IDs stable when possible, because saved browser progress uses IDs.
2. Confirm each scored question has a valid `scoring_scale`.
3. Confirm section names still match the functional area names used elsewhere.
4. Run:

```bash
python -m unittest discover -s tests
```

## Update Scoring Or Tiers

Scoring and tier rules live in `rules.json`.

After editing:

1. Confirm tier boundary values are ordered correctly.
2. Run the test suite.
3. Complete a sample assessment locally to confirm categories and tiers display as expected.

## Update Recommendation Anchors

Recommendation anchor content lives in `functional_area.json`.

The recommendation generator uses these anchors as starting points and may adapt them based on the user's catalyst, scores, selected focus area, and written area notes.

After editing:

1. Preserve the existing JSON structure.
2. Keep recommendation text practical and user-facing.
3. Run the test suite.
4. Generate a sample report.

## Update Tone Or Catalyst Copy

- `tone.json`: opening statements by tier and catalyst
- `catalyst.json`: catalyst definitions and focus areas
- `priority_rankings.json`: priority selection weights

After editing any of these files, run tests and complete a sample assessment.

## Update Recommendation Prompts

Prompt logic lives in `services.py`.

Main areas:

- `generate_priority_recommendations`: priority card prompt
- `_generate_single_area_recommendation`: full recommendation prompt
- `_priority_response_format`: required JSON shape for priority cards
- `_recommendation_response_format`: required JSON shape for full recommendations

After editing prompt or schema logic:

```bash
python -m unittest discover -s tests
python -m py_compile main.py services.py schema.py priority.py
```

## Local Smoke Test

```bash
uvicorn main:app --reload
```

Then open `http://127.0.0.1:8000` and complete one assessment.

Confirm:

- The first results page appears.
- Additional recommendations finish loading.
- PDF download works.
- Survey popup appears after the full recommendations are displayed.
