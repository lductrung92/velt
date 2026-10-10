// One error type for the whole app — mirrors docs/ai/error-contract.md.
// The API client normalizes every failure into ApiError; UI never sees a raw
// axios error. `message` is a snake_case translation key (not human prose);
// `details.fields` carries per-field validation keys on 422.
export interface ApiErrorBody {
  code: number;
  message: string;
  details: Record<string, unknown>;
}

export class ApiError extends Error {
  readonly code: number;
  readonly details: Record<string, unknown>;

  constructor(
    code: number,
    message: string,
    details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.details = details;
  }

  /** Per-field validation keys from a 422 (`details.fields`), or {}. */
  get fields(): Record<string, string> {
    const f = this.details?.["fields"];
    return f && typeof f === "object" ? (f as Record<string, string>) : {};
  }

  isUnauthorized(): boolean {
    return this.code === 401;
  }
  isValidation(): boolean {
    return this.code === 422;
  }
}
