import { describe, expect, it } from "vitest";

import { collectText, fieldLabel, readAt, writeAt } from "./translationFields";

// The translator reads the labels from the same bundle the original form uses;
// here that lookup is a plain map so the test says what it means.
const VI: Record<string, string> = {
  "cms.landings.form.heading": "Tiêu đề",
  "cms.landings.form.label": "Nhãn",
  "cms.landings.form.question": "Câu hỏi",
};
const t = (key: string, fallback: string) => VI[key] ?? fallback;

describe("collectText", () => {
  it("offers a box for prose and nothing else", () => {
    // A hero as the builder stores it: three lines of text, an image, two
    // enums and a button. Only the words are translatable — nobody translates
    // "left" or a storage path.
    const hero = {
      eyebrow: "HỆ SINH THÁI",
      heading: "Sản phẩm số cho công việc",
      subheading: "",
      image_path: "cms/landing/hero-1.png",
      align: "left",
      background: "none",
      category_id: "1f2e…",
      buttons: [{ label: "Xem sản phẩm", href: "/products", style: "primary" }],
    };
    expect(collectText(hero).map((n) => n.path.join("."))).toEqual([
      "eyebrow",
      "heading",
      "buttons.0.label",
      "buttons.0.href",
    ]);
  });

  it("keeps the order the config is written in", () => {
    const faq = {
      title: "Câu hỏi thường gặp",
      items: [
        { question: "Giá bao nhiêu?", answer_html: "<p>Miễn phí</p>" },
        { question: "Có bản dùng thử?" },
      ],
    };
    expect(collectText(faq).map((n) => n.path.join("."))).toEqual([
      "title",
      "items.0.question",
      "items.0.answer_html",
      "items.1.question",
    ]);
  });
});

describe("fieldLabel", () => {
  it("names a box the way the original form names its field", () => {
    expect(fieldLabel(["heading"], t)).toBe("Tiêu đề");
  });

  it("numbers a repeated item from one", () => {
    // "Nhãn 2" is the second button — the index in the path is zero-based and
    // nobody counts buttons from zero.
    expect(fieldLabel(["buttons", "1", "label"], t)).toBe("Nhãn 2");
    expect(fieldLabel(["items", "0", "question"], t)).toBe("Câu hỏi 1");
  });

  it("falls back to the key rather than showing nothing", () => {
    expect(fieldLabel(["mystery_field"], t)).toBe("mystery_field");
  });
});

describe("readAt / writeAt", () => {
  it("writes into a copy, creating the shape as it goes", () => {
    const next = writeAt({}, ["buttons", "0", "label"], "Mua ngay");
    expect(readAt(next, ["buttons", "0", "label"])).toBe("Mua ngay");
  });
});
