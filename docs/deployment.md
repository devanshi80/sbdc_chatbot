# Deployment

This app deploys as a Render Web Service. The FastAPI backend serves the API and the static frontend from the same service.

## Render Service Settings

- Service type: Web Service
- Runtime: Python
- Branch: `main`
- Build command:

```bash
pip install -r requirements.txt
```

- Start command:

```bash
uvicorn main:app --host 0.0.0.0 --port $PORT
```

- Health check path:

```text
/health
```

## Environment Variables

Set these in Render under the service's Environment settings.

Required:

- `OPENROUTER_API_KEY`: SBDC-owned OpenRouter API key

Optional:

- `OPENROUTER_MODEL`: default text model, currently `openai/gpt-4o-mini`
- `OPENROUTER_PRIORITY_MODEL`: priority card model override
- `OPENROUTER_RECOMMENDATION_MODEL`: full recommendation model override
- `OPENROUTER_SIGNAL_MODEL`: area-note signal model override
- `OPENROUTER_EMBEDDING_MODEL`: embedding model, currently `openai/text-embedding-3-small`
- `OPENROUTER_HTTP_REFERER`: production URL for OpenRouter request metadata
- `OPENROUTER_APP_TITLE`: display title for OpenRouter request metadata

Do not put real secrets in GitHub. Use `.env.example` only as a template.

## Initial Deployment Steps

1. Transfer the GitHub repository to the SBDC-owned GitHub organization or account.
2. Create or confirm an SBDC-owned Render workspace with SBDC billing.
3. Create a new Render Web Service connected to the transferred GitHub repository.
4. Set the build and start commands above.
5. Add the environment variables.
6. Deploy from `main`.
7. Open `/health` and confirm it returns `{"status":"ok"}`.
8. Complete a test assessment and confirm:
   - Priority cards appear.
   - Additional recommendations generate.
   - PDF download works.
   - Survey popup appears after additional recommendations finish.

## Updating An Existing Render Service

1. Push changes to `main`.
2. Confirm Render starts a deploy automatically, or click Manual Deploy in Render.
3. Watch deploy logs for dependency or startup errors.
4. Test the production URL after deploy.

## API Key Rotation

1. Create a new SBDC-owned OpenRouter API key.
2. Replace `OPENROUTER_API_KEY` in Render.
3. Trigger a deploy or restart the service.
4. Run a test assessment.
5. Revoke the old key after the new key works.
