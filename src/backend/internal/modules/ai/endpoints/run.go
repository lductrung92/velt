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

	// Two links are siblings when they are the same endpoint and model, and
	// differ only in which key they carry. That distinction decides what a
	// rejected credential means: the NEXT KEY fixes a revoked key, while a
	// different model on a different endpoint does not, so an auth failure
	// may walk to a sibling and must stop at the edge of the group.
	sibling := func(i int) bool {
		return i+1 < len(links) &&
			links[i+1].ProviderID == links[i].ProviderID &&
			links[i+1].Model == links[i].Model
	}

	var lastErr error
	for i, link := range links {
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
					"model", link.Model, "key", link.KeyID,
					"retry_after", apiErr.RetryAfter)
			}
			continue
		case errors.As(err, &apiErr) && apiErr.CredentialRejected() && sibling(i):
			// Only to a sibling key, and deliberately NOT cooled down: a
			// rejected credential does not come back on its own, and parking
			// it would hide a key the operator has to go and replace. It is
			// logged at warn for the same reason — this is a repair job, not
			// a hiccup.
			if log != nil {
				log.Warn("ai: key rejected, trying the next key for this endpoint",
					"purpose", purpose, "provider", link.ProviderLabel,
					"model", link.Model, "key", link.KeyID, "status", apiErr.Status)
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
