import { describe, expect, it } from "vitest";

import {
  calendarDays,
  lunarDate,
  shiftMonth,
  vietnamDateKey,
} from "./calendar";

describe("Vietnamese solar and lunar calendar", () => {
  it("uses Vietnam's date across the UTC midnight boundary", () => {
    expect(vietnamDateKey(new Date("2026-02-16T16:59:00Z"))).toBe("2026-02-16");
    expect(vietnamDateKey(new Date("2026-02-16T17:00:00Z"))).toBe("2026-02-17");
  });

  it("converts Tet and distinguishes the leap second lunar month in 2023", () => {
    expect(lunarDate("2026-02-17")).toMatchObject({
      day: 1,
      month: 1,
      year: 2026,
      leap: false,
    });
    expect(lunarDate("2023-03-22")).toMatchObject({
      day: 1,
      month: 2,
      year: 2023,
      leap: true,
    });
    expect(lunarDate("2023-06-19")).toMatchObject({
      day: 2,
      month: 5,
      year: 2023,
    });
  });

  it("lays out complete Monday-first weeks and handles year boundaries", () => {
    const days = calendarDays("2026-10");
    expect(days).toHaveLength(42);
    expect(days[0].key).toBe("2026-09-28");
    expect(days.filter((day) => day.inMonth)).toHaveLength(31);
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  });
});
