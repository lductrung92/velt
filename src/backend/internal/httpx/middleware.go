package httpx

import (
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"runtime/debug"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/velt/backend/internal/apperr"
)

// AccessTokenParser verifies an access token and returns the caller identity.
// Implemented by platform/token.Manager; declared here to avoid an import
// cycle (httpx must not import the auth/token internals directly).
type AccessTokenParser interface {
	ParseAccess(token string) (userID uuid.UUID, roles, permissions []string, err error)
}

// statusWriter records the response status for logging.
type statusWriter struct {
	http.ResponseWriter
	status int
}

func (w *statusWriter) WriteHeader(code int) {
	w.status = code
	w.ResponseWriter.WriteHeader(code)
}

func (w *statusWriter) Write(b []byte) (int, error) {
	if w.status == 0 {
		w.status = http.StatusOK
	}
	return w.ResponseWriter.Write(b)
}

const correlationHeader = "X-Correlation-ID"

// CorrelationID assigns/propagates a correlation id for every request and
// echoes it back in the response header.
func CorrelationID(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		cid := r.Header.Get(correlationHeader)
		if cid == "" {
			cid = uuid.NewString()
		}
		w.Header().Set(correlationHeader, cid)
		next.ServeHTTP(w, r.WithContext(WithCorrelationID(r.Context(), cid)))
	})
}

// RequestLogger emits one structured log line per request. 5xx → ERROR,
// 4xx → WARN, otherwise INFO. Never logs bodies, headers, or tokens.
func RequestLogger(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		sw := &statusWriter{ResponseWriter: w}
		next.ServeHTTP(sw, r)
		if sw.status == 0 {
			sw.status = http.StatusOK
		}
		lg := logFromContext(r).With(
			"method", r.Method,
			"path", r.URL.Path,
			"status", sw.status,
			"duration_ms", time.Since(start).Milliseconds(),
		)
		switch {
		case sw.status >= 500:
			lg.Error("request")
		case sw.status >= 400:
			lg.Warn("request")
		default:
			lg.Info("request")
		}
	})
}

// SecurityHeaders sets baseline hardening headers on every response: nosniff
// (block MIME sniffing), a deny frame policy (the API is never meant to be
// framed), and a strict referrer policy. When hsts is true (TLS/prod) it also
// sends Strict-Transport-Security. Applied globally so JSON + error responses
// are hardened, not just static files.
func SecurityHeaders(hsts bool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			h := w.Header()
			h.Set("X-Content-Type-Options", "nosniff")
			h.Set("X-Frame-Options", "DENY")
			h.Set("Referrer-Policy", "no-referrer")
			if hsts {
				h.Set("Strict-Transport-Security", "max-age=63072000; includeSubDomains")
			}
			next.ServeHTTP(w, r)
		})
	}
}

// Recoverer turns any panic into a logged 500 (with stack) without leaking
// the cause to the client.
func Recoverer(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if rec := recover(); rec != nil {
				logFromContext(r).Error("panic recovered",
					"panic", rec, "stack", string(debug.Stack()))
				WriteError(w, apperr.Internal())
			}
		}()
		next.ServeHTTP(w, r)
	})
}

// Authenticator requires a valid Bearer access token. It stores the verified
// Identity in the request context. Apply it only to protected sub-routers;
// public endpoints (login/refresh/...) must not use it.
func Authenticator(parser AccessTokenParser) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			raw := bearerToken(r)
			if raw == "" {
				WriteError(w, apperr.Unauthorized("unauthorized"))
				return
			}
			uid, roles, perms, err := parser.ParseAccess(raw)
			if err != nil {
				WriteError(w, apperr.Unauthorized("unauthorized"))
				return
			}
			id := &Identity{UserID: uid, Roles: roles, Permissions: perms}
			next.ServeHTTP(w, r.WithContext(WithIdentity(r.Context(), id)))
		})
	}
}

// CustomerAccessParser verifies a customer access token (aud=velt-customer)
// and returns the customer id. Implemented by platform/token.CustomerManager;
// declared here to avoid an import cycle.
type CustomerAccessParser interface {
	ParseCustomerAccess(token string) (customerID uuid.UUID, err error)
}

// CustomerAuthenticator requires a valid customer Bearer access token and stores
// the verified CustomerIdentity in the request context. Apply it only to
// customer self-service sub-routers; public customer endpoints (register/login/
// ...) must not use it.
func CustomerAuthenticator(parser CustomerAccessParser) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			raw := bearerToken(r)
			if raw == "" {
				WriteError(w, apperr.Unauthorized("unauthorized"))
				return
			}
			cid, err := parser.ParseCustomerAccess(raw)
			if err != nil {
				WriteError(w, apperr.Unauthorized("unauthorized"))
				return
			}
			id := &CustomerIdentity{CustomerID: cid}
			next.ServeHTTP(w, r.WithContext(WithCustomerIdentity(r.Context(), id)))
		})
	}
}

func bearerToken(r *http.Request) string {
	h := r.Header.Get("Authorization")
	const prefix = "Bearer "
	if len(h) > len(prefix) && strings.EqualFold(h[:len(prefix)], prefix) {
		return strings.TrimSpace(h[len(prefix):])
	}
	return ""
}

// NewLogger builds the structured JSON slog logger for the given level. When
// logFile is non-empty, logs are written to BOTH stdout and that file
// (parent dirs created, append mode); a file-open failure degrades to
// stdout-only with a stderr notice (never blocks startup).
func NewLogger(level, logFile string) *slog.Logger {
	var lvl slog.Level
	switch strings.ToLower(level) {
	case "debug":
		lvl = slog.LevelDebug
	case "warn":
		lvl = slog.LevelWarn
	case "error":
		lvl = slog.LevelError
	default:
		lvl = slog.LevelInfo
	}
	var w io.Writer = os.Stdout
	if logFile != "" {
		if f, err := openLogFile(logFile); err == nil {
			w = io.MultiWriter(os.Stdout, f)
		} else {
			fmt.Fprintf(os.Stderr, "log file %q unavailable, using stdout only: %v\n", logFile, err)
		}
	}
	return slog.New(slog.NewJSONHandler(w, &slog.HandlerOptions{Level: lvl}))
}

func openLogFile(path string) (*os.File, error) {
	if dir := filepath.Dir(path); dir != "" && dir != "." {
		if err := os.MkdirAll(dir, 0o750); err != nil {
			return nil, err
		}
	}
	return os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o640)
}
