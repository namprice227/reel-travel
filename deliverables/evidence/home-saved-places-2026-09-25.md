# Home saved places — 25 September 2026

The user requested a Home-only change: remove the **Saved to your account** dropdown and show saved items rather than reels in **From your saves**. After a proposed design, the user said to continue. The existing boxes now show up to three recent source-backed saved places from the Library read model, ordered by save time. Each box shows its name, area or country, category and country/neutral cover and links to that place's Library detail. **Add a save** and **Open library** remain.

The reel dropdown is removed. Failed or unreadable reels still appear in **Pending check**; selecting that card opens the existing add-details recovery form in a dialog. This changes Home only. Library country albums and other reel handling remain as before.

`npx tsx tests/e2e/home.mjs` with locally installed Edge passed five synthetic browser groups: saved place link, no dropdown, failed-reel recovery, and desktop/mobile width checks. No browser runtime errors. Final `npm run check` passed (838 tests, API docs and workspace validation). API replies were synthetic; human and hosted checks remain pending.
