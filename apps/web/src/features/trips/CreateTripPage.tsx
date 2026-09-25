"use client";

<<<<<<< HEAD
import { MAX_TRIP_DAYS, SUPPORTED_COUNTRIES, countryName, type Country as ContractCountry, type Trip } from "@reel/contracts";
=======
import { MAX_TRIP_DAYS, SUPPORTED_COUNTRIES, countryCodeFromName, type Country as ContractCountry } from "@reel/contracts";
>>>>>>> main
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { Icon } from "@/components/icons";
import { ErrorBanner } from "@/components/ui";
import { api, ApiError } from "@/lib/api-client";
import { addDays, formatDateSpan, tripDays, todayIso } from "@/lib/trip-dates";
import { matchCity } from "./trip-city";

// Create a trip at /my-trip/new (design "1D · One question at a time"): country, then city, then dates,
// one question per screen. Earlier answers stay visible as plain context text.
// A trip stays in one supported country, so travel times stay realistic.

export type Country = ContractCountry;

/** Shared with the server, which uses it to set a draft trip's timezone from its source. */
export const COUNTRIES: Country[] = SUPPORTED_COUNTRIES;

/** Timezones offered on the trip details page; one per supported country. */
export const TIMEZONES = COUNTRIES.map((c) => c.timezone);

type Question = 1 | 2 | 3;

const QUESTIONS: Record<Question, { title: (country: string) => string; lede: string; next: string }> = {
  1: { title: () => "Choose country", lede: "", next: "" },
  2: { title: () => "Choose City", lede: "", next: "" },
  3: { title: () => "Choose dates", lede: "", next: "" },
};

