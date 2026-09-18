import type {
  Conflict,
  Day,
  LatLng,
  OpeningHours,
  Reservation,
  TripPreferences,
  ValidationStatus,
} from "@reel/contracts";

/** A confirmed place reduced to what scheduling needs. Build with toPlannablePlace(). */
export interface PlannablePlace {
  placeId: string;
  title: string;
  location: LatLng;
  openingHours: OpeningHours;
  visitMinutes: number;
  /** Provider facts used only as soft preferences; absent values remain unknown. */
  category?: string | null;
  priceLevel?: number | null;
  sourceInspirationIds: string[];
}

export interface PlannerContext {
  /** Destination metadata is part of stale-plan detection even though routing uses coordinates. */
  destination?: string;
  startDate: string;
  endDate: string;
  /** Wall-clock schedules retain the trip timezone without converting their times. */
  timezone?: string;
  preferences: TripPreferences;
  /** Confirmed places only. */
  places: PlannablePlace[];
  reservations: Reservation[];
  /** Inject for deterministic tests. */
  newId?: () => string;
}

export interface PlanResult {
  days: Day[];
  unscheduledPlaceIds: string[];
  conflicts: Conflict[];
  validationStatus: ValidationStatus;
  assumptions: string[];
}

/** ok:false = the edit would break a locked booking; nothing should be saved. */
export type EditOutcome = { ok: true; plan: PlanResult } | { ok: false; conflicts: Conflict[] };

export type PlannerErrorCode = "STOP_NOT_FOUND" | "PLACE_NOT_AVAILABLE" | "PLACE_ALREADY_SCHEDULED" | "DATE_OUTSIDE_TRIP";

/** Bad edit input (not a scheduling conflict). The server maps these to HTTP errors. */
export class PlannerError extends Error {
  readonly code: PlannerErrorCode;

  constructor(code: PlannerErrorCode, message: string) {
    super(message);
    this.name = "PlannerError";
    this.code = code;
  }
}

export const defaultStopId = () => `stop_${globalThis.crypto.randomUUID().slice(0, 12)}`;
