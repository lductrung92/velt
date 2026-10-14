import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import i18n from "@/app/i18n";
import { server } from "@/test/server";

import { DailyOverview } from "./DailyOverview";
import { vietnamDateKey } from "./calendar";
import { WEATHER_ENDPOINT } from "./weather.service";

const t = (key: string) => i18n.t(key);

// The city picker is the theme select — a popover, not a <select> — so a choice
// is made by opening it and clicking the option.
async function pickCity(name: string) {
  const user = userEvent.setup();
  await user.click(
    screen.getByRole("combobox", { name: t("dashboard.daily.choose_location") }),
  );
  await user.click(await screen.findByRole("option", { name }));
}
const time = Array.from({ length: 8 }, (_, i) => {
  const date = new Date(`${vietnamDateKey()}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + i);
  return date.toISOString().slice(0, 10);
});
const forecast = {
  current: {
    time: `${time[0]}T12:00`,
    temperature_2m: 27,
    apparent_temperature: 29,
    relative_humidity_2m: 82,
    wind_speed_10m: 12,
    weather_code: 3,
    is_day: 1,
  },
  daily: {
    time,
    weather_code: [3, 2, 3, 61, 80, 95, 0, 3],
    temperature_2m_max: Array(8).fill(30),
    temperature_2m_min: Array(8).fill(24),
    precipitation_probability_max: Array(8).fill(50),
  },
};

function renderOverview() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <DailyOverview />
    </QueryClientProvider>,
  );
}

beforeEach(() => localStorage.clear());

describe("Calendar and weather overview", () => {
  it("defaults to Da Nang and requests today plus seven future days", async () => {
    server.use(
      http.get(WEATHER_ENDPOINT, ({ request }) => {
        const params = new URL(request.url).searchParams;
        expect(params.get("latitude")).toBe("16.0678");
        expect(params.get("forecast_days")).toBe("8");
        expect(params.get("timezone")).toBe("Asia/Ho_Chi_Minh");
        return HttpResponse.json(forecast);
      }),
    );
    const { container } = renderOverview();
    expect(await screen.findByText("27°")).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", {
        name: t("dashboard.daily.choose_location"),
      }),
    ).toHaveTextContent("Đà Nẵng");
    expect(container.querySelectorAll(".dashboard-weather-day")).toHaveLength(
      7,
    );
    expect(
      screen.getByText(t("dashboard.daily.next_seven")),
    ).toBeInTheDocument();
    const today = container.querySelector(
      '.dashboard-calendar-day[aria-current="date"]',
    )!;
    expect(today).toHaveAttribute("aria-pressed", "true");
  });

  it("switches cities, persists the choice and shows the new data", async () => {
    server.use(
      http.get(WEATHER_ENDPOINT, ({ request }) =>
        HttpResponse.json({
          ...forecast,
          current: {
            ...forecast.current,
            temperature_2m:
              new URL(request.url).searchParams.get("latitude") === "21.0245"
                ? 21
                : 27,
          },
        }),
      ),
    );
    renderOverview();
    await screen.findByText("27°");
    await pickCity("Hà Nội");
    expect(await screen.findByText("21°")).toBeInTheDocument();
    expect(localStorage.getItem("zukatek.dashboard.weather.city")).toBe(
      "ha-noi",
    );
  });

  it("navigates the calendar and returns to today", async () => {
    server.use(http.get(WEATHER_ENDPOINT, () => HttpResponse.json(forecast)));
    const { container } = renderOverview();
    await screen.findByText("27°");
    const calendar = screen.getByRole("region", {
      name: t("dashboard.daily.calendar_title"),
    });
    fireEvent.click(
      within(calendar).getByRole("button", {
        name: t("dashboard.daily.next_month"),
      }),
    );
    fireEvent.click(
      container.querySelector(
        ".dashboard-calendar-day:not(.dashboard-calendar-day-outside)",
      )!,
    );
    expect(
      container.querySelector('.dashboard-calendar-day[aria-pressed="true"]'),
    ).toBeTruthy();
    fireEvent.click(
      within(calendar).getByRole("button", {
        name: t("dashboard.daily.today"),
      }),
    );
    expect(
      container.querySelector('.dashboard-calendar-day[aria-current="date"]'),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("jumps the calendar to a year picked from the dropdown", async () => {
    server.use(http.get(WEATHER_ENDPOINT, () => HttpResponse.json(forecast)));
    const user = userEvent.setup();
    const { container } = renderOverview();
    await screen.findByText("27°");
    const year = String(Number(vietnamDateKey().slice(0, 4)) + 2);
    const picker = screen.getByRole("combobox", {
      name: t("dashboard.daily.choose_year"),
    });
    await user.click(picker);
    await user.click(await screen.findByRole("option", { name: year }));
    expect(picker).toHaveTextContent(year);
    const inMonth = container.querySelector(
      ".dashboard-calendar-day:not(.dashboard-calendar-day-outside)",
    )!;
    expect(inMonth.getAttribute("aria-label")).toContain(year);
  });

  it("shows a recoverable error without invented temperatures", async () => {
    server.use(
      http.get(WEATHER_ENDPOINT, () => HttpResponse.json({}, { status: 503 })),
    );
    renderOverview();
    await waitFor(
      () =>
        expect(screen.getByRole("alert")).toHaveTextContent(
          t("dashboard.daily.weather_error"),
        ),
      { timeout: 5000 },
    );
    expect(screen.queryByText("27°")).not.toBeInTheDocument();
    server.use(http.get(WEATHER_ENDPOINT, () => HttpResponse.json(forecast)));
    fireEvent.click(screen.getByRole("button", { name: t("common.retry") }));
    expect(await screen.findByText("27°")).toBeInTheDocument();
  });
});
