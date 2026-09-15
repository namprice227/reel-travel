# Reel Travel product-flow mockups

Date: 15 September 2026. Task: FE01. Status: generated implementation references; human approval and usability review pending.

[Open the local review board](index.html) to inspect all ten desktop frames. Click any frame to enlarge it. The [prompt manifest](prompts.json) records the shared visual brief, per-screen brief and reference images used with the built-in `imagegen` workflow.

## Product and navigation decisions

- Use **Saved inspiration** rather than **Saved reels**. It covers reels, links, screenshots and notes without tying the information architecture to one source platform.
- The global sidebar is a 72 px icon rail by default and expands to about 220 px on hover or keyboard focus. Screen 01 shows the collapsed state; screen 02 shows the expanded state and pin control. Implementation also needs an explicit touch/menu action because hover cannot be the only way to reveal navigation.
- Global navigation is Home, My trips, Saved inspiration and Discover. Discover is marked **Coming later** because community discovery is outside the MVP scope.
- Trip Setup lives inside each trip as **Trip details**. Creation collects destination, dates and timezone; the in-trip screen holds editable basics, preferences and fixed bookings.
- Signed-in Home is a practical dashboard. The public Landing page remains a separate marketing route.
- My Trips groups by Upcoming, Drafts and Past, with destination filters. Saved Inspiration uses Country -> City -> Type.
- Notes are private owner data surfaced from itinerary rows and place details. Shared trip links do not include them.

## Frames

| ID | Screen | Primary design question | Image |
| --- | --- | --- | --- |
| 01 | Signed-in Home | Returning-user dashboard and clear Create trip action | [PNG](01-home-dashboard.png) |
| 02 | My Trips | Status grouping, destination filtering and expanded sidebar | [PNG](02-my-trips.png) |
| 03 | Single-trip itinerary | Day timeline, map preview, notes and fixed booking | [PNG](03-itinerary.png) |
| 04 | Enlarged itinerary map | Focused route map after clicking Enlarge map | [PNG](04-enlarged-map.png) |
| 05 | Place details | Location, uncertainty, tagged reels, note and review-provider region | [PNG](05-place-details.png) |
| 06 | Saved Inspiration | Country -> City -> Type hierarchy | [PNG](06-saved-inspiration.png) |
| 07 | Landing | Public product explanation and Start a trip CTA | [PNG](07-landing.png) |
| 08 | Trip Setup | In-trip basics, preferences and fixed bookings | [PNG](08-trip-setup.png) |
| 09 | Add Inspiration / recovery | Reel, link, note and screenshot input plus failed-link recovery | [PNG](09-add-inspiration-recovery.png) |
| 10 | Notes drawer | Private note view/edit state from an itinerary stop | [PNG](10-notes-drawer.png) |

## Reading these concepts accurately

These are raster design references, not application screenshots or verified travel data.

- Tokyo venues, route geometry, covers, tagged reels, review excerpts, ratings and counts are synthetic or illustrative. The place-details review module deliberately says **Sample provider data** and **Live provider connection required**.
- Existing contracts do not provide venue or cover photos. Treat imagery as art direction until a licensed provider and contract fields are approved.
- The generated itinerary preview in frame 03 repeats marker number 2 on its small map. Use saved itinerary order and coordinates in the implementation; the enlarged-map frame correctly shows 1-4 once each.
- Generated maps do not supply routing or geographic evidence. A production map needs attribution and must retain the estimated-connections label.
- The screenshots describe intended interactions, not accessibility compliance. Keyboard focus, touch navigation, dialog focus management, contrast and responsive behavior still require implementation and measurement.
- Discover, live Google review data and social-provider imports remain unimplemented. Do not infer backend availability from their layout regions.

## Verification

- Built-in `imagegen`: 10/10 requested frames completed.
- All ten project copies are PNG files at 1586 x 992 pixels.
- Visual inspection checked hierarchy, requested labels, source uncertainty, map disclaimers, fixed booking protection, notes privacy and the Landing/Home distinction.
- Static board and prompt manifest are project-local; no private upload, token or identifiable research data is included.
- Application tests were not run because no runtime behavior or API contract changed.

