# Handoff Checklist

Use this checklist when transferring the app to SBDC ownership.

## Code Ownership

- [ ] SBDC has a GitHub organization or repository owner account.
- [ ] Repository has been transferred to SBDC.
- [ ] Default branch is `main`.
- [ ] SBDC can clone, commit, and push to the repository.

## Hosting Ownership

- [ ] SBDC has a Render workspace or organization.
- [ ] Render billing is owned by SBDC.
- [ ] Render service is connected to the SBDC-owned GitHub repository.
- [ ] Render deploys from `main`.
- [ ] Health check path `/health` works.

## API And Secrets

- [ ] SBDC owns the OpenRouter account/project used in production.
- [ ] `OPENROUTER_API_KEY` in Render uses an SBDC-owned key.
- [ ] Old personal API keys are revoked after production is verified.
- [ ] No real secrets are committed to GitHub.
- [ ] `.env.example` is present and contains placeholders only.

## Documentation

- [ ] `README.md` explains what the app does and how to run it locally.
- [ ] `docs/start-here.md` is reviewed as the non-technical handoff starting point.
- [ ] `docs/file-guide.md` is reviewed so SBDC knows what each file controls.
- [ ] `docs/content-editing-guide.md` is reviewed with anyone who may update questions or recommendation language.
- [ ] `docs/prompt-and-ai-guide.md` is reviewed with anyone responsible for AI output quality.
- [ ] `docs/troubleshooting.md` is reviewed with anyone supporting the live app.
- [ ] `.env.example` lists required and optional environment variables.
- [ ] `docs/deployment.md` documents Render setup.
- [ ] `docs/operations.md` documents routine maintenance.
- [ ] `docs/security/network-diagram.md` is reviewed.
- [ ] `docs/security/data-flow-diagram.md` is reviewed.

## Acceptance Test

- [ ] Production app loads.
- [ ] Assessment can be completed.
- [ ] Priority cards display.
- [ ] Additional recommendations display.
- [ ] PDF download works.
- [ ] Survey popup works.
- [ ] Render logs show no startup errors.
- [ ] SBDC confirms billing, repo, API, and survey ownership.

## Signoff

Project transferred by:

Date:

Accepted by SBDC:

Date:
