"use client";

import { useRouter } from "next/navigation";
import { ErrorBanner, Loading } from "@/components/ui";
import { useApi } from "@/lib/use-api";
import { ChoosePlacesStep } from "@/features/trips/ChoosePlacesStep";

/** The full places view shares the same tick-to-plan choice as the trip builder. */
export function PlacesPage({ tripId }: { tripId: string }) {
  const router = useRouter();
  const params = { tripId };
  const trip = useApi("trips.get", { params });
  const places = useApi("places.list", { params }, {
    pollMs: (data) => data.verificationJobs?.some((job) => job.status === "queued" || job.status === "running") ? 3000 : false,
  });

  if (trip.error) return <ErrorBanner error={trip.error} />;
  if (places.error) return <ErrorBanner error={places.error} />;
  if (!trip.data || !places.data) return <Loading />;

  return (
    <div className="fit-page places-page">
      <div className="builder-main panel-scroll">
        <ChoosePlacesStep
          key={trip.data.trip.updatedAt}
          trip={trip.data.trip}
          places={places.data.places}
          verificationJobs={places.data.verificationJobs}
          onTripSaved={(updated) => trip.setData({ trip: updated })}
          onPlacesChanged={() => places.reload().then(() => undefined)}
          onNext={() => router.push(`/my-trip/${tripId}/itinerary`)}
        />
      </div>
    </div>
  );
}
