import { describe, expect, it, vi } from "vitest";
import { destinationCountryCode, searchCountries } from "../../apps/web/src/features/trips/country-search";
import { resolveCityFromGoogle } from "../../apps/web/src/server/services/destinations";
import { searchCityCatalog } from "../../apps/web/src/server/services/city-catalog";

describe("country picker", () => {
  it("finds countries by prefix, code, accent and a small spelling error", () => {
    expect(searchCountries("Can")[0]?.code).toBe("CA");
    expect(searchCountries("US")[0]?.code).toBe("US");
    expect(searchCountries("Jpan")[0]?.code).toBe("JP");
    expect(searchCountries("Cote").some((item) => item.code === "CI")).toBe(true);
    expect(searchCountries("Kosovo")[0]?.code).toBe("XK");
    expect(searchCountries("zzzx")).toEqual([]);
  });
  it("recognizes new-country trip destinations for the neutral cover", () => {
    expect(destinationCountryCode("Toronto, Canada")).toBe("CA");
    expect(destinationCountryCode("City, Caribbean Netherlands")).toBe("BQ");
    expect(destinationCountryCode("Tokyo")).toBeNull();
  });
});

describe("GeoNames city catalogue", () => {
  it("searches the selected ISO country and keeps the region for duplicate names", () => {
    expect(searchCityCatalog("CA", "toron")[0]).toMatchObject({ name: "Toronto", region: "Ontario" });
    expect(searchCityCatalog("FR", "Toronto")).toEqual([]);
    expect(searchCityCatalog("US", "Springfield, Illinois")[0]).toMatchObject({ name: "Springfield", region: "Illinois" });
    expect(searchCityCatalog("XK", "Pristina")[0]).toMatchObject({ name: "Pristina", region: "Pristina" });
  });

  it("finds an alternate spelling without treating it as a verified Google city", () => {
    expect(searchCityCatalog("VN", "Saigon")[0]).toMatchObject({ name: "Ho Chi Minh City" });
    expect(searchCityCatalog("VN", "S")).toEqual([]);
  });
});

const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });
const suggestion = (name: string, text: string, placeId = "city_1", distanceMeters?: number) => ({
  placePrediction: { placeId, text: { text }, structuredFormat: { mainText: { text: name } }, distanceMeters },
});

describe("typed trip city lookup", () => {
  it("resolves an exact city within the selected country and saves its IANA timezone", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(json({ suggestions: [suggestion("Toronto", "Toronto, ON, Canada")] }))
      .mockResolvedValueOnce(json({ location: { latitude: 43.65, longitude: -79.38 }, addressComponents: [{ shortText: "CA", types: ["country"] }] }))
      .mockResolvedValueOnce(json({ status: "OK", timeZoneId: "America/Toronto" }));
    const result = await resolveCityFromGoogle({ countryCode: "CA", city: "Toronto" }, "test-key", fetcher);
    expect(result).toEqual({ city: "Toronto", timezone: "America/Toronto" });
    expect(fetcher).toHaveBeenCalledTimes(3);
    const autocompleteBody = JSON.parse(fetcher.mock.calls[0]![1].body);
    expect(autocompleteBody.includedPrimaryTypes).toEqual(["(cities)"]);
    expect(autocompleteBody.includedRegionCodes).toEqual(["ca"]);
  });

  it("rejects a city returned in another country", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(json({ suggestions: [suggestion("Paris", "Paris, France")] }))
      .mockResolvedValueOnce(json({ location: { latitude: 48.86, longitude: 2.35 }, addressComponents: [{ shortText: "FR", types: ["country"] }] }));
    await expect(resolveCityFromGoogle({ countryCode: "CA", city: "Paris" }, "test-key", fetcher)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("resolves a selected GeoNames city even when Google abbreviates its region", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(json({ suggestions: [suggestion("Toronto", "Toronto, ON, Canada", "near", 900)] }))
      .mockResolvedValueOnce(json({ location: { latitude: 43.65, longitude: -79.38 }, addressComponents: [{ shortText: "CA", types: ["country"] }] }))
      .mockResolvedValueOnce(json({ status: "OK", timeZoneId: "America/Toronto" }));
    const result = await resolveCityFromGoogle({ countryCode: "CA", city: "Toronto, Ontario", geonameId: 6167865 }, "test-key", fetcher);
    expect(result).toEqual({ city: "Toronto", timezone: "America/Toronto" });
    const body = JSON.parse(fetcher.mock.calls[0]![1].body);
    expect(body.origin).toMatchObject({ latitude: expect.any(Number), longitude: expect.any(Number) });
    expect(body.locationBias.circle.radius).toBe(50_000);
  });

  it("rejects a distant Google result for a selected GeoNames city", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(json({ suggestions: [suggestion("Toronto", "Toronto, CA", "far", 50)] }))
      .mockResolvedValueOnce(json({ location: { latitude: 49.28, longitude: -123.12 }, addressComponents: [{ shortText: "CA", types: ["country"] }] }));
    await expect(resolveCityFromGoogle({ countryCode: "CA", city: "Toronto, Ontario", geonameId: 6167865 }, "test-key", fetcher))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("accepts a source-listed alternate city name when Google uses it nearby", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(json({ suggestions: [suggestion("Saigon", "Saigon, Vietnam", "alias", 1100)] }))
      .mockResolvedValueOnce(json({ location: { latitude: 10.82, longitude: 106.63 }, addressComponents: [{ shortText: "VN", types: ["country"] }] }))
      .mockResolvedValueOnce(json({ status: "OK", timeZoneId: "Asia/Ho_Chi_Minh" }));
    await expect(resolveCityFromGoogle({ countryCode: "VN", city: "Ho Chi Minh City, Ho Chi Minh City (HCMC)", geonameId: 1566083 }, "test-key", fetcher))
      .resolves.toEqual({ city: "Saigon", timezone: "Asia/Ho_Chi_Minh" });
  });

  it("does not guess when the same city name has multiple matches", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(json({ suggestions: [
      suggestion("Springfield", "Springfield, Illinois, United States", "one"),
      suggestion("Springfield", "Springfield, Massachusetts, United States", "two"),
    ] }));
    await expect(resolveCityFromGoogle({ countryCode: "US", city: "Springfield" }, "test-key", fetcher)).rejects.toMatchObject({ code: "INVALID_STATE" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
