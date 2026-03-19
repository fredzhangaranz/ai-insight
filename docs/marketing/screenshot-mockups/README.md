# SAWC Marketing Screenshot Mockups

Static HTML mockups for capturing marketing screenshots for the **Ask, Analyze, Act** section at SAWC conference. Mockups match the actual InsightGen UI layout.

## Quick Start

1. Open `index.html` in a browser.
2. Use the floating nav (bottom-right) to jump between screens.
3. Capture each screen with Cmd+Shift+4 (macOS) or Print Screen (Windows).
4. To hide the nav: Open DevTools (F12), Console, run: `document.body.classList.add('hide-for-screenshot')`

## Screenshot Checklist

### Question 1: High-risk patients (wound area ≤30% reduction)

| # | Screen ID | Description |
|---|-----------|-------------|
| 1 | Q1-1 | Question input page – "Find patients whose wound surface area has not decreased by **at least 30%** in the last 4 weeks." ChatGPT-4o selected |
| 2 | Q1-1C | Clarification dialog – time window (last 4 weeks), wound types (all/pressure/diabetic) |
| 3 | Q1-2 | Results table – 240 records with % change column, showing high-risk patients |
| 4 | Q1-3 | Conversation UI – empty state with suggested follow-up prompts |
| 5 | Q1-4 | Follow-up question input – "Show me the percentage reduction of wound area for each of these patients over the past 8 weeks." |
| 6 | Q1-5 | Line chart – % reduction trends over 8 weeks for 5 patients |

### Question 2: Assessments per month (fiscal year: Jul 2024 – Jun 2025)

| # | Screen ID | Description |
|---|-----------|-------------|
| 1 | Q2-1 | Question input page – "Show me the number of wound assessments completed per month between July 2024 and June 2025." |
| 2 | Q2-1C | Clarification dialog – date confirmation (fiscal year: Jul 1, 2024 – Jun 30, 2025) |
| 3 | Q2-2 | Results table – 12 months with assessment counts (July 2024 – June 2025) |
| 4 | Q2-3 | Bar chart – monthly assessment volume with summary stats |

## Design Notes

- **AI Model**: All screens show "ChatGPT-4o" (OpenAI) as the selected model for perceived trust.
- **Question 1 wording**: Bold "at least 30%" to clarify the range includes 0–30% (not just negative).
- **Question 2**: Fixed date range (Jul 1, 2024 – Jun 30, 2025) aligns with hospital fiscal year – no clarification step needed.
- **Conversation UI**: Mimics actual InsightGen follow-up patterns (empty state → suggestions → input).
- **Data**: All data is representative mock; reflects realistic volumes.

## File Structure

```
docs/marketing/screenshot-mockups/
├── README.md       # This file
└── index.html      # 8 mockup screens (Q1-1 through Q2-3)
```

## Notes for Marketing

- Q1-2 shows the **actual results UI** (not a clarification dialog) – matches the real app behavior.
- Q1-3 shows the **conversation panel** with suggested prompts – ready for follow-up.
- Q2-2 shows **results directly** without clarification (date range auto-accepted).
- All charts are styled to match production UI (Tailwind, blue color scheme).
- No real data or database required – all mockup data is hardcoded.
