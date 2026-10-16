package endpoints

import (
	"context"
	"errors"
	"log/slog"

	"github.com/velt/backend/internal/modules/ai/provider"
)

// ErrNoEndpoint means the purpose has nothing it can run right now: no chain,
// every endpoint disabled, or every link cooling off after a 429. Callers
// treat it the way they treat an unconfigured assistant — fall back to the
// scripted answer, do not surface a failure.
var ErrNoEndpoint = errors.New("ai: no endpoint available")

// Client builds a client for one resolved link. Swappable so a test can run
// the chain without a network.
type Client func(provider.Config) provider.Client

// Stream runs one turn against a purpose's chain.
//
// It walks the chain in priority order, and moves to the next link ONLY when
// the current one was rate-limited and has not yet written anything to the
// caller. Both halves of that sentence matter:
//
//   - Rate-limited only. A bad key, a malformed request or a model that does
//     not exist are not conditions another model fixes; retrying them down the
//     chain multiplies one mistake by the number of endpoints configured.
//   - Nothing written yet. The chatbot streams to a visitor as the words
//     arrive. Once even one fragment has been sent, switching models would
//     splice two different voices mid-sentence, so after the first delta a
//     failure is a failure.
func Stream(
	ctx context.Context,
	svc *Service,
	newClient Client,
	log *slog.Logger,
	purpose string,
	req provider.StreamRequest,
) (string, provider.Usage, error) {
	links, err := svc.Available(ctx, purpose)
	if err != nil {
		return "", provider.Usage{}, err
	}
	if len(links) == 0 {
		return "", provider.Usage{}, ErrNoEndpoint
	}

	var lastErr error
	for _, link := range links {
		cl := newClient(provider.Config{
			Kind: link.Kind, BaseURL: link.BaseURL, APIKey: link.APIKey, Model: link.Model,
		})
		if !cl.Ready() {
			continue
		}

		// Guards the handover: set the moment the endpoint produces output.
		spoken := false
		attempt := req
		if req.OnDelta != nil {
			attempt.OnDelta = func(text string) error {
				if text != "" {
					spoken = true
				}
				return req.OnDelta(text)
			}
		}

		text, usage, err := cl.Stream(ctx, attempt)
		if err == nil {
			return text, usage, nil
		}
		lastErr = err

		var apiErr *provider.APIError
		switch {
		case ctx.Err() != nil:
			// The visitor left or the turn was cut short; nothing to retry.
			return text, usage, err
		case spoken:
			// Already mid-answer. See the contract above.
			return text, usage, err
		case errors.As(err, &apiErr) && apiErr.RateLimited():
			svc.CoolDown(link, apiErr.RetryAfter)
			if log != nil {
				log.Info("ai: endpoint rate-limited, trying the next link",
					"purpose", purpose, "provider", link.ProviderLabel,
					"model", link.Model, "retry_after", apiErr.RetryAfter)
			}
			continue
		default:
			return text, usage, err
		}
	}
	// Every link was rate-limited (or none could be built).
	if lastErr != nil {
		return "", provider.Usage{}, lastErr
	}
	return "", provider.Usage{}, ErrNoEndpoint
}
