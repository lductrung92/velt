/**
 * Invisible reCAPTCHA v2, loaded only when the console has configured a key.
 *
 * "Invisible" means no checkbox: the widget is rendered into a hidden element
 * and asked for a token on submit. Google decides whether to show a challenge,
 * so most visitors see nothing at all.
 *
 * The token this produces proves nothing on its own — the API verifies it with
 * the secret key before accepting anything. A browser that skipped the token,
 * or forged one, is refused there, not here.
 */

type Grecaptcha = {
  render: (
    el: HTMLElement,
    opts: {
      sitekey: string;
      size: "invisible";
      callback: (token: string) => void;
      "error-callback": () => void;
      "expired-callback": () => void;
    },
  ) => number;
  execute: (id: number) => void;
  reset: (id: number) => void;
};

declare global {
  interface Window {
    grecaptcha?: { ready: (cb: () => void) => void } & Grecaptcha;
    __veltRecaptchaReady?: () => void;
  }
}

const SCRIPT_ID = "velt-recaptcha";
let loading: Promise<Grecaptcha> | null = null;

/** Loads api.js once per page, whatever calls it and however often. */
function load(): Promise<Grecaptcha> {
  if (loading) return loading;
  loading = new Promise<Grecaptcha>((resolve, reject) => {
    if (window.grecaptcha?.render) {
      resolve(window.grecaptcha);
      return;
    }
    // render=explicit keeps Google from hunting for widgets in the markup; the
    // onload name is global because that is the only hook api.js offers.
    window.__veltRecaptchaReady = () => {
      if (window.grecaptcha) resolve(window.grecaptcha);
      else reject(new Error("recaptcha loaded without an api"));
    };
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src =
      "https://www.google.com/recaptcha/api.js?render=explicit&onload=__veltRecaptchaReady";
    script.async = true;
    script.defer = true;
    script.onerror = () => reject(new Error("recaptcha script blocked"));
    document.head.appendChild(script);
  });
  return loading;
}

let widgetId: number | null = null;
let pending: ((token: string) => void) | null = null;
let failed: ((reason: Error) => void) | null = null;

/**
 * Asks for one token. Resolves with it, or rejects if the widget could not
 * load or the visitor failed the challenge.
 *
 * Callers must treat a rejection as "could not prove it", not as "is a bot":
 * an ad blocker, an offline moment or a corporate proxy all land here, and the
 * API is the thing that decides whether a submission is acceptable.
 */
export async function recaptchaToken(siteKey: string): Promise<string> {
  const api = await load();
  if (widgetId === null) {
    const host = document.createElement("div");
    host.style.display = "none";
    document.body.appendChild(host);
    widgetId = api.render(host, {
      sitekey: siteKey,
      size: "invisible",
      callback: (token) => pending?.(token),
      "error-callback": () => failed?.(new Error("recaptcha error")),
      "expired-callback": () => failed?.(new Error("recaptcha expired")),
    });
  }
  const id = widgetId;
  return new Promise<string>((resolve, reject) => {
    pending = (token) => {
      // Reset immediately: a token is single-use, and leaving the widget
      // "solved" makes the next submit resolve with a token Google has
      // already retired.
      api.reset(id);
      resolve(token);
    };
    failed = (reason) => {
      api.reset(id);
      reject(reason);
    };
    api.execute(id);
  });
}
