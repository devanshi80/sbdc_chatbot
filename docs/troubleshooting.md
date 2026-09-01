# Troubleshooting

This guide covers common issues during setup, deployment, and routine maintenance.

## The App Will Not Start Locally

Check that Python dependencies are installed:

```bash
pip install -r requirements.txt
```

Check that `.env` exists and includes:

```text
OPENROUTER_API_KEY=your_key_here
```

Then run:

```bash
uvicorn main:app --reload
```

## Render Deploy Fails

Confirm Render is using:

Build command:

```bash
pip install -r requirements.txt
```

Start command:

```bash
uvicorn main:app --host 0.0.0.0 --port $PORT
```

Also confirm `OPENROUTER_API_KEY` is set in Render environment variables.

## The Site Loads But Recommendations Fail

Likely causes:

- Missing or invalid OpenRouter API key
- OpenRouter account billing or usage limit issue
- Temporary OpenRouter outage
- Model name in `OPENROUTER_MODEL` is invalid
- The AI response was not in the expected format

What to do:

1. Check Render logs.
2. Confirm the OpenRouter key is active.
3. Confirm OpenRouter billing or credits are available.
4. Try the default model value: `openai/gpt-4o-mini`.
5. Run one local test assessment.

## Questions Do Not Load

Likely causes:

- `questions.json` has invalid JSON formatting
- A recent edit removed a required field
- The backend did not restart after a change

What to do:

```bash
python -m json.tool questions.json
python -m py_compile main.py services.py schema.py priority.py
```

## A JSON File Was Edited And The App Broke

Run this command on the changed JSON file:

```bash
python -m json.tool filename.json
```

Replace `filename.json` with the file you edited.

Common JSON mistakes:

- Missing comma between entries
- Extra comma after the last entry
- Single quotes instead of double quotes
- Missing closing brace or bracket

## PDF Download Does Not Work

Likely causes:

- The recommendation text has unexpected formatting
- The browser request to `/export-pdf` failed
- A code change affected the PDF route in `main.py`

What to do:

1. Check the browser console.
2. Check Render logs.
3. Run a local assessment and try PDF download.
4. Run:

```bash
python -m py_compile main.py
```

## Survey Popup Does Not Appear

The survey prompt appears only after full recommendations finish loading, then waits about 10 seconds.

Check:

- The full recommendations finished loading.
- The user has not already dismissed the survey during this browser session.
- The `surveyUrl` value in `app.js` is correct.

To retest in the same browser, close the tab and open a new session or clear session storage.

## Changes Do Not Show Up On The Live Site

Check:

- The change was committed and pushed to the branch Render deploys from.
- Render completed a new deploy.
- The browser is not showing an old cached version.

Try a hard refresh in the browser after the deploy finishes.

## Basic Validation Commands

Run these before handing off a change:

```bash
python -m unittest discover -s tests
node --check app.js
python -m py_compile main.py services.py schema.py priority.py
```

