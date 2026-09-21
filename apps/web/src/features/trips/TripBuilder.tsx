"use client";

import { MAX_TRIP_DAYS, type Accommodation, type CandidatePlace, type Inspiration, type Trip } from "@reel/contracts";
import { useState, type FormEvent } from "react";
import { Icon } from "@/components/icons";
import { CoverArt } from "@/components/Illustration";
import { Badge, ErrorBanner, type Tone } from "@/components/ui";
import { api, ApiError } from "@/lib/api-client";
import { formatDateSpan, tripDays } from "@/lib/trip-dates";
import { formatTimestamp } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import { destinationLocation } from "@/features/library/library-model";
import { sourceLabels } from "@/features/places/source-labels";

/**
 * A trip with no itinerary, as a builder (designs "E1 v2", "E3 v2", "E7").
 *
 * One step at a time rather than four open panels: the rail says where you are, the middle column
 * does that step's work, and the places collected so far stay on the right at every step. Every
 * step acts here — none of them navigates to another screen.
 *
 * Which step is current is derived from the trip's own data, so it is right after a reload and
 * cannot claim progress that isn't there; clicking a step overrides that until the next change.
 */

const ACTIVE_SAVE: Inspiration["status"][] = ["queued", "processing"];
const NEEDS_TRAVELER: CandidatePlace["status"][] = ["pending", "ambiguous", "not_found"];

interface StayDraft { name: string; checkIn: string; checkOut: string }
const EMPTY_STAY: StayDraft = { name: "", checkIn: "", checkOut: "" };

export function TripBuilder({
  trip,
  busy,
  onGenerate,
  onTripSaved,
}: {
  trip: Trip;
  busy: boolean;
  onGenerate: () => void;
  onTripSaved: (trip: Trip) => void;
}) {
  const params = { tripId: trip.id };
  const saves = useApi("inspirations.list", { params }, {
    pollMs: (data) => (data.inspirations.some((s) => ACTIVE_SAVE.includes(s.status)) ? 1500 : false),
  });
  const places = useApi("places.list", { params }, {
    pollMs: () => (saves.data?.inspirations.some((s) => ACTIVE_SAVE.includes(s.status)) ? 1500 : false),
  });
  const [chosen, setChosen] = useState<number | null>(null);

  const list = places.data?.places ?? [];
  const live = list.filter((p) => p.status !== "rejected");
  const confirmed = live.filter((p) => p.status === "confirmed");
  const waiting = live.filter((p) => NEEDS_TRAVELER.includes(p.status));
  const stays = trip.preferences.accommodations;

  // The first thing the trip is missing. Clicking a step wins until the data moves on.
  const suggested = live.length === 0 ? 1 : waiting.length > 0 ? 2 : stays.length === 0 ? 3 : 4;
  const step = chosen ?? suggested;

  const reload = async () => {
    await Promise.all([saves.reload(), places.reload()]);
  };

  const sub: Record<number, string> = {
    1: live.length ? `${live.length} collected` : "Nothing yet",
    2: waiting.length ? `${waiting.length} need review` : confirmed.length ? `${confirmed.length} confirmed` : "Nothing to confirm",
    3: stays.length ? (stays.length > 1 ? `${stays.length} stays` : stays[0]!.name) : "Optional",
    4: confirmed.length ? "Ready" : "Not started",
  };
  const stepState = (n: number) => (n < suggested ? "done" : n === step ? "now" : "todo");

  return (
    <div className="builder fit-fill">
      <nav className="builder-steps" aria-label="Planning steps">
        <p className="builder-kicker">Planning steps</p>
        {[1, 2, 3, 4].map((n) => {
          const state = stepState(n);
          return (
            <button
              key={n}
              type="button"
              className={`builder-step is-${state}${n === step ? " is-current" : ""}`}
              aria-current={n === step ? "step" : undefined}
              onClick={() => setChosen(n)}
            >
              <span className="builder-mark" aria-hidden="true">{state === "done" ? <Icon name="check" size={15} /> : n}</span>
              <span className="builder-step-text">
                <strong>{["Add places", "Confirm places", "Add your stay", "Plan the days"][n - 1]}</strong>
                <small>{sub[n]}</small>
              </span>
            </button>
          );
        })}
        <div className="builder-sign" aria-hidden="true">
          <CoverArt seed={trip.destination} className="builder-sign-art" showLabel={false} />
          <span>Good trips start with great finds.</span>
        </div>
      </nav>

      <main className="builder-main panel-scroll">
        {places.error && <ErrorBanner error={places.error} />}
        {step === 1 && <AddPlacesStep trip={trip} saves={saves.data?.inspirations ?? []} currentPlaces={live} onAdded={reload} onNext={() => setChosen(2)} />}
        {step === 2 && <ConfirmStep tripId={trip.id} places={live} onChanged={reload} onNext={() => setChosen(3)} />}
        {step === 3 && <StaysStep trip={trip} onSaved={onTripSaved} onNext={() => setChosen(4)} />}
        {step === 4 && <PlanStep trip={trip} confirmed={confirmed.length} busy={busy} onGenerate={onGenerate} onBack={() => setChosen(2)} />}
      </main>

      <aside className="builder-aside" aria-label="Places collected so far">
        <div className="builder-aside-head">
          <h2>Added places</h2>
          <Badge tone="neutral">{live.length}</Badge>
        </div>
        {places.loading && !places.data ? (
          <p className="small muted">Loading…</p>
        ) : live.length === 0 ? (
          <p className="small muted">Places you add appear here. Nothing is planned until you confirm them.</p>
        ) : (
          <ul className="builder-place-list panel-scroll">
            {live.map((place) => <CollectedPlace key={place.id} place={place} />)}
          </ul>
        )}
      </aside>
    </div>
  );
}

