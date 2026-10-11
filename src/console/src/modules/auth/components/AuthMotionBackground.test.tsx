import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AuthMotionBackground from "./AuthMotionBackground";

const playback = vi.hoisted(() => ({
  play: vi.fn(),
  pause: vi.fn(),
  configuration: vi.fn(),
}));
vi.mock("@remotion/player", async () => {
  const { forwardRef, useImperativeHandle } = await import("react");
  return {
    Player: forwardRef(function MockPlayer(_props, ref) {
      playback.configuration(_props);
      useImperativeHandle(ref, () => playback);
      return null;
    }),
  };
});

let reduced = false;
let visibility = "visible";
let mediaListeners: Set<() => void>;

beforeEach(() => {
  vi.clearAllMocks();
  reduced = false;
  visibility = "visible";
  mediaListeners = new Set();
  vi.stubGlobal("matchMedia", () => ({
    get matches() {
      return reduced;
    },
    addEventListener: (_event: string, listener: () => void) =>
      mediaListeners.add(listener),
    removeEventListener: (_event: string, listener: () => void) =>
      mediaListeners.delete(listener),
  }));
  vi.spyOn(document, "visibilityState", "get").mockImplementation(
    () => visibility as DocumentVisibilityState,
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function setVisibility(value: string) {
  act(() => {
    visibility = value;
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

describe("Auth background motion", () => {
  it("autoplays without exposing playback controls", () => {
    render(<AuthMotionBackground />);
    expect(playback.play).toHaveBeenCalledOnce();
    expect(playback.configuration).toHaveBeenCalledWith(
      expect.objectContaining({
        autoPlay: true,
        initiallyMuted: true,
        numberOfSharedAudioTags: 0,
        controls: false,
        loop: true,
      }),
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("stays static for reduced motion, including a preference change while open", () => {
    reduced = true;
    render(<AuthMotionBackground />);
    expect(playback.play).not.toHaveBeenCalled();
    expect(playback.pause).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    act(() => {
      reduced = false;
      mediaListeners.forEach((listener) => listener());
    });
    expect(playback.play).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("keeps autoplay enabled when tab visibility changes", () => {
    render(<AuthMotionBackground />);
    setVisibility("hidden");
    setVisibility("visible");
    expect(playback.pause).not.toHaveBeenCalled();
    expect(playback.play).toHaveBeenCalledOnce();
  });
});
