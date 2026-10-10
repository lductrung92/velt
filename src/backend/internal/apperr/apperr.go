// Package apperr defines the single domain error type used across the
// backend. The service layer returns *AppError; a single HTTP middleware
// (internal/httpx) maps it to the wire error envelope. No handler ever
// builds the envelope by hand. See docs/ai/error-contract.md.
package apperr

import (
	"errors"
	"net/http"
)

// AppError carries everything needed to render the error envelope:
// the HTTP status (== error.code), a snake_case translation key
// (== error.message), and optional machine-readable details.
type AppError struct {
	Status  int            // HTTP status code, equals error.code
	Key     string         // snake_case translation key, equals error.message
	Details map[string]any // equals error.details; nil renders as {}
}

// Error implements the error interface; it returns the translation key so
// logs stay key-based (never human prose).
func (e *AppError) Error() string { return e.Key }

// As extracts an *AppError from an error chain, if present.
func As(err error) (*AppError, bool) {
	var ae *AppError
	if errors.As(err, &ae) {
		return ae, true
	}
	return nil, false
}

// New builds an AppError with an explicit status and key.
func New(status int, key string) *AppError { return &AppError{Status: status, Key: key} }

// --- Constructors for the statuses defined in the error contract ---

// BadRequest → 400: malformed/unparseable request (transport-level).
func BadRequest(key string) *AppError { return &AppError{http.StatusBadRequest, key, nil} }

// Unauthorized → 401: missing/invalid authentication, or a credential failure.
func Unauthorized(key string) *AppError { return &AppError{http.StatusUnauthorized, key, nil} }

// AccessDenied → 403: authenticated but not permitted.
func AccessDenied(key string) *AppError { return &AppError{http.StatusForbidden, key, nil} }

// NotFound → 404: resource missing, or hidden for privacy.
func NotFound(key string) *AppError { return &AppError{http.StatusNotFound, key, nil} }

// Conflict → 409: valid request conflicting with current state.
func Conflict(key string) *AppError { return &AppError{http.StatusConflict, key, nil} }

// Unprocessable → 422 with a specific (non-field) key, e.g. invalid_or_expired_token.
func Unprocessable(key string) *AppError {
	return &AppError{http.StatusUnprocessableEntity, key, nil}
}

// PayloadTooLarge → 413: request body / upload exceeds an allowed limit (size or quota).
func PayloadTooLarge(key string) *AppError {
	return &AppError{http.StatusRequestEntityTooLarge, key, nil}
}

// Validation → 422 validation_error with per-field translation keys.
func Validation(fields map[string]string) *AppError {
	f := make(map[string]any, len(fields))
	for k, v := range fields {
		f[k] = v
	}
	return &AppError{http.StatusUnprocessableEntity, "validation_error", map[string]any{"fields": f}}
}

// RateLimited → 429: too many requests. RetryAfter (seconds) is surfaced via details.
func RateLimited(retryAfterSeconds int) *AppError {
	return &AppError{http.StatusTooManyRequests, "rate_limited", map[string]any{"retry_after": retryAfterSeconds}}
}

// Internal → 500: unhandled server fault; the cause is never leaked.
func Internal() *AppError {
	return &AppError{http.StatusInternalServerError, "internal_server_error", nil}
}

// BadGateway → 502: an upstream dependency failed. reason is a translation key.
func BadGateway(key, reason string) *AppError {
	return &AppError{http.StatusBadGateway, key, map[string]any{"reason": reason}}
}
