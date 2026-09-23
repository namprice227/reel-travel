import type { Trip } from "@reel/contracts";
import { clearTripNotes } from "@/features/notes/notes-store";
import { api } from "@/lib/api-client";

export async function deleteTripWithConfirmation(trip: Trip): Promise<boolean> {
  const confirmed = window.confirm(
    `Delete “${trip.title}”? This permanently removes its saves, places, bookings, itinerary, sharing links and uploads. Places copied into other trips stay there, but links to this trip’s original saves will no longer open.`,
  );
  if (!confirmed) return false;
  await api("trips.delete", { params: { tripId: trip.id } });
  clearTripNotes(trip.id);
  return true;
}
