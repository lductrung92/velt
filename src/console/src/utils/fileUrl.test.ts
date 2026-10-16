import { afterEach, describe, expect, it, vi } from "vitest";

// The origin is read once when the module loads, so each case loads it fresh
// with the base URL that case is about.
async function load(base: string) {
  vi.resetModules();
  vi.stubEnv("VITE_API_BASE_URL", base);
  return (await import("./fileUrl")).fileUrl;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("fileUrl", () => {
  it("sends a URL the API built back to the API", async () => {
    // jsdom serves the page from localhost:3000; the API is somewhere else, so
    // a relative /api/files would be asked of the SPA and answer index.html.
    const fileUrl = await load("http://localhost:8081/api");
    expect(fileUrl("/api/files/cms/articles/a/featured-b.png")).toBe(
      "http://localhost:8081/api/files/cms/articles/a/featured-b.png",
    );
    expect(fileUrl("/img/abc123.webp")).toBe("http://localhost:8081/img/abc123.webp");
  });

  it("leaves everything alone when the API shares the console's origin", async () => {
    const fileUrl = await load("/api");
    expect(fileUrl("/api/files/x.png")).toBe("/api/files/x.png");
  });

  it("never touches a URL that already says where it lives", async () => {
    const fileUrl = await load("http://localhost:8081/api");
    expect(fileUrl("https://cdn.example.com/a.png")).toBe(
      "https://cdn.example.com/a.png",
    );
    expect(fileUrl("//cdn.example.com/a.png")).toBe("//cdn.example.com/a.png");
    expect(fileUrl("data:image/png;base64,AAA")).toBe("data:image/png;base64,AAA");
    expect(fileUrl("blob:http://localhost:3000/abc")).toBe(
      "blob:http://localhost:3000/abc",
    );
  });

  it("answers an empty string for nothing", async () => {
    const fileUrl = await load("http://localhost:8081/api");
    expect(fileUrl(null)).toBe("");
    expect(fileUrl(undefined)).toBe("");
    expect(fileUrl("")).toBe("");
  });
});
