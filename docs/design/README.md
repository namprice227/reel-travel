# Design workspace

21 September 2026: [/my-trip for a new user](new-user-flow.md) specifies the first-session design for the FE05
trips screens — a trip card that carries its own state, a create path costing one decision, and the trip page
lanes — with `US-N1`–`US-N8` and a full state table. Design and user stories only; nothing implemented, and D1/D3
depend on trips being allowed to exist without dates.

20 September 2026: [My Trip UX v2 proposal](my-trip-ux-v2/README.md) responds to the user's critique of oversized headers, hidden edit actions and fragmented place details. Includes five review boards, a local screen gallery and an implementation sequence. Design only; Canva import authorization and human review pending.

Owner: Member 1; Member 2 co-authors pitch and demo visuals.

Keep source mockups or design links, brand decisions, and observed usability notes here.
Prioritize import recovery, branch confirmation, day editing, and small-screen magazine navigation.
Store final sanitized screenshots under deliverables/evidence/ and link them from milestone answers.

## Frontend direction — 15 September 2026

### Requested product-flow set

The [10-frame product-flow board](product-flow-imagegen/index.html) extends Editorial Blue into the signed-in Home dashboard, status-grouped My Trips, itinerary and enlarged map, place details, Saved Inspiration library, public Landing, in-trip setup, failed-source recovery and private notes. [Generation prompts and references](product-flow-imagegen/prompts.json) are preserved with the images.

This set records the requesting user's preference to continue with the supplied cream/ink/blue theme and covers the missing setup, import-recovery and notes states. It remains an implementation reference pending human visual acceptance and usability checks; it does not approve live review/social providers or expand Discover into the MVP.

### Expanded desktop options

The [desktop gallery](desktop-gallery/index.html) adds 20 desktop mockups across three visual directions: **Editorial Blue**, **Forest Journal** and **Midnight Atlas**. Filter by screen, enlarge an image, or compare up to three options. The [gallery index](desktop-gallery/README.md) lists individual images and review notes; [exact prompts](desktop-gallery/prompts.json) preserve generation details.

Editorial Blue covers all 12 major screens. Each other direction provides four alternatives: home, My trips, itinerary and magazine. These remain proposed visual options; no direction has been selected by the user.

**Proposed, pending human review (FE01).** Warm cream, ink and blue, with editorial trip headings and clear planning controls. Tokyo is a proposed pilot city using fictional sample data.

- [Frontend plan](frontend-plan.md): screen map, three workflow sketches, visual tokens, responsive rules, component boundaries, task sequence and acceptance scenarios.
- [Desktop itinerary concept](concepts/desktop-itinerary-v1.png): timeline, estimated route map, unknown hours and a fixed booking.
- [Mobile workflow concept](concepts/mobile-workflow-v1.png): import recovery, explicit branch confirmation and magazine reading.
- [Exact generation prompts](imagegen-prompts.md): built-in imagegen tool; no CLI fallback or reference images.

These images are generated design concepts, not application screenshots. All venue thumbnails, covers, dates, bookings and map geometry are illustrative. No real venue facts or user research are represented.

### Visual review and implementation notes

Both concepts were visually inspected for hierarchy, readable recovery actions, unselected branch options, uncertainty labels and the fixed booking. They establish direction; the [written plan](frontend-plan.md) governs behavior and exact component choices.

- The desktop generation adds illustrative venue thumbnails. Current contracts do not supply venue photos; omit those thumbnails in the first build. Keep a typography-only or clearly illustrative trip cover.
- The mobile generation uses serif headings more broadly than proposed. Use system sans for workflow headings and reserve serif for editorial trip headings in implementation.
- The mobile inbox's added “from anywhere” copy overstates supported inputs. Use “Save travel links, notes or screenshots. Add details when a source can't be read.” Render the actual original source link, not only the concept's “Source link retained” placeholder.
- Desktop rows abbreviate travel and omit breaks for composition. The implemented timeline and magazine must retain all saved stops, breaks and travel estimates. The proposed map needs real provider attribution in code; its generated labels/geometry are not geographic evidence.
- The concept's branch options and times are illustrative. Use contract fixtures and server responses for interactive acceptance checks.

### Verification

- `python scripts/validate_workspace.py` — passed: 32 tasks, 160 points, 21 milestone drafts; planning integrity and local Markdown links valid.
- `git diff --check` — passed; Git emitted line-ending normalization notices only.
- Visual inspection of both generated concepts — completed; deviations and implementation corrections recorded above.

Application behavior and browser accessibility have not been tested as part of this design-only task. No runtime code or API contracts changed, so application tests, typecheck and API regeneration were not run. Human review, city selection, brand approval and usability observations remain pending.

20 September 2026: the user approved My Trip UX v2 and requested implementation. [Runtime evidence](../../deliverables/evidence/my-trip-ux-v2-2026-09-20.md) records the compact lists, day editing, place sheet, selected-location Google renderer and actual acceptance results. The five-screen board remains the design snapshot.