/** One collected place: what it is, where, and whether it still needs the traveler. */
function CollectedPlace({ place }: { place: CandidatePlace }) {
  const area = place.selected?.address ?? (place.status === "unverified" ? "Not looked up yet" : "Location not confirmed");
  const [icon, tone, label] =
    place.status === "confirmed" ? (["check", "is-ok", "Confirmed"] as const)
      : place.status === "unverified" ? (["clock", "is-wait", "Waiting to be looked up"] as const)
        : (["alert", "is-review", "Needs review"] as const);
  return (
    <li className="builder-place">
      <CoverArt seed={place.name} className="builder-place-art" showLabel={false} />
      <span className="builder-place-text">
        <strong>{place.selected?.name ?? place.name}</strong>
        <small><Icon name="pin" size={12} /><span>{area}</span></small>
      </span>
      <span className={`builder-place-mark ${tone}`} title={label}>
        <span className="sr-only">{label}</span>
        <Icon name={icon} size={13} />
      </span>
    </li>
  );
}

/* ---------------------------------------------------------------- step 1 */

const SAVE_TONE: Record<Inspiration["status"], [string, Tone]> = {
  queued: ["Queued", "info"],
  processing: ["Finding places", "info"],
  needs_confirmation: ["Places found", "success"],
  ready: ["Done", "success"],
  needs_input: ["Needs a caption", "warning"],
  failed: ["Couldn’t read it", "danger"],
  skipped: ["Skipped", "neutral"],
};

