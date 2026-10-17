// Package provider talks to the LLM. It owns the wire format, the streaming
// decode and the tool-use loop; everything above it deals in messages and
// deltas, not in HTTP.
//
// Two implementations cover nearly everything: Anthropic's own API, and the
// OpenAI Chat Completions shape — which OpenAI, Ollama, LM Studio, vLLM, Groq,
// Together and DeepSeek all speak. A local model is therefore not a third
// adapter; it is the OpenAI one pointed at localhost.
package provider

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// Provider kinds.
const (
	KindAnthropic = "anthropic"
	KindOpenAI    = "openai"
)

// Roles on the wire. Both APIs agree on these two names.
const (
	RoleUser      = "user"
	RoleAssistant = "assistant"
)

// maxToolRounds bounds the tool-use loop. A model that keeps asking for tools
// without producing text is a bug or an attack, not a conversation.
const maxToolRounds = 6

// Message is one turn in the conversation handed to the model.
type Message struct {
	Role    string
	Content string
}

// ToolSpec is a tool as advertised to the model, in Anthropic's shape. The
// OpenAI adapter rewraps it — one internal shape, translated at the edge.
type ToolSpec struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	InputSchema map[string]any `json:"input_schema"`
}

// ToolInvoker runs a tool the model asked for. Returning an error is fine: the
// error text goes back to the model as a tool result so it can recover, which
// is better than failing the whole turn.
type ToolInvoker func(ctx context.Context, name string, input json.RawMessage) (any, error)

// Usage is what a turn cost.
//
// Not every provider reports it — many local servers return nothing. Callers
// that meter spend must treat a zero Usage as "unknown", not as "free".
type Usage struct {
	InputTokens  int
	OutputTokens int
	// Reported is false when the provider told us nothing.
	Reported bool
}

// StreamRequest is one assistant turn.
type StreamRequest struct {
	System    string
	Messages  []Message
	Tools     []ToolSpec
	MaxTokens int
	// OnDelta receives each text fragment as it arrives. Returning an error
	// stops the stream immediately — this is how the caller enforces "the
	// assistant falls silent the moment a human takes over".
	OnDelta func(text string) error
	// Invoke runs a tool the model requested.
	Invoke ToolInvoker
}

// Client is one configured LLM endpoint.
type Client interface {
	// Ready reports whether the client is configured enough to call.
	Ready() bool
	// Kind names the adapter, for diagnostics.
	Kind() string
	// Model is the configured model id.
	Model() string
	// Stream runs one assistant turn, tool round-trips included, and returns
	// the final text plus what it cost.
	Stream(ctx context.Context, req StreamRequest) (string, Usage, error)
	// Models lists what the endpoint offers, so an operator does not have to
	// type a model id from memory. Not every endpoint supports it.
	Models(ctx context.Context) ([]string, error)
}

// Config describes one endpoint.
type Config struct {
	Kind    string
	BaseURL string
	APIKey  string
	Model   string
}

// New builds the client for a configuration. An unknown kind falls back to
// Anthropic rather than returning an error: a typo in a setting should degrade
// to the documented default, not take the assistant down.
func New(cfg Config) Client {
	switch strings.TrimSpace(strings.ToLower(cfg.Kind)) {
	case KindOpenAI:
		return newOpenAI(cfg)
	default:
		return newAnthropic(cfg)
	}
}

// toolRound is one model request for a tool, normalised across adapters.
type toolRound struct {
	ID    string
	Name  string
	Input json.RawMessage
}

// ErrNotConfigured means the endpoint is missing something it needs to call.
var ErrNotConfigured = fmt.Errorf("ai provider: not configured")

// APIError is a non-200 from the provider.
type APIError struct {
	Status int
	Body   string
	// RetryAfter is what the endpoint said in its Retry-After header, zero
	// when it said nothing. Only a 429 carries one; a caller rotating between
	// endpoints parks this one for exactly that long instead of guessing.
	RetryAfter time.Duration
}

// RateLimited reports whether this is the endpoint saying "not now".
func (e *APIError) RateLimited() bool { return e != nil && e.Status == http.StatusTooManyRequests }

// CredentialRejected reports whether the endpoint refused the key itself — it
// was revoked, mistyped, or is out of credit. Distinct from RateLimited
// because only one of the two is worth waiting out: a rate limit lifts on its
// own, a rejected credential never does.
func (e *APIError) CredentialRejected() bool {
	return e != nil &&
		(e.Status == http.StatusUnauthorized || e.Status == http.StatusForbidden ||
			e.Status == http.StatusPaymentRequired)
}

// retryAfter reads the header both adapters receive. Seconds per RFC 9110; a
// date form is ignored rather than guessed at, which leaves RetryAfter zero
// and lets the caller use its own default.
func retryAfter(h http.Header) time.Duration {
	v := strings.TrimSpace(h.Get("Retry-After"))
	if v == "" {
		return 0
	}
	secs, err := strconv.Atoi(v)
	if err != nil || secs < 0 {
		return 0
	}
	return time.Duration(secs) * time.Second
}

// Error deliberately omits Body. The endpoint is operator-configurable and may
// point inside the network, so echoing what it replied would turn a
// misconfiguration into a way to read internal services through the admin UI.
// Callers that need the detail log it (see the AI admin service).
func (e *APIError) Error() string {
	return fmt.Sprintf("ai provider: http %d", e.Status)
}