/** `accountPlaceIds`: ticked places from Home's detected-places popup, copied in once the trip exists. */
export function CreateTripPage({ accountPlaceIds = [], countryCode = null }: { accountPlaceIds?: string[]; countryCode?: string | null }) {
  const router = useRouter();
  const [question, setQuestion] = useState<Question>(1);
  const [country, setCountry] = useState<Country>(() => COUNTRIES.find((c) => countryCode && c.name === countryName(countryCode)) ?? COUNTRIES[0]!);
  const [city, setCity] = useState(() => country.cities[0]!);
  // A trip created before copying failed is reused on retry, so a second click never makes two trips.
  const created = useRef<Trip | null>(null);
  const [otherCity, setOtherCity] = useState("");
  const [startDate, setStart] = useState("");
  const [endDate, setEnd] = useState("");
  const [title, setTitle] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [typingDates, setTypingDates] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  // A typed name matching a listed city ("tokyo") becomes that city; other typed cities are kept as typed.
  const typed = matchCity(otherCity, country.cities);
  const typedOther = typed.exact ? "" : otherCity.trim();
  const pickedCity = typed.exact ?? (typedOther ? null : city);
  const destination = (typedOther || typed.exact || city).trim();
  const storedDestination = typedOther && !destination.toLocaleLowerCase().endsWith(`, ${country.name.toLocaleLowerCase()}`)
    ? `${destination}, ${country.name}` : destination;
  const days = startDate && endDate && endDate >= startDate ? tripDays(startDate, endDate) : 0;
  const tooLong = days > MAX_TRIP_DAYS;
  const suggested = !days ? `Trip to ${destination}` : `${days === 1 ? "A day" : `${numberWord(days)} days`} in ${destination}`;
  const datesReady = Boolean(destination && days > 0 && !tooLong);

  function pickCountry(next: Country) {
    if (next.name !== country.name) {
      setCity(next.cities[0]!);
      setOtherCity("");
    }
    setCountry(next);
  }

  function continueOn() {
    if (question === 1) setQuestion(2);
    else if (question === 2 && destination) setQuestion(3);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (question !== 3) return continueOn();
    if (!datesReady || busy) return;
    setBusy(true);
    setError(null);
    try {
      const trip = created.current ?? (await api("trips.create", {
        body: { title: title.trim() || suggested, destination: storedDestination, timezone: country.timezone, startDate, endDate },
      })).trip;
      created.current = trip;
      if (accountPlaceIds.length) {
        const { places } = await api("places.copy", { params: { tripId: trip.id }, body: { accountPlaceIds } });
        await api("places.select", { params: { tripId: trip.id }, body: { placeIds: places.map((place) => place.id) } });
      }
      router.push(`/my-trip/${trip.id}/itinerary`);
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, "INTERNAL", String(err)));
      setBusy(false);
    }
  }

  const q = QUESTIONS[question];

  function pickCity(next: string) {
    setCity(next);
    setOtherCity("");
  }

  return (
    <form className="fit-page ask-page" onSubmit={submit}>
      <div className="ask-top">
        <div className="ask-top-row">
          {question === 1 ? (
            <Link href="/my-trip" className="back-link" aria-label="Back to my trips"><Icon name="arrowLeft" size={16} /></Link>
          ) : (
            <button type="button" className="back-link" aria-label="Back to previous step" onClick={() => setQuestion((question - 1) as Question)}><Icon name="arrowLeft" size={16} /></button>
          )}
          {/* Earlier answers sit in the top row, so the question below keeps the height. */}
          {question === 2 && <span className="muted">{country.name}</span>}
          {question === 3 && <span className="muted">{storedDestination.toLowerCase().endsWith(`, ${country.name.toLowerCase()}`) ? storedDestination : `${destination}, ${country.name}`}</span>}
        </div>
        <div className="ask-progress" role="progressbar" aria-label="Trip setup progress" aria-valuemin={1} aria-valuemax={3} aria-valuenow={question}>
          {[1, 2, 3].map((n) => <span key={n} className={n <= question ? "is-on" : undefined} />)}
        </div>
      </div>

      <div className="ask-body panel-scroll fit-fill">
        <header className="ask-head">
          <h1>{q.title(country.name)}</h1>
<<<<<<< HEAD
          <p>{q.lede}</p>
          {accountPlaceIds.length > 0 && <p className="ask-carry" role="status">
            <Icon name="pin" size={15} /> {accountPlaceIds.length} {accountPlaceIds.length === 1 ? "place" : "places"} from your reel will be added to this trip.
          </p>}
=======
          {q.lede && <p>{q.lede}</p>}
>>>>>>> main
        </header>

        {question === 1 && (
          <ul className="ask-options is-grid" aria-label="Country">
            {COUNTRIES.map((c) => (
              <li key={c.name}>
                <AskOption icon="globe" flag={countryFlag(c.name)} title={c.name} sub={c.cities.join(", ")} on={c.name === country.name} onPick={() => pickCountry(c)} />
              </li>
            ))}
          </ul>
        )}

        {question === 2 && (
          <div className="ask-city">
            <ul className="ask-options" aria-label="City">
              {country.cities.map((c) => (
                <li key={c}>
                  <AskOption icon="pin" title={c} on={c === pickedCity} onPick={() => pickCity(c)} />
                </li>
              ))}
            </ul>
            <div className="ask-other">
              <label htmlFor="new-trip-city">Other</label>
              <span className="field-icon">
                <Icon name="search" size={18} />
                <input id="new-trip-city" value={otherCity} onChange={(e) => setOtherCity(e.target.value)} placeholder="Type a city"
                  maxLength={120 - Math.max(country.name.length + 2, `${numberWord(MAX_TRIP_DAYS)} days in `.length)} aria-describedby="new-trip-city-hint" />
              </span>
              {/* Spelling is only compared with the listed cities; nothing checks other city names yet. */}
              <p id="new-trip-city-hint" className="ask-hint small" role="status">
                {typed.exact ? <>We’ll use {typed.exact}.</>
                  : typed.suggestion ? <>Did you mean <button type="button" className="btn-link" onClick={() => pickCity(typed.suggestion!)}>{typed.suggestion}</button>?</>
                    : null}
              </p>
            </div>
          </div>
        )}

        {question === 3 && (
          <div className="ask-dates">
            {!typingDates && <RangeCalendar start={startDate} end={endDate} onChange={(s, e) => { setStart(s); setEnd(e); }}>
              <div className="ask-length">
                <strong>
                  {!startDate ? "Pick a start day" : endDate && days > 0 ? formatDateSpan(startDate, endDate) : `${formatDateSpan(startDate, startDate)}, now pick an end day`}
                  <span> · {days ? `${days} of up to ${MAX_TRIP_DAYS} days` : `up to ${MAX_TRIP_DAYS} days`}</span>
                </strong>
                <span className="ask-length-bar" aria-hidden="true" style={{ gridTemplateColumns: `repeat(${MAX_TRIP_DAYS}, minmax(0, 1fr))` }}>
                  {Array.from({ length: MAX_TRIP_DAYS }, (_, i) => <span key={i} className={i < days ? "is-on" : undefined} />)}
                </span>
              </div>
            </RangeCalendar>}
            <button type="button" className="btn-link small" onClick={() => setTypingDates(!typingDates)}>
              {typingDates ? "Choose from calendar" : "Type dates instead"}
            </button>
            {typingDates && (
              <div className="ask-date-row" id="new-trip-typed-dates">
                <label htmlFor="new-trip-start">
                  Start date
                  <input id="new-trip-start" type="date" required min={todayIso()} value={startDate} onChange={(e) => setStart(e.target.value)} />
                </label>
                <label htmlFor="new-trip-end">
                  End date
                  <input id="new-trip-end" type="date" required min={startDate || todayIso()} value={endDate} onChange={(e) => setEnd(e.target.value)} />
                </label>
              </div>
            )}
            {tooLong && <p className="banner banner-warning small" role="status">{days} days is longer than {MAX_TRIP_DAYS}. Shorten the dates, or plan a second trip.</p>}
            <div className="ask-name">
              <Icon name="edit" size={16} />
              {renaming ? (
                <label htmlFor="new-trip-title" className="ask-name-field">
                  <span className="sr-only">Trip name</span>
                  <input id="new-trip-title" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder={suggested} maxLength={120} />
                </label>
              ) : (
                <>
                  <strong>{title.trim() || suggested}</strong>
                  <button type="button" className="btn-link" onClick={() => setRenaming(true)}>Rename</button>
                </>
              )}
            </div>
            {startDate && endDate && days > 0 && !tooLong && <p className="sr-only" role="status">{formatDateSpan(startDate, endDate)}, {days} days</p>}
          </div>
        )}
        <ErrorBanner error={error} />
      </div>

      <footer className="ask-foot">
        <span className="muted small">{q.next}</span>
        <button className="btn btn-primary btn-large" disabled={busy || (question === 2 && !destination) || (question === 3 && !datesReady)}>
          {question === 3 ? (busy ? "Creating…" : "Create trip") : "Continue"} <Icon name="arrowRight" size={18} />
        </button>
      </footer>
    </form>
  );
}

