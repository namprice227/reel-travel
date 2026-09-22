# GA4 tracking and the milestone report

Web stream: **G-1MNPG57MNM**. Production site: https://reel-travel.vercel.app.
The Measurement ID is public. No Measurement Protocol API secret or new paid service is needed.

## One-time GA4 setup

1. Open https://analytics.google.com/ and choose the Reel Travel property.
2. **Admin → Data collection and modification → Data streams → Reel Travel web stream**.
3. Confirm the Measurement ID is `G-1MNPG57MNM` and the URL is the production site.
4. Switch **Enhanced measurement OFF**. This app sends explicit pageviews and product actions;
   automatic history pageviews would double-count SPA navigation, and automatic form/link events
   could collect unwanted field or URL metadata. `send_page_view:false` alone does not disable
   enhanced history tracking. [Google pageview guidance](https://developers.google.com/analytics/devguides/collection/ga4/views).
5. Under **Admin → Data display → Custom definitions**, create event-scoped dimensions:
   `generation_kind`, `source_type`, `edit_type`, `action`, and `http_status`.
   These are the exact event parameter names; they are not retroactive report configurations.
6. Mark `plan_generated` as a **key event** in the Events screen once it appears. Treat `share_created`
   as a secondary success signal. A generated itinerary is not proof the user liked or followed it.

## What is tracked

| Event | Trigger | Useful parameters |
| --- | --- | --- |
| `page_view` | Initial production load and each pathname change | Sanitized page location/path |
| `landing_cta_clicked` | Landing CTA clicked | No destination URL |
| `trip_created` | Trip creation succeeds | None |
| `import_submitted` | Text/link/image submission accepted | `source_type` |
| `import_retried` | Retry or additional details accepted | None |
| `places_added` | Saved places copied into trip | `place_count` |
| `place_confirmed` | Place confirmation succeeds | None |
| `plan_generation_started` | Generate request starts | `generation_kind`: `initial` or `regeneration` |
| `plan_generated` | Generate request succeeds | Same generation kind |
| `itinerary_edited` | Real edit succeeds; dry runs excluded | `edit_type` |
| `share_created`, `share_revoked` | Share action succeeds | None |
| `action_failed` | A tracked request returns HTTP/network failure | `action`, `http_status`, generation kind when applicable |

These are browser-observed actions. `import_submitted` means queued/accepted, not worker completion.
There is no client-ID-linked GA4 worker completion event in this release; the existing server webhook is
separate. Pageviews do not count changes only to `?day=` or selection parameters as new pages. Back/forward
pathname navigation is counted. The previous itinerary is not sent with regeneration analytics.

Production only: local dev and automated tests do not send live events. API calls, source text, place names,
trip IDs, share tokens, emails, booking details, query strings and response bodies are not forwarded by
these explicit events. Trip/place/share URLs are grouped into route templates. Page titles are the fixed
`Reel Travel` label; referrers are omitted, so this setup is for product-flow analysis, not marketing attribution.
GA4 itself uses cookies and browser/device information; the privacy page describes its use.

`NEXT_PUBLIC_GA4_ENABLED=false` disables tag loading and events. `NEXT_PUBLIC_GA4_MEASUREMENT_ID` overrides
the supplied default ID. Public variables are compiled at build time; changing them requires redeployment.

## Verify before relying on a report

1. In GA4, open **Reports → Realtime** and **Admin → Data display → DebugView**.
2. In a separate browser tab, visit `https://reel-travel.vercel.app/?analytics_debug=1`.
   This labels the tab's events with `debug_mode=true` and `traffic_type=developer` until disabled.
3. Click through Landing → sign-in → My trips using the app's links, without full reloads.
   Confirm one `page_view` per pathname change. Re-rendering a page must not add another pageview.
4. Use a disposable test trip: add a place, generate, add another place, regenerate, edit and share.
   Confirm `places_added`/`place_confirmed`, `plan_generation_started`, `plan_generated`,
   `itinerary_edited` and `share_created`. Inspect `generation_kind` on both generation attempts.
5. In browser DevTools → Network, filter `collect`. Check requests to Google Analytics contain
   `tid=G-1MNPG57MNM`, the expected event name, and sanitized paths. Check there are no CSP errors.
   A successful network request proves transport only; also verify the events arrive in GA4 DebugView.
6. Turn debugging off with `?analytics_debug=0` before normal use. Document the test time/device.
   Configure the GA4 **Developer traffic** data filter to exclude debug events from regular reporting
   once verification is complete. Review filter settings carefully; excluded data cannot be recovered.
7. Check mobile and desktop once. Browser blocking, denied tracking and closed tabs can reduce counts;
   analytics is not an authoritative database transaction count.

Google documents [DebugView](https://support.google.com/analytics/answer/7201382) and
[Realtime versus processing delay](https://support.google.com/analytics/answer/9333790): many standard
reports and explorations can take **24–48 hours**. Realtime/DebugView should be used for setup verification.

## Get the report and screenshot

After real testers have used the deployed build:

1. Select an explicit date range **after analytics went live**, ending on a fully processed day.
2. Open **Reports → Engagement → Events** (or search for the Events report if your navigation differs).
   Show the action events above, event count and total users. Capture a screenshot with the report title,
   date range and metrics visible. Use the report's share/export menu for PDF/CSV where offered.
3. Capture **Pages and screens**, using page path rather than the constant page title. Compare setup,
   places, itinerary, map and share page usage, and add a device-category comparison.
4. For the product funnel, use **Explore → Funnel exploration**, same-session scope, ordered steps:
   `trip_created` → (`places_added` OR `place_confirmed`) → `plan_generated` → `share_created`.
   Do not interpret raw event-count ratios as user conversion. Existing trips and returning users can
   enter after step one; compare an open funnel or segment returning users separately.
5. Add a separate exploration for `plan_generation_started` versus `plan_generated`, broken down by
   `generation_kind`. Inspect `action_failed` filtered to `action=itinerary.generate`.
6. Record sample size, dates, debug exclusion, traffic source/recruitment and limitations in M19.
   A DebugView screenshot is integration evidence; a real-user report screenshot is behavior evidence.

## Turn observations into decisions

These are hypotheses to evaluate, **not findings already established**:

| If the report shows… | Check before concluding… | Product response to test |
| --- | --- | --- |
| Users create trips but rarely add/confirm places | Are they returning users? Did imports complete? | Simplify adding places and make verification status clearer |
| Generation starts often but succeeds less often | HTTP failures, closed tabs, delayed responses | Improve failure recovery and generation reliability |
| Regeneration is common after adding more places | This may be healthy iteration, not dissatisfaction | Make full-rebuild behavior explicit; test a clearer add-more flow |
| Users edit many generated itineraries | Which edit types? Small sample or one prolific tester? | Investigate pacing/order quality with interviews |
| Few generated plans are shared | Does the product's solo-travel audience need sharing? | Test share discoverability only if sharing is a user goal |
| Mobile users drop out more frequently | Device mix and sample sizes comparable? | Prioritize mobile usability tests for the affected stage |

Suggested write-up: “Between [dates], [N] measured users reached [stage]. [X] users reached [next stage],
using [funnel definition]. We observed [pattern]. This suggests [hypothesis], with [limitations].
We therefore changed/will test [specific product change], measuring [success criterion].”
Do not fill placeholders with smoke-test traffic or invented numbers.
