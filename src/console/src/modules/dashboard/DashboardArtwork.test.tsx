import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DashboardArtwork } from "./DashboardArtwork";

vi.mock("./DashboardMotion", () => ({
  default: () => <div data-testid="dashboard-motion" />,
}));

let desktop = true;
let reduced = false;
let listeners: Set<() => void>;

beforeEach(() => {
  desktop = true;
  reduced = false;
  listeners = new Set();
  vi.stubGlobal("matchMedia", () => ({
    get matches() {
      return desktop && !reduced;
    },
    addEventListener: (_event: string, listener: () => void) =>
      listeners.add(listener),
    removeEventListener: (_event: string, listener: () => void) =>
      listeners.delete(listener),
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe("Dashboard artwork", () => {
  it("loads motion on desktop and unmounts it when reduced motion is requested", async () => {
    render(<DashboardArtwork />);
    expect(await screen.findByTestId("dashboard-motion")).toBeInTheDocument();
    act(() => {
      reduced = true;
      listeners.forEach((listener) => listener());
    });
    expect(screen.queryByTestId("dashboard-motion")).not.toBeInTheDocument();
  });

  it("does not mount the player on phones and enables it after resizing to desktop", async () => {
    desktop = false;
    render(<DashboardArtwork />);
    expect(screen.queryByTestId("dashboard-motion")).not.toBeInTheDocument();
    act(() => {
      desktop = true;
      listeners.forEach((listener) => listener());
    });
    expect(await screen.findByTestId("dashboard-motion")).toBeInTheDocument();
  });
});
