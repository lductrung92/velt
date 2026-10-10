package newsletter

import (
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/velt/backend/internal/apperr"
	"github.com/velt/backend/internal/httpx"
	"github.com/velt/backend/internal/modules/cms/shared"
	"github.com/velt/backend/internal/platform/ratelimit"
)

// Public opt-in rate limits (abuse guard for an unauthenticated write). Keyed by
// IP (coarse — one bucket per caller; behind a BFF this bounds total throughput)
// and by email (per-address, meaningful even when many users share a proxy IP).
const (
	subscribeIPRateLimit    = 20
	subscribeEmailRateLimit = 5
	subscribeRateWindow     = time.Minute
)

// PublicHandler is the HTTP layer for the public newsletter opt-in (no auth).
type PublicHandler struct {
	svc        *Service
	limiter    ratelimit.Limiter
	trustProxy bool
}

// Subscribe handles POST /api/public/cms/newsletter/subscribe.
func (h *PublicHandler) Subscribe(w http.ResponseWriter, r *http.Request) {
	ip := httpx.ClientIP(r, h.trustProxy)
	if h.limiter != nil {
		if allowed, _, _ := h.limiter.Allow(
			r.Context(), "newsletter:subscribe:ip:"+ip, subscribeIPRateLimit, subscribeRateWindow); !allowed {
			httpx.WriteError(w, apperr.New(http.StatusTooManyRequests, "rate_limited"))
			return
		}
	}
	var req SubscribeRequest
	if err := httpx.DecodeAndValidate(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	// Per-email cap: meaningful even when callers share one IP (behind a BFF).
	if h.limiter != nil {
		key := "newsletter:subscribe:email:" + strings.ToLower(strings.TrimSpace(req.Email))
		if allowed, _, _ := h.limiter.Allow(r.Context(), key, subscribeEmailRateLimit, subscribeRateWindow); !allowed {
			httpx.WriteError(w, apperr.New(http.StatusTooManyRequests, "rate_limited"))
			return
		}
	}
	if err := h.svc.Subscribe(r.Context(), req, ip); err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusAccepted, map[string]string{"status": "ok"})
}

// RegisterPublic mounts the public newsletter opt-in (IP rate-limited).
func RegisterPublic(r chi.Router, base *shared.Base, pool *pgxpool.Pool, limiter ratelimit.Limiter, trustProxy bool) {
	h := &PublicHandler{svc: NewService(base, NewRepository(pool)), limiter: limiter, trustProxy: trustProxy}
	r.Post("/newsletter/subscribe", h.Subscribe)
}
