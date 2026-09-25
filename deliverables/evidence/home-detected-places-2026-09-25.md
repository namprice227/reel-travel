# Home detected-places popup

Places are account-level. When a link is saved on Home, the reel's extracted places are stored on the account before the traveler decides anything. Adding them to a trip is optional.

## Behaviour (25 September 2026, design 4: compact, then expands)

- Pressing **Start** opens the popup at once as a compact card: a spinner, **Finding places…** and the link's host. It expands into the full popup when the places arrive.
- A link that can't be read (Instagram, TikTok, `SOURCE_INACCESSIBLE`) shows **Couldn’t read this link** with a details box inside the popup. Sending details returns the popup to the reading state.
- Each card shows only the place photo (Google credit kept, as Google's terms require) or placeholder art, plus the name. There are no hours, areas or explanatory sentences, at the user's request.
- **Save to library / Add / Continue**: ticked places stay, unticked places are removed. Add copies the ticked places into the chosen trip (`places.copy`) and selects them (`places.select`). Continue opens `/my-trip/new` with the ticked places, which are copied once the dated trip exists.
- **Cancel** asks "Remove all N places from your account?" and then removes every place the reel added.
- **×** or Esc removes nothing. It first asks "Close and save all N places to your library?" (while reading: "Close? Places we find will be saved to your library."; unreadable link: "Close? The link stays in your saves."; draft trip: "Close? The draft trip stays in your trips.").
- If saving a × or Done close fails (offline, or the migration isn't applied), the popup still closes for that visit with the note "Closed for now. It will show again next visit." instead of trapping the traveler. Save and Cancel keep the error inside the popup, because they change data. Found when the user closed a popup against a Supabase project without the migration, which returned "data service is unavailable" and wrote nothing.
- Itinerary reels show their draft trip's places with **Keep as ideas instead** and **Open trip**. Keeping as ideas switches to the ticking view.
- The popup keeps coming back on Home until the traveler uses × or finishes. `AccountReel.review` (`pending` | `done`) is stored on the server, so it survives closing the tab, reloads, lost connections and other devices. New reels start `pending`, and adding details sets `pending` again. Reels saved before this change read as `done` through the contract default. The reel just saved is shown first, then the oldest pending one.
- Lost connection: a failed poll no longer stops updates for good. Home retries every 3 seconds and at once on the browser's `online` event. The reading card shows **Reconnecting…**.

API: `accountReels.finishReview` (`POST /api/account/reels/:reelId/review`, body `{ discardPlaceIds }`) sets the review to `done` and removes the listed places in one write. Supabase function: `database/migrations/202609250001_account_reel_review.sql` (`reel_set_account_reel_review`).

## Validation (25 September 2026)

- `npm run check`: PASS, 832 tests across 77 files, with type checks, API docs check and workspace validation. It was rerun after the last CSS change; see the contributions entry.
- `tests/integration/account-reels.test.ts`:
  - New reels are pending and stay pending after extraction settles.
  - × while reading closes with no removals; removing places while reading is refused (`INVALID_STATE`).
  - Finishing removes only the owner's listed places, keeps a trip copy, ignores unknown IDs and repeats as a no-op; another account gets `NOT_FOUND`.
  - Adding details makes a closed reel pending again.
  - A reel without `review` reads as `done`.
- `tests/integration/detected-places-model.test.ts`: reel country choice, trip ordering, confirm-button labels, selection merging.
- Browser checks used the in-app preview with a local file store, the fake extractor and fake places, a synthetic user and fictional fixture venues; no external calls were made:
  - Existing reels showed no popup.
  - Start showed the compact **Finding places…** card within 30 ms.
  - An unreadable link showed the details box; the popup came back after a reload; details expanded it to 4 places.
  - × → Save all kept 4 places and set the review to `done`.
  - Cancel → Remove all removed 2 places.
  - Simulated offline polling showed **Reconnecting…**, then recovered.
  - × on an unreadable link kept the link and set the review to `done`.
  - A pending ready reel came back after a reload.
  - 375px phone width: no horizontal overflow.
  - Earlier (same day): Add to an existing trip and Start a new trip copied and selected the ticked places.

## Not verified

- The Supabase function has not been run against PostgreSQL (`npm run test:db` needs a disposable database) and is not applied to the hosted project. Apply it before deploying this code.
- The itinerary draft-trip view was not exercised in the browser, because the fake extractor cannot produce itinerary reels.
- Real Google photos inside the popup were not exercised.
- The popup appears on Home only, not on other pages.