function AddPlacesStep({
  trip,
  saves,
  currentPlaces,
  onAdded,
  onNext,
}: {
  trip: Trip;
  saves: Inspiration[];
  currentPlaces: CandidatePlace[];
  onAdded: () => Promise<void>;
  onNext: () => void;
}) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [copying, setCopying] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [error, setError] = useState<ApiError | null>(null);
  const savedPlaces = useApi("places.listSaved", {});
  const accountTrips = useApi("trips.list", {});
  const tripsById = new Map((accountTrips.data?.trips ?? []).map((item) => [item.id, item]));
  const targetCountry = destinationLocation(trip.destination).countryId;
  const currentProviderIds = new Set(currentPlaces
    .filter((place) => place.status === "confirmed" && place.selected)
    .map((place) => place.selected!.providerPlaceId));
  const reusable = (savedPlaces.data?.places ?? []).filter((place) => {
    if (place.tripId === trip.id || !place.selected || currentProviderIds.has(place.selected.providerPlaceId)) return false;
    const labels = sourceLabels(place);
    const origin = tripsById.get(place.tripId);
    const sourceCountry = labels.present
      ? (labels.countryCode ?? "unsorted")
      : origin ? destinationLocation(origin.destination).countryId : "unsorted";
    return targetCountry !== "unsorted" && sourceCountry === targetCountry;
  });
  const selected = selectedIds.filter((id) => reusable.some((place) => place.id === id));
  const collected = currentPlaces.length;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const text = value.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    try {
      // A pasted http(s) address is a link; anything else is text we hand to extraction as written.
      const isUrl = /^https?:\/\/\S+$/i.test(text);
      await api("inspirations.create", {
        params: { tripId: trip.id },
        body: isUrl ? { sourceType: "link", url: text } : { sourceType: "text", text },
      });
      setValue("");
      await onAdded();
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, "INTERNAL", String(err)));
    } finally {
      setBusy(false);
    }
  }

  async function copySelected() {
    if (!selected.length || copying) return;
    setCopying(true);
    setError(null);
    try {
      await api("places.copy", { params: { tripId: trip.id }, body: { placeIds: selected } });
      setSelectedIds([]);
      await onAdded();
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, "INTERNAL", String(err)));
    } finally {
      setCopying(false);
    }
  }

  const addForm = (
    <>
      <form className="builder-add" onSubmit={submit}>
        <label className="field-icon" htmlFor="builder-add">
          <span className="sr-only">Paste a link, or type a place name</span>
          <Icon name="link" size={18} />
          <input id="builder-add" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Paste a reel or video link — or type a place name" />
        </label>
        <button className="btn btn-primary" disabled={busy || !value.trim()}>
          <Icon name="plus" size={17} /> {busy ? "Adding…" : "Add"}
        </button>
      </form>
      <p className="small muted">A link goes off to be read, and a name is looked up — either way it appears on the right once we have it.</p>
    </>
  );

  return (
    <section className="builder-step-body" aria-labelledby="builder-add-title">
      <header className="builder-head">
        <h1 id="builder-add-title">Add places</h1>
        <p>Collect everything you might want to visit. Dates and days come later.</p>
      </header>

      {reusable.length > 0 ? (
        <>
          <section className="builder-shelf" aria-labelledby="builder-shelf-title">
            <div className="builder-shelf-head">
              <div>
                <h2 id="builder-shelf-title">Pick from your saved places</h2>
                <p>Already confirmed for {destinationLocation(trip.destination).country}.</p>
              </div>
              <button
                type="button"
                className="btn btn-small"
                onClick={() => setSelectedIds(selected.length === reusable.length ? [] : reusable.map((place) => place.id))}
              >
                {selected.length === reusable.length ? "Clear all" : "Select all"}
              </button>
            </div>
            <ul className="builder-shelf-list">
              {reusable.map((place) => {
                const origin = tripsById.get(place.tripId);
                const area = place.evidence.find((item) => item.hint)?.hint ?? place.selected?.address ?? origin?.destination ?? "Area unavailable";
                const checked = selected.includes(place.id);
                return (
                  <li key={place.id}>
                    <label className={`builder-shelf-row${checked ? " is-on" : ""}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => setSelectedIds((ids) => ids.includes(place.id) ? ids.filter((id) => id !== place.id) : [...ids, place.id])}
                      />
                      <CoverArt seed={place.name} className="builder-shelf-art" showLabel={false} />
                      <span className="builder-shelf-copy">
                        <strong>{place.name}</strong>
                        <small>{area}</small>
                        <small>Saved {formatTimestamp(place.createdAt)}{origin ? ` on ${origin.title}` : ""}</small>
                      </span>
                      <Icon name="checkCircle" size={19} className="builder-shelf-check" />
                    </label>
                  </li>
                );
              })}
            </ul>
            <button type="button" className="btn btn-primary builder-shelf-add" disabled={!selected.length || copying} onClick={() => void copySelected()}>
              {copying ? "Adding…" : `Add ${selected.length} ${selected.length === 1 ? "place" : "places"} to this trip`}
            </button>
          </section>
          <details className="builder-new-place">
            <summary>Not enough? Add something new</summary>
            <div>{addForm}</div>
          </details>
        </>
      ) : addForm}
      <ErrorBanner error={error} />
      {!reusable.length && (savedPlaces.error || accountTrips.error) && (
        <p className="small muted">Saved places could not be loaded. You can still add something new.</p>
      )}

      {collected > 0 && (
        <div className="builder-progress">
          <span className="builder-progress-mark" aria-hidden="true"><Icon name="check" size={17} /></span>
          <span className="builder-progress-text">
            <strong>{collected} {collected === 1 ? "place" : "places"} collected</strong>
            <small>Enough to start confirming. You can keep adding afterwards.</small>
          </span>
          <button type="button" className="btn btn-small" onClick={onNext}>Go to confirming <Icon name="arrowRight" size={16} /></button>
        </div>
      )}

      {saves.length > 0 && (
        <section className="builder-saves" aria-label="What you have added">
          <h2>Added from</h2>
          <ul>
            {saves.map((save) => {
              const [label, tone] = SAVE_TONE[save.status];
              const title = save.url ?? save.text ?? "Screenshot";
              return (
                <li key={save.id}>
                  <Icon name={save.url ? "link" : save.assetId ? "image" : "text"} size={15} />
                  <span className="builder-save-text">
                    <strong>{title}</strong>
                    {save.failureMessage && <small>{save.failureMessage}</small>}
                  </span>
                  <Badge tone={tone}>{label}</Badge>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="builder-next" aria-label="What happens next">
        <h2>What happens next?</h2>
        {[
          ["pin", "Add places", "From a reel, a video, or just the name if you already know it."],
          ["check", "Confirm them", "We show the words each place came from, and you pick the right match."],
          ["route", "Build your days", "Confirmed places become a day-by-day plan you can edit."],
        ].map(([icon, title, text]) => (
          <div key={title} className="builder-next-row">
            <span className="builder-next-mark" aria-hidden="true"><Icon name={icon as "pin"} size={17} /></span>
            <span><strong>{title}</strong><small>{text}</small></span>
          </div>
        ))}
      </section>
    </section>
  );
}

/* ---------------------------------------------------------------- step 2 */

function ConfirmStep({
  tripId,
  places,
  onChanged,
  onNext,
}: {
  tripId: string;
  places: CandidatePlace[];
  onChanged: () => Promise<void>;
  onNext: () => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [reviewing, setReviewing] = useState(false);

  const waiting = places.filter((p) => NEEDS_TRAVELER.includes(p.status));
  const confirmed = places.filter((p) => p.status === "confirmed");
  const obvious = waiting.filter((p) => p.options.length === 1);

  async function act(id: string, run: () => Promise<void>) {
    setBusyId(id);
    setError(null);
    try {
      await run();
      await onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, "INTERNAL", String(err)));
    } finally {
      setBusyId(null);
    }
  }

  const confirmOne = (place: CandidatePlace, providerPlaceId: string) =>
    act(place.id, async () => {
      await api("places.confirm", { params: { tripId, placeId: place.id }, body: { providerPlaceId } });
      setOpen(null);
    });

  const confirmObvious = () =>
    act("bulk", async () => {
      // Sequential: each confirm can merge other places, so the server must see them one at a time.
      for (const place of obvious) {
        await api("places.confirm", { params: { tripId, placeId: place.id }, body: { providerPlaceId: place.options[0]!.providerPlaceId } });
      }
      setReviewing(false);
    });

  return (
    <section className="builder-step-body" aria-labelledby="builder-confirm-title">
      <header className="builder-head">
        <h1 id="builder-confirm-title">Confirm places</h1>
        <p>Open one to see the words it came from, then pick the right match.</p>
      </header>

      <ErrorBanner error={error} />

      {waiting.length === 0 ? (
        <div className="builder-progress">
          <span className="builder-progress-mark" aria-hidden="true"><Icon name="check" size={17} /></span>
          <span className="builder-progress-text">
            <strong>{confirmed.length} confirmed, nothing waiting</strong>
            <small>Add more places any time — they come back here.</small>
          </span>
          <button type="button" className="btn btn-small" onClick={onNext}>Next step <Icon name="arrowRight" size={16} /></button>
        </div>
      ) : (
        <>
          {obvious.length > 0 && (
            <div className="builder-bulk">
              <div className="builder-bulk-head">
                <Icon name="sparkle" size={19} />
                <span className="builder-progress-text">
                  <strong>{obvious.length} {obvious.length === 1 ? "place" : "places"} found only one match</strong>
                  <small>Check the list, then confirm them together. Confirming can’t be undone.</small>
                </span>
                <button type="button" className="btn btn-small btn-primary" onClick={() => setReviewing(!reviewing)} aria-expanded={reviewing}>
                  {reviewing ? "Hide the list" : `Review all ${obvious.length}`}
                </button>
              </div>
              {reviewing && (
                <div className="builder-bulk-list">
                  <ul>
                    {obvious.map((place) => (
                      <li key={place.id}>
                        <strong>{place.options[0]!.name}</strong>
                        <small>{place.options[0]!.address ?? "No address from the provider"}</small>
                        <em>“{place.evidence[0]!.excerpt}”</em>
                      </li>
                    ))}
                  </ul>
                  <button type="button" className="btn btn-primary" disabled={busyId === "bulk"} onClick={() => void confirmObvious()}>
                    {busyId === "bulk" ? "Confirming…" : `Confirm these ${obvious.length}`}
                  </button>
                </div>
              )}
            </div>
          )}

          <ul className="builder-confirm-list">
            {places.map((place) => {
              const isOpen = open === place.id;
              const needs = NEEDS_TRAVELER.includes(place.status);
              const choice = picked[place.id] ?? place.options[0]?.providerPlaceId;
              return (
                <li key={place.id} className={`builder-confirm-row${isOpen ? " is-open" : ""}`}>
                  <button type="button" className="builder-confirm-summary" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : place.id)}>
                    <CoverArt seed={place.name} className="builder-place-art" showLabel={false} />
                    <span className="builder-place-text">
                      <strong>{place.selected?.name ?? place.name}</strong>
                      <small><Icon name="pin" size={12} /><span>{place.selected?.address ?? place.options[0]?.address ?? "No address yet"}</span></small>
                    </span>
                    {place.status === "confirmed" ? <Badge tone="success">Confirmed</Badge>
                      : place.status === "unverified" ? <Badge tone="neutral">Not looked up</Badge>
                        : place.options.length === 0 ? <Badge tone="warning">No match</Badge>
                          : <Badge tone={place.options.length > 1 ? "warning" : "info"}>{place.options.length} {place.options.length === 1 ? "match" : "matches"}</Badge>}
                    <Icon name="chevronRight" size={16} className="builder-chevron" />
                  </button>

                  {isOpen && (
                    <div className="builder-confirm-body">
                      {place.evidence.map((item, i) => (
                        <p key={i} className="builder-evidence">
                          <Icon name="text" size={14} />
                          <span><em>“{item.excerpt}”</em><small>From the save this came from</small></span>
                        </p>
                      ))}

                      {place.status === "unverified" ? (
                        <p className="small muted">This one hasn’t been looked up yet, so there is nothing to confirm. It appears here once a location comes back.</p>
                      ) : place.options.length === 0 ? (
                        <p className="small muted">We couldn’t find a real venue for these words. Rejecting keeps the words on the save.</p>
                      ) : (
                        <>
                          <p className="small muted">{place.options.length > 1 ? "Which one did the save mean?" : "Is this the right place?"}</p>
                          <div className="builder-options" role="radiogroup" aria-label={`Matches for ${place.name}`}>
                            {place.options.map((option, i) => (
                              <label key={option.providerPlaceId} className={`builder-option${choice === option.providerPlaceId ? " is-on" : ""}`}>
                                <input
                                  type="radio"
                                  name={`option-${place.id}`}
                                  value={option.providerPlaceId}
                                  checked={choice === option.providerPlaceId}
                                  onChange={() => setPicked({ ...picked, [place.id]: option.providerPlaceId })}
                                />
                                <CoverArt seed={option.name + option.providerPlaceId} className="builder-option-art" showLabel={false} />
                                <span className="builder-place-text">
                                  <strong>{option.name}</strong>
                                  <small>{option.address ?? "No address from the provider"}</small>
                                </span>
                                {i === 0 && place.options.length > 1 && <Badge tone="info">Closest match</Badge>}
                              </label>
                            ))}
                          </div>
                          <p className="fineprint">The first option is a suggestion from the words in your save, not a decision. Nothing is confirmed until you press the button.</p>
                        </>
                      )}

                      {needs && (
                        <div className="builder-confirm-actions">
                          {place.options.length > 0 && (
                            <button type="button" className="btn btn-primary" disabled={busyId === place.id || !choice} onClick={() => choice && void confirmOne(place, choice)}>
                              {busyId === place.id ? "Confirming…" : "Confirm"}
                            </button>
                          )}
                          <button type="button" className="btn" disabled={busyId === place.id} onClick={() => void act(place.id, async () => { await api("places.reject", { params: { tripId, placeId: place.id } }); setOpen(null); })}>
                            {place.options.length > 0 ? "Neither" : "Remove it"}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}

/* ---------------------------------------------------------------- step 3 */

function StaysStep({ trip, onSaved, onNext }: { trip: Trip; onSaved: (trip: Trip) => void; onNext: () => void }) {
  const [stays, setStays] = useState<StayDraft[]>(
    trip.preferences.accommodations.map((s) => ({ name: s.name, checkIn: s.checkIn ?? "", checkOut: s.checkOut ?? "" })),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const set = (index: number, patch: Partial<StayDraft>) => setStays(stays.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  const named = stays.filter((s) => s.name.trim());
  const halfDated = named.some((s) => Boolean(s.checkIn) !== Boolean(s.checkOut));
  const backwards = named.some((s) => s.checkIn && s.checkOut && s.checkOut < s.checkIn);

  async function save(next: boolean) {
    if (busy || halfDated || backwards) return;
    setBusy(true);
    setError(null);
    try {
      const accommodations: Accommodation[] = named.map((s) => ({
        name: s.name.trim(),
        // Coordinates come from the full Trip details screen; a name alone still names the stay.
        location: trip.preferences.accommodations.find((old) => old.name === s.name.trim())?.location ?? null,
        checkIn: s.checkIn || null,
        checkOut: s.checkOut || null,
      }));
      const { trip: updated } = await api("trips.update", {
        params: { tripId: trip.id },
        body: { expectedUpdatedAt: trip.updatedAt, preferences: { accommodations } },
      });
      onSaved(updated);
      if (next) onNext();
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, "INTERNAL", String(err)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="builder-step-body" aria-labelledby="builder-stay-title">
      <header className="builder-head">
        <h1 id="builder-stay-title">Add your stay</h1>
        <p>Optional, but it makes travel times realistic — each day is measured from where you slept.</p>
      </header>

      <ErrorBanner error={error} />

      <div className="builder-stays">
        {stays.length === 0 && <p className="small muted">No stay yet. Add one, or skip and come back later.</p>}
        {stays.map((stay, index) => (
          <div key={index} className="builder-stay">
            <label className="field-icon" htmlFor={`builder-stay-${index}`}>
              <span className="sr-only">Stay {index + 1}</span>
              <Icon name="bed" size={18} />
              <input id={`builder-stay-${index}`} value={stay.name} onChange={(e) => set(index, { name: e.target.value })} placeholder="Hotel or area" />
            </label>
            <label htmlFor={`builder-stay-in-${index}`}>
              From
              <input id={`builder-stay-in-${index}`} type="date" min={trip.startDate} max={trip.endDate} value={stay.checkIn} onChange={(e) => set(index, { checkIn: e.target.value })} />
            </label>
            <label htmlFor={`builder-stay-out-${index}`}>
              To
              <input id={`builder-stay-out-${index}`} type="date" min={stay.checkIn || trip.startDate} max={trip.endDate} value={stay.checkOut} onChange={(e) => set(index, { checkOut: e.target.value })} />
            </label>
            <button type="button" className="icon-btn is-danger" aria-label={`Remove ${stay.name || `stay ${index + 1}`}`} onClick={() => setStays(stays.filter((_, i) => i !== index))}>
              <Icon name="trash" size={17} />
            </button>
          </div>
        ))}
        <div className="builder-stay-foot">
          <button type="button" className="btn btn-small" disabled={stays.length >= MAX_TRIP_DAYS} onClick={() => setStays([...stays, EMPTY_STAY])}>
            <Icon name="plus" size={16} /> {stays.length ? "Add another stay" : "Add a stay"}
          </button>
          <span className="small muted">Changing hotel part-way? Add one per stay and give each its nights. One stay with no dates covers the trip.</span>
        </div>
        {halfDated && <p className="banner banner-warning small" role="status">Give a stay both dates, or neither — one date alone can’t say which nights it covers.</p>}
        {backwards && <p className="banner banner-warning small" role="status">A stay can’t end before it starts.</p>}
      </div>

      <div className="builder-confirm-actions">
        <button type="button" className="btn btn-primary" disabled={busy || halfDated || backwards} onClick={() => void save(true)}>
          {busy ? "Saving…" : "Save and continue"}
        </button>
        <button type="button" className="btn" onClick={onNext}>Skip for now</button>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- step 4 */

const sentence = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

function PlanStep({
  trip,
  confirmed,
  busy,
  onGenerate,
  onBack,
}: {
  trip: Trip;
  confirmed: number;
  busy: boolean;
  onGenerate: () => void;
  onBack: () => void;
}) {
  const stays = trip.preferences.accommodations;
  const days = tripDays(trip.startDate, trip.endDate);
  const rows: Array<[string, string, string]> = [
    ["pin", "Confirmed places", String(confirmed)],
    ["calendar", "Dates", `${formatDateSpan(trip.startDate, trip.endDate)} · ${days} ${days === 1 ? "day" : "days"}`],
    ["bed", "Where you’re staying", stays.length === 0 ? "Not set" : stays.length === 1 ? stays[0]!.name : `${stays.length} stays`],
    ["transit", "Getting around", `${sentence(trip.preferences.transport)} · ${trip.preferences.pace} pace`],
  ];

  return (
    <section className="builder-step-body" aria-labelledby="builder-plan-title">
      <header className="builder-head">
        <h1 id="builder-plan-title">Plan the days</h1>
        <p>We’ll lay your confirmed places across the dates. You can move everything afterwards.</p>
      </header>

      <dl className="builder-summary">
        {rows.map(([icon, label, value]) => (
          <div key={label}>
            <dt><span className="builder-summary-mark" aria-hidden="true"><Icon name={icon as "pin"} size={16} /></span>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>

      {stays.length > 1 && (
        <ul className="builder-stay-nights">
          {stays.map((stay, i) => (
            <li key={i}>
              <Icon name="bed" size={14} />
              <strong>{stay.name}</strong>
              <span>{stay.checkIn && stay.checkOut ? formatDateSpan(stay.checkIn, stay.checkOut) : "Any night the others don’t cover"}</span>
            </li>
          ))}
        </ul>
      )}

      {confirmed === 0 ? (
        <div className="builder-confirm-actions">
          <p className="small muted">Confirm at least one place and we can build the days.</p>
          <button type="button" className="btn btn-primary" onClick={onBack}>Back to confirming</button>
        </div>
      ) : (
        <div className="builder-confirm-actions">
          <button type="button" className="btn btn-primary btn-large" disabled={busy} onClick={onGenerate}>
            <Icon name="sparkle" size={19} /> {busy ? "Building…" : "Build my days"}
          </button>
          <p className="small muted">Nothing is locked in — you can move stops, swap days and regenerate afterwards.</p>
        </div>
      )}
    </section>
  );
}
