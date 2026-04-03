# Days grouping and counting

## Assumptions to confirm with the team

  ### About how the sheet is used today

  1. A row with an empty day column (col A) means the activity is an unconfirmed option — not yet assigned to a trip day.
  2. The day number is a deliberate semantic tag, not a row sequence. An activity can appear anywhere in the sheet and still belong to day 1 (e.g., accommodation entered last).
  3. A single activity can span the whole trip but still be tagged to one day (e.g., accommodation tagged as day 1).

  ### About grouping and counting

  4. The day number is the correct grouping key — not the date.
  5. tripDays (shown on the estimate) should count only confirmed days (non-empty day number), not unconfirmed options.
  6. Unconfirmed options should appear at the bottom of the activity list, visually separated from confirmed days.

  ### About totals

  7. Should unconfirmed options be included in grandTotal? (Two valid answers: "yes, show the full possible cost" vs "no, only confirmed activities.")

  ### About the current bug

  8. The current code silently drops any activity row with an empty day column. This is a bug — unconfirmed option rows are disappearing from the rendered estimate.