import { useId, useState } from "react";
import { useSite } from "../context";
import { subscribeNewsletter } from "../lib/chatApi";
import { Icon } from "./Icon";

type State = "idle" | "sending" | "done" | "error";

/**
 * The footer's newsletter opt-in.
 *
 * It renders as a form so a visitor with no JavaScript still sees what the
 * block is for; the submit is intercepted because the API answers JSON. The
 * server treats an address already on the list the same as a new one, so the
 * message here never says which it was.
 */
export function Newsletter() {
  const { t } = useSite();
  const emailId = useId();
  const errorId = useId();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<State>("idle");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (state === "sending") return;
    setState("sending");
    try {
      await subscribeNewsletter(email.trim());
      setState("done");
      setEmail("");
    } catch {
      setState("error");
    }
  }

  return (
    <section className="footer-newsletter" aria-labelledby={`${emailId}-title`}>
      <div className="newsletter-copy">
        <span className="newsletter-emblem" aria-hidden="true">
          <Icon name="mail" />
        </span>
        <div>
          <h3 id={`${emailId}-title`}>{t("layout.newsletter.title")}</h3>
          <p>{t("layout.newsletter.text")}</p>
        </div>
      </div>
      <div className="newsletter-action">
        {state === "done" ? (
          <p className="newsletter-done" role="status" aria-live="polite">
            <span className="newsletter-success-icon" aria-hidden="true">
              <Icon name="check" />
            </span>
            {t("layout.newsletter.done")}
          </p>
        ) : (
          <form
            className="newsletter-form"
            onSubmit={submit}
            aria-busy={state === "sending"}
          >
            <label className="sr-only" htmlFor={emailId}>
              {t("layout.newsletter.placeholder")}
            </label>
            <div className="newsletter-input-group">
              <span className="newsletter-input-icon" aria-hidden="true">
                <Icon name="mail" />
              </span>
              <input
                id={emailId}
                type="email"
                aria-describedby={state === "error" ? errorId : undefined}
                name="email"
                required
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                disabled={state === "sending"}
                placeholder={t("layout.newsletter.placeholder")}
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  if (state === "error") setState("idle");
                }}
              />
              <button
                className="newsletter-submit"
                type="submit"
                disabled={state === "sending" || email.trim() === ""}
              >
                {state === "sending"
                  ? t("layout.newsletter.sending")
                  : t("layout.newsletter.submit")}
                <span aria-hidden="true">
                  <Icon name="arrow" />
                </span>
              </button>
            </div>
            {state === "error" && (
              <p className="newsletter-error" id={errorId} role="alert">
                {t("layout.newsletter.error")}
              </p>
            )}
          </form>
        )}
      </div>
    </section>
  );
}
