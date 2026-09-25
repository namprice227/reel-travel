# Home place and trip cover images — 25 September 2026

The user approved an image-only correction within the existing Home and My Trips cards. Home's recent saved-place tiles had always shown country artwork, even when the Library's owner-authorized Google photo endpoint could display a mapped place. My Trips passed only uploaded covers or a neutral image into `CoverArt`, so the seven countries with existing photographic artwork fell through to its generated skyline.

Home now requests a fresh Google photo for the same eligible place matches the Library displays. The photo retains its Google Maps and author attribution; a missing or failed photo falls back to the existing country or neutral artwork. Ambiguous matches remain marked as possible matches. Trip cards now use the existing country artwork, neutral travel cover for other destinations, and an uploaded cover when one exists. A failed upload also falls back to the country artwork. No new image assets, provider calls, or API contracts were added.

Checks run:

- `npm run typecheck` passed.
- Offline Edge `tests/e2e/home.mjs` passed six groups, including a synthetic mapped Google photo, Google Maps source credit, saved-place link, and desktop/mobile width checks.
- Offline Edge `tests/e2e/trips.mjs` passed twenty groups, including country cover selection, desktop/mobile geometry, uploaded portrait cover cropping and no runtime errors. Its harness was refreshed for the current Next image shim and select controls.

These checks used synthetic API and image responses. Live Google photo delivery, hosted deployment, and human visual review remain unverified. Some Google places have no photo; they retain illustrative artwork.
