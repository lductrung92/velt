import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { server } from "@/test/server";

import { useEntityTranslation } from "./useEntityTranslation";

const API = "http://localhost/api";
const ID = "11111111-1111-1111-1111-111111111111";

function mockEndpoints(
  values: Record<string, unknown> = {},
  onPut?: (body: unknown) => void,
) {
  server.use(
    http.get(`${API}/public/settings`, () =>
      HttpResponse.json({
        "translation.enabled": true,
        "translation.locales": "en",
      }),
    ),
    http.get(`${API}/translations/article/${ID}`, () =>
      HttpResponse.json({
        entity: "article",
        entity_id: ID,
        base_locale: "vi",
        locales: ["en"],
        translatable_fields: ["slug", "title", "excerpt", "body_html", "seo"],
        translations: { en: { values, updated_at: "2026-10-12T00:00:00Z" } },
        requires_republish: false,
      }),
    ),
    http.put(`${API}/translations/article/${ID}/en`, async ({ request }) => {
      onPut?.(await request.json());
      return HttpResponse.json({
        entity: "article",
        entity_id: ID,
        base_locale: "vi",
        locales: ["en"],
        translatable_fields: ["slug", "title", "excerpt", "body_html", "seo"],
        translations: {},
        requires_republish: true,
      });
    }),
  );
}

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

async function mounted(values?: Record<string, unknown>) {
  const { result } = renderHook(() => useEntityTranslation("article", ID), {
    wrapper,
  });
  await waitFor(() => expect(result.current.enabled).toBe(true));
  await waitFor(() => expect(result.current.fields).toHaveLength(5));
  void values;
  return result;
}

describe("useEntityTranslation", () => {
  it("counts only fields that hold visible text", async () => {
    mockEndpoints({ title: "Lean Stock", excerpt: "   ", slug: "" });
    const result = await mounted();
    await waitFor(() =>
      expect(result.current.progress("en")).toEqual({ done: 1, total: 5 }),
    );
  });

  // A rich-text editor fires onChange once on mount with an empty paragraph.
  // Counting that as translated inflated the tab's progress, and marking it
  // dirty made merely opening a language tab block navigation and then write
  // the empty body back over a real one.
  it("treats an empty rich-text document as untranslated", async () => {
    mockEndpoints({});
    const result = await mounted();

    act(() => result.current.setLocale("en"));
    act(() => result.current.setField("body_html", "<p></p>"));

    await waitFor(() =>
      expect(result.current.progress("en")).toEqual({ done: 0, total: 5 }),
    );
    expect(result.current.dirty).toBe(false);
  });

  it("goes dirty once a field actually changes, and clean again after flush", async () => {
    const puts: unknown[] = [];
    mockEndpoints({}, (b) => puts.push(b));
    const result = await mounted();

    act(() => result.current.setLocale("en"));
    act(() => result.current.setField("title", "Lean Stock"));
    await waitFor(() => expect(result.current.dirty).toBe(true));

    await act(async () => result.current.flush(ID));
    await waitFor(() => expect(result.current.dirty).toBe(false));
    expect(puts).toEqual([{ values: { title: "Lean Stock" } }]);
  });

  it("re-typing the stored value is not a change", async () => {
    const puts: unknown[] = [];
    mockEndpoints({ title: "Lean Stock" }, (b) => puts.push(b));
    const result = await mounted();

    act(() => result.current.setLocale("en"));
    act(() => result.current.setField("title", "Lean Stock"));

    expect(result.current.dirty).toBe(false);
    await act(async () => result.current.flush(ID));
    expect(puts).toEqual([]);
  });

  it("stays switched off when the module is disabled", async () => {
    const spy = vi.fn();
    server.use(
      http.get(`${API}/public/settings`, () =>
        HttpResponse.json({ "translation.enabled": false }),
      ),
      http.get(`${API}/translations/article/${ID}`, () => {
        spy();
        return HttpResponse.json({});
      }),
    );
    const { result } = renderHook(() => useEntityTranslation("article", ID), {
      wrapper,
    });
    await waitFor(() => expect(result.current.enabled).toBe(false));
    expect(result.current.tabs).toEqual(["vi"]);
    expect(spy).not.toHaveBeenCalled();
  });
});
