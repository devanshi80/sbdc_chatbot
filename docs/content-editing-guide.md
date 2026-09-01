# Content Editing Guide

This guide explains what can be safely updated and how to check the work afterward.

Most content lives in JSON files. JSON is strict about formatting:

- Use double quotes, not single quotes.
- Put commas between items, but not after the last item in a list.
- Keep curly braces `{}` and square brackets `[]` balanced.
- Do not delete IDs unless you are intentionally changing how the app tracks answers.

## Editing Assessment Questions

File: `questions.json`

Each question has:

- `id`: A stable question code, such as `FIN-001`
- `question`: The question shown to the user
- `type`: The answer scale type
- `scoring_scale`: The answer choices
- `reflection`: Optional reflection language connected to the question area

Best practice:

- Keep existing IDs stable when editing wording.
- Add new questions with a new ID that follows the same pattern.
- Keep scores from `0` to `4`.
- Keep `N/A` only where it makes sense.
- Make sure the section name still matches one of the six functional areas.

After editing, run:

```bash
python -m unittest discover -s tests
```

## Editing Recommendation Source Language

File: `functional_area.json`

This is the recommendation library. The AI does not simply copy this file word-for-word every time, but it uses this content as source material.

Good recommendation entries should be:

- Practical
- Specific enough for a small business owner
- Written in plain language
- Supportive, not judgmental
- Safe for many business types

Avoid:

- Promising legal, tax, medical, or financial outcomes
- Language that sounds like a diagnosis
- Advice that assumes the business has staff, inventory, loans, or a storefront unless the context clearly supports it
- Very long paragraphs

## Editing Tone

File: `tone.json`

This file controls tone and opening language by tier and business situation. Use it when SBDC wants the report to sound warmer, more direct, more cautious, or more growth-oriented.

Keep the language:

- Encouraging
- Clear
- Appropriate for an owner who may be under pressure
- Consistent with SBDC's advising style

## Editing Catalysts

File: `catalyst.json`

Catalysts are the current business situations users choose near the start of the assessment.

Changing catalyst names requires extra care because names are also referenced in code and other JSON files. Editing descriptions is safer than renaming the catalyst.

## Editing Priority Rankings

File: `priority_rankings.json`

This file helps decide which question gaps should be considered more urgent for each catalyst.

Lower rank numbers mean the question is more important for that catalyst. For example, rank `1` has more weight than rank `8`.

Change this file when SBDC wants the priority cards to pay more attention to certain topics for certain business situations.

## Editing The Survey Link

File: `app.js`

Look for:

```js
const surveyUrl = "https://uwmadison.co1.qualtrics.com/jfe/form/SV_3C8TWBh3zFHZNFc";
```

Replace the URL with the approved SBDC Qualtrics link.

Then run:

```bash
node --check app.js
```

## What To Test After Content Changes

After any content edit:

1. Run the automated tests.
2. Start the app locally.
3. Complete one sample assessment.
4. Confirm priority cards appear.
5. Confirm full recommendations appear.
6. Download the PDF and skim it.
7. Confirm the language feels appropriate for SBDC.

