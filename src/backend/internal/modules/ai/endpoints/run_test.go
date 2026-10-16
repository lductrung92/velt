package endpoints

import (
	"context"
	"net/http"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/velt/backend/internal/modules/ai/provider"
)

// fakeClient is one scripted endpoint: what it emits, then how it ends.
type fakeClient struct {
	model  string
	deltas []string
	err    error
	calls  *[]string
}

func (c *fakeClient) Ready() bool  { return true }
func (c *fakeClient) Kind() string { return "openai" }
func (c *fakeClient) Model() string {
	return c.model
}
func (c *fakeClient) Models(context.Context) ([]string, error) { return nil, nil }
func (c *fakeClient) Stream(_ context.Context, req provider.StreamRequest) (string, provider.Usage, error) {
	*c.calls = append(*c.calls, c.model)
	out := ""
	for _, d := range c.deltas {
		if req.OnDelta != nil {
			if err := req.OnDelta(d); err != nil {
				return out, provider.Usage{}, err
			}
		}
		out += d
	}
	if c.err != nil {
		return out, provider.Usage{}, c.err
	}
	return out, provider.Usage{}, nil
}

// stubChain answers with a fixed set of links, so the walk can be tested
// without a database.
type stubChain struct{ links []Resolved }

func (s *stubChain) ResolveChain(context.Context, string) ([]Resolved, [][]byte, error) {
	return s.links, make([][]byte, len(s.links)), nil
}

func newTestService(links ...Resolved) (*Service, *stubChain) {
	c := &stubChain{links: links}
	return NewServiceWithChain(c), c
}

func link(label, model string) Resolved {
	return Resolved{ProviderID: uuid.New(), ProviderLabel: label, Kind: "openai", Model: model}
}

func rateLimited(after time.Duration) error {
	return &provider.APIError{Status: http.StatusTooManyRequests, RetryAfter: after}
}

// clients returns a Client that hands out the scripted endpoints in order of
// the model they are asked for.
func clients(calls *[]string, byModel map[string]*fakeClient) Client {
	return func(cfg provider.Config) provider.Client {
		c := byModel[cfg.Model]
		c.model = cfg.Model
		c.calls = calls
		return c
	}
}

func TestStream_FirstLinkAnswers(t *testing.T) {
	svc, _ := newTestService(link("Groq", "a"))
	calls := []string{}
	out, _, err := Stream(context.Background(), svc,
		clients(&calls, map[string]*fakeClient{"a": {deltas: []string{"xin chào"}}}),
		nil, "chat", provider.StreamRequest{})
	require.NoError(t, err)
	require.Equal(t, "xin chào", out)
	require.Equal(t, []string{"a"}, calls)
}

// A 429 before any output is exactly what the chain is for.
func TestStream_RateLimitedMovesToTheNextLink(t *testing.T) {
	svc, _ := newTestService(link("Groq", "a"), link("OpenRouter", "b"))
	calls := []string{}
	out, _, err := Stream(context.Background(), svc,
		clients(&calls, map[string]*fakeClient{
			"a": {err: rateLimited(30 * time.Second)},
			"b": {deltas: []string{"từ b"}},
		}), nil, "chat", provider.StreamRequest{})
	require.NoError(t, err)
	require.Equal(t, "từ b", out)
	require.Equal(t, []string{"a", "b"}, calls, "both links should have been tried, in order")
}

// THE rule: once the visitor has seen words, a later failure must not splice a
// second model into the same answer.
func TestStream_NeverSwitchesAfterTheFirstDelta(t *testing.T) {
	svc, _ := newTestService(link("Groq", "a"), link("OpenRouter", "b"))
	calls := []string{}
	seen := ""
	_, _, err := Stream(context.Background(), svc,
		clients(&calls, map[string]*fakeClient{
			"a": {deltas: []string{"nửa câu"}, err: rateLimited(0)},
			"b": {deltas: []string{"KHONG DUOC GOI"}},
		}), nil, "chat", provider.StreamRequest{
			OnDelta: func(s string) error { seen += s; return nil },
		})
	require.Error(t, err, "a mid-stream failure is a failure, not a retry")
	require.Equal(t, []string{"a"}, calls, "the second link must not run")
	require.Equal(t, "nửa câu", seen, "the visitor must not see two voices")
}

// Anything that is not a rate limit is the same mistake on every endpoint.
func TestStream_OtherErrorsDoNotWalkTheChain(t *testing.T) {
	svc, _ := newTestService(link("Groq", "a"), link("OpenRouter", "b"))
	calls := []string{}
	_, _, err := Stream(context.Background(), svc,
		clients(&calls, map[string]*fakeClient{
			"a": {err: &provider.APIError{Status: http.StatusUnauthorized}},
			"b": {deltas: []string{"khong toi luot"}},
		}), nil, "chat", provider.StreamRequest{})
	require.Error(t, err)
	require.Equal(t, []string{"a"}, calls)
}

// A rate-limited link is parked for as long as the endpoint asked, so the next
// request does not spend a turn rediscovering it.
func TestStream_ParksTheRateLimitedLink(t *testing.T) {
	first := link("Groq", "a")
	svc, _ := newTestService(first, link("OpenRouter", "b"))
	calls := []string{}
	_, _, err := Stream(context.Background(), svc,
		clients(&calls, map[string]*fakeClient{
			"a": {err: rateLimited(45 * time.Second)},
			"b": {deltas: []string{"ok"}},
		}), nil, "chat", provider.StreamRequest{})
	require.NoError(t, err)

	until := svc.CoolingUntil(first)
	require.False(t, until.IsZero(), "the 429'd link should be cooling")
	require.WithinDuration(t, time.Now().Add(45*time.Second), until, 2*time.Second)

	// The second call skips it entirely.
	calls = []string{}
	_, _, err = Stream(context.Background(), svc,
		clients(&calls, map[string]*fakeClient{
			"a": {err: rateLimited(45 * time.Second)},
			"b": {deltas: []string{"ok"}},
		}), nil, "chat", provider.StreamRequest{})
	require.NoError(t, err)
	require.Equal(t, []string{"b"}, calls, "a cooling link must not be tried again")
}

// Nothing runnable is not an error the visitor should see; it is the signal to
// fall back to the scripted bot.
func TestStream_EmptyChainSaysSo(t *testing.T) {
	svc, _ := newTestService()
	calls := []string{}
	_, _, err := Stream(context.Background(), svc,
		clients(&calls, map[string]*fakeClient{}), nil, "chat", provider.StreamRequest{})
	require.ErrorIs(t, err, ErrNoEndpoint)
	require.Empty(t, calls)
}

// A cooldown with no Retry-After still has to park the link, or a chain of one
// would hammer a provider that just said no.
func TestCoolDown_DefaultsWhenTheEndpointSaidNothing(t *testing.T) {
	svc, _ := newTestService()
	l := link("Groq", "a")
	svc.CoolDown(l, 0)
	require.True(t, svc.CoolingUntil(l).After(time.Now().Add(30*time.Second)))
}
