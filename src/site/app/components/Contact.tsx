import { Fragment, useState } from "react";
import type { FormEvent } from "react";
import { useSite } from "../context";
import type { MessageKey } from "../lib/i18n";
import { contactFor, safeExternalUrl } from "../lib/links";
import { contactConfig } from "../lib/sections";
import { Lines } from "./Lines";
import { Icon } from "./Icon";
import { Modal } from "./Modal";

// The radio group carries a code, not a word: the value travels into the
// e-mail body and is compared across renders, so it must not change with the
// language. The words come from the catalogue table, which already names these
// three audiences.
const AUDIENCES: { code: string; label: MessageKey }[] = [
  { code: "individual", label: "catalog.audience.individual" },
  { code: "team", label: "catalog.audience.team" },
  { code: "business", label: "catalog.audience.business" },
];

export function Contact({
  audience,
  onAudience,
  config,
}: {
  audience: string;
  onAudience: (value: string) => void;
  config?: unknown;
}) {
  const { data, products, referrer, url, t } = useSite();
  const section = contactConfig(config, t);
  const [person, setPerson] = useState(referrer?.id || ""),
    [brief, setBrief] = useState(""),
    [copyStatus, setCopyStatus] = useState("");
  const target = contactFor(data, person);
  const email = section.email || target.email;
  const zalo = safeExternalUrl(section.zalo) || target.zalo;
  const selectedId = url.searchParams.get("product") || "";
  function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    for (const id of ["contact-name", "contact-message"]) {
      const field = form.querySelector<HTMLInputElement | HTMLTextAreaElement>(
        `#${id}`,
      )!;
      field.setCustomValidity(field.value.trim() ? "" : t("contact.required"));
    }
    if (!form.reportValidity()) return;
    const fields = new FormData(form),
      product = products.find((item) => item.id === fields.get("product"));
    const consultant = data.members.find((member) => member.id === person);
    const chosen = AUDIENCES.find((item) => item.code === audience);
    // One key per line, joined here: the blank lines are the layout, and a
    // translator keeps it by translating the lines rather than the message.
    setBrief(
      [
        t("contact.brief.greeting"),
        "",
        t("contact.brief.name", { name: String(fields.get("name")).trim() }),
        t("contact.brief.email", { email: String(fields.get("email")).trim() }),
        t("contact.brief.audience", {
          audience: chosen ? t(chosen.label) : audience,
        }),
        t("contact.brief.product", {
          product: product
            ? product.name +
              (product.example ? t("contact.brief.product_example") : "")
            : t("contact.brief.product_any"),
        }),
        t("contact.brief.consultant", {
          name: consultant?.name || t("contact.person_team"),
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
          <form className="contact-form" id="contact-form" onSubmit={prepare}>
            <h3>{t("contact.form_title")}</h3>
            <p className="form-intro" id="form-intro">
              {email || zalo
                ? t("contact.form_intro")
                : t("contact.form_intro_offline")}
            </p>
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
              <label htmlFor="contact-person">
                {t("contact.person_label")}
              </label>
              <select
                id="contact-person"
                name="person"
                value={person}
                onChange={(event) => setPerson(event.target.value)}
              >
                <option value="">{t("contact.person_team")}</option>
                {data.members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="contact-product">
                {t("contact.product_label")}
              </label>
              <select
                id="contact-product"
                name="product"
                defaultValue={
                  products.some((item) => item.id === selectedId)
                    ? selectedId
                    : ""
                }
              >
                <option value="">{t("contact.product_any")}</option>
                {products.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                    {item.example ? t("contact.product_example") : ""}
                  </option>
                ))}
              </select>
            </div>
            <fieldset className="audience-field">
              <legend>{t("contact.audience_legend")}</legend>
              <div className="audience-options">
                {AUDIENCES.map(({ code, label }) => (
                  <label key={code}>
                    <input
                      type="radio"
                      name="audience"
                      value={code}
                      checked={audience === code}
                      onChange={() => onAudience(code)}
                    />
                    <span>{t(label)}</span>
                  </label>
                ))}
              </div>
            </fieldset>
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
            <button className="button form-submit" type="submit">
              <span id="submit-label">{t("contact.submit")}</span>
              <Icon name="arrow" />
            </button>
            <p className="form-note" id="form-note">
              {section.note ||
                (email ? t("contact.note_email") : t("contact.note_offline"))}
            </p>
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
