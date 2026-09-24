import { describe, expect, it } from "vitest";
import { checkHours, earliestOpenStart, openingWindowsOn } from "./hours";
import type { OpeningHours } from "@reel/contracts";

describe("overnight opening hours (synthetic)", () => {
  const friday: OpeningHours = { status: "known", windows: [{ day: 5, open: "20:00", close: "03:00" }] };
  it("checks and schedules the previous day's spillover without opening the entire day", () => {
    expect(checkHours(friday, "2026-09-26", 60, 120)).toBe("open");
    expect(earliestOpenStart(friday, "2026-09-26", 60, 60)).toBe(60);
    expect(checkHours(friday, "2026-09-26", 150, 210)).toBe("closed");
    expect(earliestOpenStart(friday, "2026-09-26", 150, 60)).toBeNull();
    expect(checkHours(friday, "2026-09-25", 60, 120)).toBe("closed");
    expect(checkHours(friday, "2026-09-25", 1260, 1380)).toBe("open");
  });
  it("wraps Saturday into Sunday", () => {
    const hours: OpeningHours = { status: "known", windows: [{ day: 6, open: "20:00", close: "03:00" }] };
    expect(checkHours(hours, "2026-09-27", 0, 180)).toBe("open");
  });
  it("joins continuous windows but preserves closures", () => {
    const hours: OpeningHours = { status: "known", windows: [
      ...friday.windows, { day: 6, open: "03:00", close: "06:00" }, { day: 6, open: "10:00", close: "12:00" },
    ] };
    expect(checkHours(hours, "2026-09-26", 120, 240)).toBe("open");
    expect(checkHours(hours, "2026-09-26", 300, 660)).toBe("closed");
  });
  it("preserves 24-hour and midnight closing semantics", () => {
    expect(checkHours({ status: "known", windows: [{ day: 5, open: "08:00", close: "08:00" }] }, "2026-09-26", 60, 120)).toBe("open");
    expect(checkHours({ status: "known", windows: [{ day: 5, open: "20:00", close: "00:00" }] }, "2026-09-26", 0, 60)).toBe("closed");
    expect(openingWindowsOn({ status: "unknown" }, "2026-09-26")).toBeNull();
    expect(earliestOpenStart({ status: "unknown" }, "2026-09-26", 60, 60)).toBe(60);
  });
});
