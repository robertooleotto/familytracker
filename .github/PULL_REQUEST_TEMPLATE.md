<!-- Thank you for the PR. Keep this template intact and fill in each section. -->

## What & Why
<!-- One short paragraph: what this change does and why it is needed. -->

## How
<!-- Bullet points or short prose describing the implementation approach.
     Mention any architectural decisions or trade-offs. -->

## Database changes
<!-- Tick all that apply. Delete the section if no DB change. -->
- [ ] No database changes
- [ ] New Drizzle migration added under `migrations/`
- [ ] `npx drizzle-kit check` passes locally
- [ ] Migration is reversible OR a rollback plan is documented below
- [ ] RLS policies updated for any new table

## Testing
<!-- How did you verify this works? Manual steps, screenshots, test names. -->
- [ ] `npm run check` (TypeScript) passes
- [ ] `npm run build` succeeds
- [ ] Manually tested in dev with a real account
- [ ] New automated test added (E2E or unit)

## Risk & rollback
<!-- What is the blast radius if this goes wrong? How do we revert? -->

## Screenshots / recordings
<!-- For any UI change. Drag-and-drop here. -->
