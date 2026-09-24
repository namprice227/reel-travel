import { describe, expect, it } from "vitest";
import { matchCity, outsideTripCity } from "../../apps/web/src/features/trips/trip-city";

// Synthetic addresses for fictional venues; only the city words matter to these checks.
const at = (...addresses: Array<string | null>) => ({ options: addresses.map((address) => ({ address })) });

describe("typed city on the create-trip wizard", () => {
  const japan = ["Tokyo", "Kyoto", "Osaka"];
  it("treats a listed city in any case or accent as that city", () => {
    expect(matchCity(" tokyo ", japan)).toEqual({ exact: "Tokyo", suggestion: null });
    expect(matchCity("Kyōto", japan)).toEqual({ exact: "Kyoto", suggestion: null });
  });
  it("suggests the closest listed city for a small typo", () => {
    expect(matchCity("Kyotto", japan)).toEqual({ exact: null, suggestion: "Kyoto" });
    expect(matchCity("Osaaka", japan)).toEqual({ exact: null, suggestion: "Osaka" });
  });
  it("leaves other cities unchecked rather than forcing a listed one", () => {
    expect(matchCity("Sapporo", japan)).toEqual({ exact: null, suggestion: null });
    expect(matchCity("Nara", japan)).toEqual({ exact: null, suggestion: null });
    expect(matchCity("", japan)).toEqual({ exact: null, suggestion: null });
  });
});

describe("places outside the trip's one city", () => {
  it("flags a place whose every address leaves out the trip city", () => {
    expect(outsideTripCity(at("1 Sample Lane, Higashiyama Ward, Kyoto 605-0000, Japan"), "Tokyo")).toBe("Tokyo");
    expect(outsideTripCity(at("Kyoto 600-0000, Japan", "Osaka 530-0000, Japan"), "Tokyo")).toBe("Tokyo");
  });
  it("keeps a place when any branch address is in the city", () => {
    expect(outsideTripCity(at("2 Example St, Shibuya, Tokyo 150-0000, Japan"), "Tokyo")).toBeNull();
    expect(outsideTripCity(at("Kyoto 600-0000, Japan", "Minato City, Tokyo 105-0000, Japan"), "Tokyo")).toBeNull();
  });
  it("uses the confirmed branch over the other options", () => {
    const place = { selected: { address: "Kyoto 600-0000, Japan" }, options: [{ address: "Shibuya, Tokyo, Japan" }] };
    expect(outsideTripCity(place, "Tokyo")).toBe("Tokyo");
  });
  it("reads the city from a typed destination with its country", () => {
    expect(outsideTripCity(at("Chuo Ward, Sapporo, Hokkaido 060-0000, Japan"), "Sapporo, Japan")).toBeNull();
    expect(outsideTripCity(at("Shibuya, Tokyo, Japan"), "Sapporo, Japan")).toBe("Sapporo");
  });
  it("does not flag what it cannot compare", () => {
    expect(outsideTripCity(at(), "Tokyo")).toBeNull();
    expect(outsideTripCity(at(null), "Tokyo")).toBeNull();
    expect(outsideTripCity(at("Kyoto, Japan"), "Japan")).toBeNull();
  });
});
