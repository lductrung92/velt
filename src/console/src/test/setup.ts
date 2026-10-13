import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll } from "vitest";

import "@/app/i18n";
import { server } from "@/test/server";

// MSW lifecycle for the whole suite.
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.close());

// jsdom lacks crypto.randomUUID in some versions — api.ts uses it for the
// X-Correlation-ID header.
if (!globalThis.crypto?.randomUUID) {
  Object.defineProperty(globalThis, "crypto", {
    value: { ...globalThis.crypto, randomUUID: () => "test-uuid" },
  });
}

// jsdom lacks ResizeObserver, which cmdk (inside the <Select> popover) calls on
// mount → polyfill a no-op so opening a Select in tests doesn't throw.
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// jsdom doesn't implement scrollIntoView — cmdk scrolls the active item into
// view when a pre-selected <Select> opens. No-op it so those tests don't throw.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function () {};
}

// jsdom doesn't implement matchMedia. Components that pick a layout from the
// viewport — the date range picker shows one month on a phone, two where there
// is room — call it on first render. Report "no match", which is the narrow
// branch: a test that passes in the cramped layout passes in the roomy one.
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}
