# Prompt And AI Guide

This app uses AI to turn assessment results into readable recommendations. The scoring system and JSON files decide the context; the AI writes the final plain-language response.

## AI Provider

The app uses OpenRouter. The production API key should be owned by SBDC and stored in Render as:

```text
OPENROUTER_API_KEY
```

The text model can be changed with:

```text
OPENROUTER_MODEL
```

The current default is:

```text
openai/gpt-4o-mini
```

The app also uses an embedding model internally to match owner notes with relevant recommendation library items:

```text
openai/text-embedding-3-small
```

SBDC does not need to configure the embedding model separately.

## What The AI Receives

The AI may receive:

- Selected business situation, also called the catalyst
- Answer scores and question context
- Area notes typed by the owner
- The owner's selected focus area
- Candidate priority signals selected by the scoring system
- Recommendation library entries from `functional_area.json`
- Tone guidance from the app's JSON files and prompt instructions

The app does not currently use a database. It sends information to OpenRouter at the time recommendations are generated.

## Priority Cards

The first AI call creates exactly three cards:

- Two "Key Area to Consider" cards
- One "Quick Win" card

The prompt tells the AI to:

- Avoid rank-order language
- Avoid showing scores, tiers, or formulas
- Use plain supportive language
- Make the quick win low-cost and doable soon
- Return a specific JSON shape so the website can display it reliably

Main code location:

```text
services.py -> generate_priority_recommendations
```

## Full Recommendations

The full recommendation report is generated after the initial results appear. This makes the app feel faster because users see the priority cards first instead of waiting for the entire report.

The full report uses:

- Functional area scores
- Skipped sections
- Area notes
- Catalyst context
- Recommendation source material
- AI instructions about format and tone

Main code location:

```text
services.py -> generate_recommendations
services.py -> _generate_single_area_recommendation
```

## Note Signals

The app looks at written owner notes for signals such as:

- Cash pressure
- Capacity or burnout
- Demand issues
- Supplier or inventory risk
- Owner dependency
- Team process issues
- New opportunity feasibility
- Section does not apply

These signals help the app choose better recommendation candidates. If the AI note classifier fails, the app falls back to simple keyword matching.

Main code locations:

```text
services.py -> classify_area_note_signals
priority.py -> NOTE_SIGNAL_PATTERNS
```

## Prompt Engineering Choices

The prompts are designed to do four things:

1. Keep the response practical for small business owners.
2. Prevent the AI from exposing internal scores or formulas.
3. Keep the language supportive and easy to read.
4. Force structured JSON output where the app needs predictable fields.

Because user notes are included as context, the prompt also tells the AI to treat owner-written notes as descriptive information, not as instructions. This helps reduce the risk of a user note accidentally steering the AI outside the intended task.

## When To Change Prompts

Change prompts when:

- Recommendations sound too generic
- Recommendations are too long or too short
- The tone does not match SBDC's advising style
- The output format needs to change
- The AI is showing information that should stay hidden, such as scores or formulas

Prompt changes should be tested with several sample assessments before production.

