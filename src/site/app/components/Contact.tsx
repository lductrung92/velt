import { useState } from "react";
import type { FormEvent } from "react";
import { useSite } from "../context";
import { contactFor, safeExternalUrl } from "../lib/links";
import { recaptchaToken } from "../lib/recaptcha";
import { submitLead } from "../lib/chatApi";
import { contactConfig } from "../lib/sections";
import { Lines } from "./Lines";
import { Icon } from "./Icon";
import { Modal } from "./Modal";
import { Select } from "./Select";

export function Contact({ config }: { config?: unknown }) {
  const { data, products, referrer, url, t, layout } = useSite();
  const section = contactConfig(config, t);
  const [brief, setBrief] = useState(""),
    [copyStatus, setCopyStatus] = useState(""),
    [sending, setSending] = useState(false),
    [sent, setSent] = useState(false),
    [sendError, setSendError] = useState("");
  const siteKey = layout.head.recaptchaSiteKey;
  const target = contactFor(data, referrer?.id);
  // Three sources, narrowest first: what this section was configured with, the
  // member the visitor is talking to, and the company's own address. Before the
  // last one existed this block could only say the channel was coming soon.
  const email = section.email || target.email || layout.chrome.contactEmail;
  const zalo =
    safeExternalUrl(section.zalo) || target.zalo || layout.chrome.contactZalo;
  const selectedId = url.searchParams.get("product") || "";
  const [product, setProduct] = useState(
    products.some((item) => item.id === selectedId) ? selectedId : "",
  );
  /**
   * Sends the request, and falls back to the old copy-or-download brief when
   * it cannot. The fallback is the point: a visitor who typed three paragraphs
   * should never lose them to a network fault, and before there was an
   * endpoint this brief was the whole feature.
   */
  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!validate(form)) return;
    const fields = new FormData(form);
    setSending(true);
    setSendError("");
    try {
      const token = siteKey ? await recaptchaToken(siteKey) : "";
      await submitLead({
        name: String(fields.get("name")).trim(),
        email: String(fields.get("email")).trim(),
        message: String(fields.get("message")).trim(),
        product_id: product || undefined,
        ref: referrer?.id || undefined,
        recaptcha_token: token || undefined,
      });
      setSent(true);
      form.reset();
      setProduct("");
    } catch {
      // One message for every failure. Telling a visitor which guard refused
      // them is telling a bot which one to work around, and none of the
      // distinctions are actionable for a person anyway.
      setSendError(t("contact.send_failed"));
      buildBrief(form);
    } finally {
      setSending(false);
    }
  }

  function validate(form: HTMLFormElement) {
    for (const id of ["contact-name", "contact-message"]) {
      const field = form.querySelector<HTMLInputElement | HTMLTextAreaElement>(
        `#${id}`,
      )!;
      field.setCustomValidity(field.value.trim() ? "" : t("contact.required"));
    }
    return form.reportValidity();
  }

  function buildBrief(form: HTMLFormElement) {
    const fields = new FormData(form),
      product = products.find((item) => item.id === fields.get("product"));
    // One key per line, joined here: the blank lines are the layout, and a
    // translator keeps it by translating the lines rather than the message.
    setBrief(
      [
        t("contact.brief.greeting"),
        "",
        t("contact.brief.name", { name: String(fields.get("name")).trim() }),
        t("contact.brief.email", { email: String(fields.get("email")).trim() }),
        t("contact.brief.product", {
          product: product
            ? product.name +
              (product.example ? t("contact.brief.product_example") : "")
            : t("contact.brief.product_any"),
        }),
        ...(referrer
          ? [t("contact.brief.referrer", { name: referrer.name })]
          : []),
        "",
        t("contact.brief.question"),
        String(fields.get("message")).trim(),
        "",
        t("contact.brief.closing"),
      ].join("\n"),
    );
    setCopyStatus("");
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(brief);
      setCopyStatus(t("contact.copied"));
    } catch {
      setCopyStatus(t("contact.copy_manual"));
    }
  }
  function download() {
    const link = URL.createObjectURL(
      new Blob(["﻿" + brief], { type: "text/plain;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = link;
    anchor.download = "loi-nhan-zukatek.txt";
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(link), 1000);
    setCopyStatus(t("contact.downloaded"));
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
            <span className="eyebrow">{t("contact.eyebrow")}</span>
            <h2 id="contact-title">
              <Lines text={section.title} />
            </h2>
            <p>
              <Lines text={section.subtitle} />
            </p>
            <div className="contact-channel" id="contact-channel">
              <span className="contact-mail-icon">
                <Icon name="mail" />
              </span>
              <div>
                <strong>
                  {target.personal
                    ? t("contact.channel_member", {
                        name: target.member?.name || "",
                      })
                    : t("contact.channel_team")}
                </strong>
                {email && <a href={`mailto:${email}`}>{email}</a>}
                {zalo && (
                  <a href={zalo} target="_blank" rel="noopener noreferrer">
                    {t("contact.zalo")}
                  </a>
                )}
                {!email && !zalo && <span>{t("contact.channel_pending")}</span>}
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
          <form
            className="contact-form"
            id="contact-form"
            aria-labelledby="contact-form-title"
            aria-describedby="form-intro form-note"
            onSubmit={(event) => void send(event)}
          >
            <header className="contact-form-heading">
              <span className="contact-form-icon" aria-hidden="true">
                <Icon name="support" />
              </span>
              <div>
                <h3 id="contact-form-title">{t("contact.form_title")}</h3>
                <p className="form-intro" id="form-intro">
                  {t("contact.form_intro")}
                </p>
              </div>
            </header>
            <div className="form-row">
              <div className="field">
                <label htmlFor="contact-name">
                  {t("contact.name_label")}
                  <span>*</span>
                </label>
                <input
                  id="contact-name"
                  name="name"
                  autoComplete="name"
                  placeholder={t("contact.name_placeholder")}
                  maxLength={100}
                  required
                  onInput={(event) => event.currentTarget.setCustomValidity("")}
                />
              </div>
              <div className="field">
                <label htmlFor="contact-email">
                  {t("contact.email_label")}
                  <span>*</span>
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
              <label htmlFor="contact-product">
                {t("contact.product_label")}
              </label>
              <Select
                id="contact-product"
                name="product"
                value={product}
                onChange={setProduct}
                options={[
                  { value: "", label: t("contact.product_any") },
                  ...products.map((item) => ({
                    value: item.id,
                    label:
                      item.name +
                      (item.example ? t("contact.product_example") : ""),
                  })),
                ]}
              />
            </div>
            <div className="field">
              <label htmlFor="contact-message">
                {t("contact.message_label")}
                <span>*</span>
              </label>
              <textarea
                id="contact-message"
                name="message"
                rows={4}
                maxLength={3000}
                placeholder={t("contact.message_placeholder")}
                required
                onInput={(event) => event.currentTarget.setCustomValidity("")}
              />
            </div>
            <div className="contact-form-footer">
              <button
                className="button form-submit"
                type="submit"
                disabled={sending}
              >
                <span id="submit-label">
                  {sending ? t("contact.sending") : t("contact.submit")}
                </span>
                <Icon name="send" />
              </button>
              {/* aria-live so a screen reader hears the outcome: the only
                  change on screen is this line, and a visitor who cannot see
                  it has no other way to know the request went. */}
              <p
                className={`form-note${sent ? " form-note-sent" : ""}`}
                id="form-note"
                role="status"
                aria-live="polite"
              >
                {sent
                  ? t("contact.sent")
                  : sendError || section.note || t("contact.note_send")}
              </p>
              {/* Google's terms allow hiding the badge only if this notice is
                  shown instead. It is hidden here because the floating badge
                  lands exactly where the chat bubble already is. */}
              {siteKey && (
                <p className="form-note recaptcha-note">
                  {t("contact.recaptcha_notice")}{" "}
                  <a
                    href="https://policies.google.com/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {t("contact.recaptcha_privacy")}
                  </a>
                  {" · "}
                  <a
                    href="https://policies.google.com/terms"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {t("contact.recaptcha_terms")}
                  </a>
                </p>
              )}
            </div>
          </form>
        </div>
      </section>
      {brief && (
        <Modal
          id="brief-dialog"
          titleId="brief-title"
          eyebrow={t("contact.brief_eyebrow")}
          onClose={() => setBrief("")}
        >
          <h2 id="brief-title" tabIndex={-1}>
            {t("contact.brief_title")}
          </h2>
          <p id="brief-description">
            {email
              ? t("contact.brief_intro_email")
              : t("contact.brief_intro_offline")}
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
              {t("contact.copy")}
            </button>
            <button
              className="button button-soft"
              id="download-brief"
              type="button"
              onClick={download}
            >
              {t("contact.download")}
            </button>
            {email && (
              <a
                className="button"
                id="email-brief"
                href={`mailto:${email}?subject=${encodeURIComponent(t("contact.mail_subject"))}&body=${encodeURIComponent(brief)}`}
              >
                {t("contact.send_mail")}
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
