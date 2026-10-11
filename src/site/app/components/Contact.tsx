import { useState } from "react";
import type { FormEvent } from "react";
import { useSite } from "../context";
import { contactFor } from "../lib/links";
import { Icon } from "./Icon";
import { Modal } from "./Modal";

export function Contact({
  audience,
  onAudience,
}: {
  audience: string;
  onAudience: (value: string) => void;
}) {
  const { data, products, referrer, url } = useSite();
  const [person, setPerson] = useState(referrer?.id || ""),
    [brief, setBrief] = useState(""),
    [copyStatus, setCopyStatus] = useState("");
  const target = contactFor(data, person);
  const selectedId = url.searchParams.get("product") || "";
  function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    for (const id of ["contact-name", "contact-message"]) {
      const field = form.querySelector<HTMLInputElement | HTMLTextAreaElement>(
        `#${id}`,
      )!;
      field.setCustomValidity(
        field.value.trim() ? "" : "Vui lòng nhập nội dung trước khi tiếp tục.",
      );
    }
    if (!form.reportValidity()) return;
    const fields = new FormData(form),
      product = products.find((item) => item.id === fields.get("product"));
    const consultant = data.members.find((member) => member.id === person);
    setBrief(
      `Xin chào ZUKATEK,\n\nTôi là: ${String(fields.get("name")).trim()}\nEmail: ${String(fields.get("email")).trim()}\nMua sản phẩm cho: ${audience}\nSản phẩm quan tâm: ${product ? product.name + (product.example ? " (mẫu minh họa)" : "") : "Cần tư vấn lựa chọn"}\nNgười tư vấn: ${consultant?.name || "Đội ngũ ZUKATEK"}${referrer ? `\nĐược giới thiệu bởi: ${referrer.name}` : ""}\n\nCâu hỏi về sản phẩm:\n${String(fields.get("message")).trim()}\n\nMong nhận được tư vấn về tính năng, giá và cách sử dụng.`,
    );
    setCopyStatus("");
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(brief);
      setCopyStatus("Đã sao chép lời nhắn.");
    } catch {
      setCopyStatus("Bạn có thể chọn nội dung và sao chép thủ công.");
    }
  }
  function download() {
    const link = URL.createObjectURL(
      new Blob(["\ufeff" + brief], { type: "text/plain;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = link;
    anchor.download = "loi-nhan-zukatek.txt";
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(link), 1000);
    setCopyStatus(
      "Đã tải lời nhắn về thiết bị. Nội dung chưa được gửi đến ZUKATEK.",
    );
  }
  return (
    <>
      <section
        className="contact-section"
        id="contact"
        aria-labelledby="contact-title"
      >
        <div className="container contact-layout">
          <div className="contact-copy">
            <span className="eyebrow">TƯ VẤN & MUA SẢN PHẨM</span>
            <h2 id="contact-title">
              Cần tư vấn sản phẩm?
              <br />
              Liên hệ ZUKATEK.
            </h2>
            <p>
              Nhận tư vấn về tính năng, giá và cách triển khai
              <br />
              từ người giới thiệu hoặc đội ngũ ZUKATEK.
            </p>
            <div className="contact-channel" id="contact-channel">
              <span className="contact-mail-icon">
                <Icon name="mail" />
              </span>
              <div>
                <strong>
                  {target.personal
                    ? `Tư vấn cùng ${target.member?.name}`
                    : "Tư vấn sản phẩm ZUKATEK"}
                </strong>
                {target.email && (
                  <a href={`mailto:${target.email}`}>{target.email}</a>
                )}
                {target.zalo && (
                  <a
                    href={target.zalo}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Liên hệ qua Zalo ↗
                  </a>
                )}
                {!target.email && !target.zalo && (
                  <span>
                    Kênh liên hệ sẽ sớm được cập nhật. Bạn có thể gửi lời nhắn
                    cho người đã giới thiệu ZUKATEK.
                  </span>
                )}
              </div>
            </div>
            <div className="contact-decoration" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
              <i />
              <span>ZUKATEK</span>
            </div>
          </div>
          <form className="contact-form" id="contact-form" onSubmit={prepare}>
            <h3>Nhận tư vấn sản phẩm</h3>
            <p className="form-intro" id="form-intro">
              {target.email || target.zalo
                ? "Cho biết sản phẩm bạn quan tâm và câu hỏi cần tư vấn."
                : "Chuẩn bị nội dung hỏi mua sản phẩm để gửi cho người đã giới thiệu ZUKATEK."}
            </p>
            <div className="form-row">
              <div className="field">
                <label htmlFor="contact-name">
                  Tên của bạn <span>*</span>
                </label>
                <input
                  id="contact-name"
                  name="name"
                  autoComplete="name"
                  placeholder="Bạn tên là gì?"
                  maxLength={100}
                  required
                  onInput={(event) => event.currentTarget.setCustomValidity("")}
                />
              </div>
              <div className="field">
                <label htmlFor="contact-email">
                  Email <span>*</span>
                </label>
                <input
                  id="contact-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  maxLength={254}
                  required
                />
              </div>
            </div>
            <div className="field">
              <label htmlFor="contact-person">Người tư vấn</label>
              <select
                id="contact-person"
                name="person"
                value={person}
                onChange={(event) => setPerson(event.target.value)}
              >
                <option value="">Đội ngũ ZUKATEK</option>
                {data.members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="contact-product">Sản phẩm bạn quan tâm</label>
              <select
                id="contact-product"
                name="product"
                defaultValue={
                  products.some((item) => item.id === selectedId)
                    ? selectedId
                    : ""
                }
              >
                <option value="">Tôi cần tư vấn lựa chọn</option>
                {products.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                    {item.example ? " · Minh họa" : ""}
                  </option>
                ))}
              </select>
            </div>
            <fieldset className="audience-field">
              <legend>Bạn mua sản phẩm cho</legend>
              <div className="audience-options">
                {["Cá nhân", "Nhóm", "Doanh nghiệp"].map((value) => (
                  <label key={value}>
                    <input
                      type="radio"
                      name="audience"
                      value={value}
                      checked={audience === value}
                      onChange={() => onAudience(value)}
                    />
                    <span>{value}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="field">
              <label htmlFor="contact-message">
                Bạn cần tư vấn điều gì? <span>*</span>
              </label>
              <textarea
                id="contact-message"
                name="message"
                rows={4}
                maxLength={3000}
                placeholder="Tên sản phẩm, tính năng cần dùng, số người sử dụng hoặc câu hỏi về giá…"
                required
                onInput={(event) => event.currentTarget.setCustomValidity("")}
              />
            </div>
            <button className="button form-submit" type="submit">
              <span id="submit-label">Chuẩn bị lời nhắn</span>
              <Icon name="arrow" />
            </button>
            <p className="form-note" id="form-note">
              {target.email
                ? "Xem lại lời nhắn rồi gửi qua ứng dụng email. Biểu mẫu không tự gửi."
                : "Lời nhắn được tạo trên thiết bị để bạn sao chép hoặc tải về; chưa được gửi đến ZUKATEK."}
            </p>
          </form>
        </div>
      </section>
      {brief && (
        <Modal
          id="brief-dialog"
          titleId="brief-title"
          eyebrow="TƯ VẤN SẢN PHẨM ZUKATEK"
          onClose={() => setBrief("")}
        >
          <h2 id="brief-title" tabIndex={-1}>
            Lời nhắn của bạn đã sẵn sàng
          </h2>
          <p id="brief-description">
            {target.email
              ? "Xem lại nội dung, sau đó chọn gửi qua email. Ứng dụng email sẽ mở để bạn hoàn tất việc gửi."
              : "Bạn có thể sao chép hoặc tải về. Lời nhắn chưa được gửi đến ZUKATEK."}
          </p>
          <pre id="brief-text" tabIndex={0}>
            {brief}
          </pre>
          <div className="brief-actions">
            <button
              className="button"
              id="copy-brief"
              type="button"
              onClick={copy}
            >
              <Icon name="copy" />
              Sao chép
            </button>
            <button
              className="button button-soft"
              id="download-brief"
              type="button"
              onClick={download}
            >
              Tải lời nhắn
            </button>
            {target.email && (
              <a
                className="button"
                id="email-brief"
                href={`mailto:${target.email}?subject=${encodeURIComponent("Tư vấn mua sản phẩm ZUKATEK")}&body=${encodeURIComponent(brief)}`}
              >
                Gửi qua email
              </a>
            )}
          </div>
          <p className="copy-status" role="status" aria-live="polite">
            {copyStatus}
          </p>
        </Modal>
      )}
    </>
  );
}