function countryFlag(name: string) {
  const code = countryCodeFromName(name);
  return code ? [...code].map((letter) => String.fromCodePoint(127397 + letter.charCodeAt(0))).join("") : "";
}

function AskOption({ icon, flag, title, sub, on, onPick }: { icon: "globe" | "pin"; flag?: string; title: string; sub?: string; on: boolean; onPick: () => void }) {
  return (
    <button type="button" className={`ask-option${on ? " is-on" : ""}`} aria-pressed={on} onClick={onPick}>
      <span className="ask-option-mark" aria-hidden="true">{flag ? <span className="ask-country-flag">{flag}</span> : <Icon name={icon} size={22} />}</span>
      <span className="ask-option-text"><strong>{title}</strong>{sub && <small>{sub}</small>}</span>
      <Icon name={on ? "checkCircle" : "chevronRight"} size={22} className="ask-option-end" />
    </button>
  );
}

/** Two months side by side; the first click sets the start, the second the end. Children form the card's footer. */
function RangeCalendar({ start, end, onChange, children }: { start: string; end: string; onChange: (start: string, end: string) => void; children?: ReactNode }) {
  const today = todayIso();
  const [month, setMonth] = useState(() => (start || today).slice(0, 7));
  const next = shiftMonth(month, 1);

  function pick(date: string) {
    if (!start || end || date < start) onChange(date, "");
    else onChange(start, date);
  }

  return (
    <div className="range-cal card">
      <div className="range-cal-nav">
        <button type="button" className="icon-btn" aria-label="Previous month" disabled={month <= today.slice(0, 7)} onClick={() => setMonth(shiftMonth(month, -1))}><Icon name="chevronLeft" size={18} /></button>
        <button type="button" className="icon-btn" aria-label="Next month" onClick={() => setMonth(next)}><Icon name="chevronRight" size={18} /></button>
      </div>
      {[month, next].map((m) => (
        <MonthGrid key={m} month={m} start={start} end={end} today={today} onPick={pick} />
      ))}
      {children && <div className="range-cal-foot">{children}</div>}
    </div>
  );
}

function MonthGrid({ month, start, end, today, onPick }: { month: string; start: string; end: string; today: string; onPick: (date: string) => void }) {
  const first = `${month}-01`;
  const lead = (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7; // Monday first
  const length = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
  const label = new Date(`${first}T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  return (
    <div className="range-month">
      <strong>{label}</strong>
      <div className="range-grid" role="group" aria-label={label}>
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => <span key={i} className="range-dow" aria-hidden="true">{d}</span>)}
        {Array.from({ length: lead }, (_, i) => <span key={`lead-${i}`} />)}
        {Array.from({ length }, (_, i) => {
          const date = addDays(first, i);
          const edge = date === start || date === end;
          const inside = Boolean(start && end && date > start && date < end);
          const long = new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
          return (
            <button key={date} type="button" className={edge ? "is-edge" : inside ? "is-inside" : undefined} disabled={date < today}
              aria-pressed={edge || inside} aria-label={long} onClick={() => onPick(date)}>
              {i + 1}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const shiftMonth = (month: string, by: number) => {
  const d = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + by, 1));
  return d.toISOString().slice(0, 7);
};

const WORDS = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen", "Twenty"];
const numberWord = (n: number) => WORDS[n] ?? String(n);
