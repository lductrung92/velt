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
