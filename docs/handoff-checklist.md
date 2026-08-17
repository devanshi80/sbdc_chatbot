# Handoff Checklist

Use this checklist when transferring the app to SBDC ownership.

## Code Ownership

- [ ] SBDC has a GitHub organization or repository owner account.
- [ ] Repository has been transferred to SBDC.
- [ ] SBDC has at least two repository admins.
- [ ] Default branch is `main`.
- [ ] SBDC can clone, commit, and push to the repository.
- [ ] Former personal owner access is removed or reduced to collaborator status, if appropriate.

## Hosting Ownership

- [ ] SBDC has a Render workspace or organization.
- [ ] Render billing is owned by SBDC.
- [ ] Render service is connected to the SBDC-owned GitHub repository.
- [ ] Render deploys from `main`.
- [ ] Health check path `/health` works.
- [ ] SBDC has at least two Render admins or equivalent owners.
- [ ] Former personal payment methods are removed.

## API And Secrets

- [ ] SBDC owns the OpenRouter account/project used in production.
- [ ] `OPENROUTER_API_KEY` in Render uses an SBDC-owned key.
- [ ] Optional model variables are documented and reviewed.
- [ ] Old personal API keys are revoked after production is verified.
- [ ] No real secrets are committed to GitHub.
- [ ] `.env.example` is present and contains placeholders only.

## Qualtrics Survey

- [ ] SBDC owns or can administer the Qualtrics survey.
- [ ] Survey link in `app.js` points to the approved production survey.
- [ ] Survey popup appears 10 seconds after full recommendations are displayed.
- [ ] "Take Survey" opens the Qualtrics form.

## Documentation

- [ ] `README.md` explains what the app does and how to run it locally.
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
