// Package revalidate notifies the public web to drop its ISR cache for given
// tags right after a publish, so changes go live immediately instead of waiting
// out the revalidate window.
package revalidate

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"
	"time"
)

// Revalidator drops the web's cached entries for the given tags. Implementations
// MUST be best-effort and non-blocking: a failure never affects the publish.
type Revalidator interface {
	Revalidate(ctx context.Context, tags ...string)
}

// Nop is the disabled revalidator (no web configured / tests).
type Nop struct{}

func (Nop) Revalidate(context.Context, ...string) {}

// HTTP posts tags to the web's POST /api/revalidate route (shared secret).
type HTTP struct {
	url    string
	secret string
	client *http.Client
	log    *slog.Logger
}

// NewHTTP builds an HTTP revalidator targeting webBaseURL + /api/revalidate.
// Returns a Nop when webBaseURL or secret is empty (feature disabled).
func NewHTTP(webBaseURL, secret string, log *slog.Logger) Revalidator {
	if strings.TrimSpace(webBaseURL) == "" || strings.TrimSpace(secret) == "" {
		return Nop{}
	}
	if log == nil {
		log = slog.Default()
	}
	return &HTTP{
		url:    strings.TrimRight(webBaseURL, "/") + "/api/revalidate",
		secret: secret,
		client: &http.Client{Timeout: 5 * time.Second},
		log:    log,
	}
}

// Revalidate fires the request in the background (detached from the request
// context) and swallows errors — the publish already succeeded.
func (h *HTTP) Revalidate(_ context.Context, tags ...string) {
	if len(tags) == 0 {
		return
	}
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		body, _ := json.Marshal(map[string][]string{"tags": tags})
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, h.url, bytes.NewReader(body))
		if err != nil {
			h.log.Warn("revalidate: build request failed", "err", err)
			return
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Revalidate-Secret", h.secret)
		resp, err := h.client.Do(req)
		if err != nil {
			h.log.Warn("revalidate: request failed", "err", err, "tags", tags)
			return
		}
		defer func() { _ = resp.Body.Close() }()
		if resp.StatusCode >= 300 {
			h.log.Warn("revalidate: non-2xx", "status", resp.StatusCode, "tags", tags)
		}
	}()
}
