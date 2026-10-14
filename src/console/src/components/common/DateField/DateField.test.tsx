import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import i18n from "@/app/i18n";

import { DateField } from "./DateField";
import { DateRangeField } from "./DateRangeField";

const t = (key: string) => i18n.t(key);

function Single({ initial = "", withTime = false }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <DateField value={value} onChange={setValue} withTime={withTime} />
      <output data-testid="value">{value}</output>
    </>
  );
}

function Range({ from = "", to = "" }) {
  const [range, setRange] = useState({ from, to });
  return (
    <>
      <DateRangeField
        from={range.from}
        to={range.to}
        onChange={(f, tt) => setRange({ from: f, to: tt })}
      />
      <output data-testid="value">{`${range.from}|${range.to}`}</output>
    </>
  );
}

/** Click a day in the open calendar by the number printed on it. */
async function pickDay(user: ReturnType<typeof userEvent.setup>, day: string) {
  const cells = await screen.findAllByRole("gridcell");
  const cell = cells.find((c) => c.textContent?.trim() === day);
  if (!cell) throw new Error(`no day ${day} in the open month`);
  await user.click(cell.querySelector("button") ?? cell);
}

/** Pick an option out of one of the calendar header's Selects. */
async function choose(
  user: ReturnType<typeof userEvent.setup>,
  name: string,
  option: string,
) {
  await user.click(screen.getByRole("combobox", { name }));
  await user.click(await screen.findByRole("option", { name: option }));
}

const monthName = (month: number) =>
  new Intl.DateTimeFormat(i18n.language, { month: "long" }).format(
    new Date(2026, month),
  );

describe("DateField", () => {
  it("emits the day the user clicked", async () => {
    const user = userEvent.setup();
    render(<Single initial="2026-10-13" />);

    await user.click(screen.getByRole("button", { name: /2026/ }));
    await pickDay(user, "20");

    expect(screen.getByTestId("value")).toHaveTextContent("2026-10-20");
  });

  it("shows the stored day back in the viewer's locale", async () => {
    render(<Single initial="2026-10-13" />);
    const expected = new Intl.DateTimeFormat(i18n.language, {
      dateStyle: "medium",
    }).format(new Date(2026, 9, 13));
    expect(screen.getByRole("button", { name: expected })).toBeInTheDocument();
  });

  it("keeps the time when only the day moves", async () => {
    // Moving an appointment by a day is not a request to reset it to midnight.
    const user = userEvent.setup();
    render(<Single initial="2026-10-13T09:30" withTime />);

    await user.click(screen.getByRole("button", { name: /2026/ }));
    await pickDay(user, "20");

    expect(screen.getByTestId("value")).toHaveTextContent("2026-10-20T09:30");
  });

  it("reads a date-only value as midnight, not as the UTC offset", async () => {
    // This is what forces the local-component parse. new Date("2026-10-13") is
    // UTC midnight, which is 07:00 here and the 12th anywhere west of
    // Greenwich; carry that into a field that shows time and the row the user
    // never touched suddenly reads 07:00.
    const user = userEvent.setup();
    render(<Single initial="2026-10-13" withTime />);

    await user.click(screen.getByRole("button", { name: /2026/ }));
    await pickDay(user, "20");

    expect(screen.getByTestId("value")).toHaveTextContent("2026-10-20T00:00");
  });

  it("jumps to the month and the year chosen in the header", async () => {
    // The point of the dropdowns: two clicks instead of thirty-one ‹.
    const user = userEvent.setup();
    const year = new Date().getFullYear() - 2;
    render(<Single initial="2026-10-13" />);

    await user.click(screen.getByRole("button", { name: /2026/ }));
    await choose(user, t("common.date.month"), monthName(2));
    await choose(user, t("common.date.year"), String(year));
    await pickDay(user, "5");

    expect(screen.getByTestId("value")).toHaveTextContent(`${year}-03-05`);
  });

  it("clears to an empty string, and offers nothing to clear when empty", async () => {
    const user = userEvent.setup();
    render(<Single initial="2026-10-13" />);

    await user.click(
      screen.getByRole("button", { name: t("common.date.clear") }),
    );

    expect(screen.getByTestId("value")).toHaveTextContent("");
    expect(
      screen.queryByRole("button", { name: t("common.date.clear") }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: t("common.date.pick") }),
    ).toBeInTheDocument();
  });
});

describe("DateRangeField", () => {
  // An empty range opens on the current month, so the clock decides which days
  // exist to click. Pin it.
  beforeAll(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2026, 9, 13, 12));
  });
  afterAll(() => vi.useRealTimers());

  it("reports both ends once the second day is picked", async () => {
    const user = userEvent.setup();
    render(<Range />);

    await user.click(
      screen.getByRole("button", { name: t("common.date.pick_range") }),
    );
    await pickDay(user, "5");
    await pickDay(user, "9");

    expect(screen.getByTestId("value")).toHaveTextContent(
      "2026-10-05|2026-10-09",
    );
  });

  it("jumps the visible month from the header dropdowns", async () => {
    const user = userEvent.setup();
    render(<Range />);

    await user.click(
      screen.getByRole("button", { name: t("common.date.pick_range") }),
    );
    await choose(user, t("common.date.month"), monthName(2));
    await choose(user, t("common.date.year"), "2024");
    await pickDay(user, "5");
    await pickDay(user, "9");

    expect(screen.getByTestId("value")).toHaveTextContent(
      "2024-03-05|2024-03-09",
    );
  });

  it("clears both ends together", async () => {
    const user = userEvent.setup();
    render(<Range from="2026-10-05" to="2026-10-09" />);

    await user.click(
      screen.getByRole("button", { name: t("common.date.clear") }),
    );

    expect(screen.getByTestId("value")).toHaveTextContent("|");
  });
});
