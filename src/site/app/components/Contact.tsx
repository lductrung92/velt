import { useSite } from "../context";
import { contactFor, safeExternalUrl } from "../lib/links";
import { contactConfig } from "../lib/sections";
import { ContactForm } from "./ContactForm";
import { Lines } from "./Lines";
import { Icon } from "./Icon";

export function Contact({ config }: { config?: unknown }) {
  const { data, referrer, url, t, layout } = useSite();
  const section = contactConfig(config, t);
  const target = contactFor(data, referrer?.id);
  // Three sources, narrowest first: what this section was configured with, the
  // member the visitor is talking to, and the company's own address. Before the
  // last one existed this block could only say the channel was coming soon.
  const email = section.email || target.email || layout.chrome.contactEmail;
  const zalo =
    safeExternalUrl(section.zalo) || target.zalo || layout.chrome.contactZalo;
  const selectedId = url.searchParams.get("product") || "";
  return (
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
        <ContactForm email={email} note={section.note} productId={selectedId} />
      </div>
    </section>
  );
}
