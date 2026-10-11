import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthLayout } from "./AuthLayout";

const motion = vi.hoisted(() => ({ render: vi.fn() }));
vi.mock("./AuthMotionBackground", () => ({
  default: () => {
    motion.render();
    return <div data-testid="motion-background" />;
  },
}));

let wide = false;
let listeners: Set<() => void>;
beforeEach(() => {
  motion.render.mockClear();
  wide = false;
  listeners = new Set();
  vi.stubGlobal("matchMedia", () => ({
    get matches() {
      return wide;
    },
    addEventListener: (_event: string, listener: () => void) =>
      listeners.add(listener),
    removeEventListener: (_event: string, listener: () => void) =>
      listeners.delete(listener),
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe("Auth layout backgrounds", () => {
  it("uses the static background on phones without mounting Remotion", () => {
    render(
      <AuthLayout title="Login">
        <input aria-label="Email" />
      </AuthLayout>,
    );
    expect(screen.getByRole("textbox", { name: "Email" })).toBeInTheDocument();
    expect(screen.queryByTestId("motion-background")).not.toBeInTheDocument();
    expect(motion.render).not.toHaveBeenCalled();
  });

  it("mounts motion on a wide screen and removes it when switching to mobile", async () => {
    wide = true;
    render(
      <AuthLayout title="Login">
        <input aria-label="Email" />
      </AuthLayout>,
    );
    expect(await screen.findByTestId("motion-background")).toBeInTheDocument();
    act(() => {
      wide = false;
      listeners.forEach((listener) => listener());
    });
    expect(screen.queryByTestId("motion-background")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Email" })).toBeInTheDocument();
  });
});
