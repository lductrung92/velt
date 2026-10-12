package provider

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

// sseServer replays canned Chat Completions frames and records what it was
// sent, so the tool translation can be checked in both directions.
func sseServer(t *testing.T, scripts ...[]string) (*httptest.Server, *[]oaRequest) {
	t.Helper()
	var seen []oaRequest
	turn := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, "/models") {
			_, _ = io.WriteString(w, `{"data":[{"id":"llama3.1:8b"},{"id":"qwen2.5:14b"}]}`)
			return
		}
		body, _ := io.ReadAll(r.Body)
		var req oaRequest
		_ = json.Unmarshal(body, &req)
		seen = append(seen, req)

		w.Header().Set("Content-Type", "text/event-stream")
		i := turn
		if i >= len(scripts) {
			i = len(scripts) - 1
		}
		turn++
		for _, line := range scripts[i] {
			_, _ = fmt.Fprintf(w, "data: %s\n\n", line)
		}
		_, _ = io.WriteString(w, "data: [DONE]\n\n")
	}))
	t.Cleanup(srv.Close)
	return srv, &seen
}

func textFrame(s string) string {
	b, _ := json.Marshal(map[string]any{
		"choices": []any{map[string]any{"delta": map[string]any{"content": s}}},
	})
	return string(b)
}

func TestOpenAIStreamsText(t *testing.T) {
	srv, _ := sseServer(t, []string{
		textFrame("Chào "), textFrame("bạn"),
		`{"usage":{"prompt_tokens":11,"completion_tokens":5}}`,
	})
	c := newOpenAI(Config{BaseURL: srv.URL, Model: "llama3.1:8b"})

	var got []string
	text, usage, err := c.Stream(context.Background(), StreamRequest{
		Messages: []Message{{Role: RoleUser, Content: "hi"}},
		OnDelta:  func(s string) error { got = append(got, s); return nil },
	})
	require.NoError(t, err)
	require.Equal(t, "Chào bạn", text)
	require.Equal(t, []string{"Chào ", "bạn"}, got)
	require.True(t, usage.Reported)
	require.Equal(t, 11, usage.InputTokens)
	require.Equal(t, 5, usage.OutputTokens)
}

func TestOpenAIAssemblesToolCallsAcrossFragments(t *testing.T) {
	// Arguments arrive in pieces and the name/id usually only ride the first
	// fragment, so they must be accumulated by index rather than appended in
	// arrival order.
	srv, seen := sseServer(t,
		[]string{
			`{"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"search_products","arguments":"{\"que"}}]}}]}`,
			`{"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"ry\":\"kho\"}"}}]}}]}`,
		},
		[]string{textFrame("Có 2 sản phẩm.")},
	)
	c := newOpenAI(Config{BaseURL: srv.URL, Model: "gpt-4o"})

	var invoked string
	var args json.RawMessage
	text, _, err := c.Stream(context.Background(), StreamRequest{
		Messages: []Message{{Role: RoleUser, Content: "quản kho"}},
		Tools:    []ToolSpec{{Name: "search_products", InputSchema: map[string]any{"type": "object"}}},
		Invoke: func(_ context.Context, name string, in json.RawMessage) (any, error) {
			invoked, args = name, in
			return map[string]any{"items": []string{"a", "b"}}, nil
		},
	})
	require.NoError(t, err)
	require.Equal(t, "search_products", invoked)
	require.JSONEq(t, `{"query":"kho"}`, string(args))
	require.Equal(t, "Có 2 sản phẩm.", text)

	// Second request must carry the assistant's tool_calls and a matching
	// `tool` message — the mirror of Anthropic's tool_use / tool_result pair.
	require.Len(t, *seen, 2)
	second := (*seen)[1]
	var sawAssistant, sawResult bool
	for _, m := range second.Messages {
		if m.Role == RoleAssistant && len(m.ToolCalls) == 1 {
			sawAssistant = true
			require.Equal(t, "call_1", m.ToolCalls[0].ID)
			require.Equal(t, "function", m.ToolCalls[0].Type)
		}
		if m.Role == "tool" {
			sawResult = true
			require.Equal(t, "call_1", m.ToolCallID)
			require.Contains(t, *m.Content, "items")
		}
	}
	require.True(t, sawAssistant, "the assistant's tool_calls must be echoed back")
	require.True(t, sawResult, "the result must come back as a tool message")
}

func TestOpenAISendsSystemAsAMessage(t *testing.T) {
	// Anthropic takes a top-level system field; here it is the first message.
	srv, seen := sseServer(t, []string{textFrame("ok")})
	c := newOpenAI(Config{BaseURL: srv.URL, Model: "m"})

	_, _, err := c.Stream(context.Background(), StreamRequest{
		System:   "Bạn là trợ lý.",
		Messages: []Message{{Role: RoleUser, Content: "hi"}},
	})
	require.NoError(t, err)
	first := (*seen)[0]
	require.Equal(t, "system", first.Messages[0].Role)
	require.Equal(t, "Bạn là trợ lý.", *first.Messages[0].Content)
}

func TestOpenAIRewrapsToolSchema(t *testing.T) {
	srv, seen := sseServer(t, []string{textFrame("ok")})
	c := newOpenAI(Config{BaseURL: srv.URL, Model: "m"})

	schema := map[string]any{"type": "object", "properties": map[string]any{}}
	_, _, err := c.Stream(context.Background(), StreamRequest{
		Messages: []Message{{Role: RoleUser, Content: "hi"}},
		Tools:    []ToolSpec{{Name: "t", Description: "d", InputSchema: schema}},
	})
	require.NoError(t, err)
	tools := (*seen)[0].Tools
	require.Len(t, tools, 1)
	require.Equal(t, "function", tools[0].Type)
	require.Equal(t, "t", tools[0].Function.Name)
	require.Equal(t, "object", tools[0].Function.Parameters["type"])
}

func TestOpenAISynthesisesAMissingToolCallID(t *testing.T) {
	// Some OpenAI-compatible servers omit the id. The protocol needs one to
	// pair the result back, so a missing one must not drop the call.
	srv, seen := sseServer(t,
		[]string{`{"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"name":"ping","arguments":"{}"}}]}}]}`},
		[]string{textFrame("done")},
	)
	c := newOpenAI(Config{BaseURL: srv.URL, Model: "llama3.1:8b"})

	called := false
	_, _, err := c.Stream(context.Background(), StreamRequest{
		Messages: []Message{{Role: RoleUser, Content: "hi"}},
		Tools:    []ToolSpec{{Name: "ping", InputSchema: map[string]any{"type": "object"}}},
		Invoke: func(context.Context, string, json.RawMessage) (any, error) {
			called = true
			return "pong", nil
		},
	})
	require.NoError(t, err)
	require.True(t, called)
	for _, m := range (*seen)[1].Messages {
		if m.Role == "tool" {
			require.NotEmpty(t, m.ToolCallID)
		}
	}
}

func TestOpenAIToolErrorGoesBackToTheModel(t *testing.T) {
	srv, seen := sseServer(t,
		[]string{`{"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c1","function":{"name":"boom","arguments":"{}"}}]}}]}`},
		[]string{textFrame("Xin lỗi.")},
	)
	c := newOpenAI(Config{BaseURL: srv.URL, Model: "m"})

	_, _, err := c.Stream(context.Background(), StreamRequest{
		Messages: []Message{{Role: RoleUser, Content: "hi"}},
		Tools:    []ToolSpec{{Name: "boom", InputSchema: map[string]any{"type": "object"}}},
		Invoke: func(context.Context, string, json.RawMessage) (any, error) {
			return nil, fmt.Errorf("khong goi duoc")
		},
	})
	require.NoError(t, err, "a tool failure must not kill the turn")
	for _, m := range (*seen)[1].Messages {
		if m.Role == "tool" {
			require.Contains(t, *m.Content, "khong goi duoc")
		}
	}
}

func TestOpenAIStopsWhenTheCallerPullsThePlug(t *testing.T) {
	// How "the assistant falls silent the moment a human takes over" reaches
	// the transport.
	srv, _ := sseServer(t, []string{textFrame("một"), textFrame("hai"), textFrame("ba")})
	c := newOpenAI(Config{BaseURL: srv.URL, Model: "m"})

	n := 0
	stop := fmt.Errorf("took over")
	text, _, err := c.Stream(context.Background(), StreamRequest{
		Messages: []Message{{Role: RoleUser, Content: "hi"}},
		OnDelta: func(string) error {
			n++
			if n == 2 {
				return stop
			}
			return nil
		},
	})
	require.ErrorIs(t, err, stop)
	require.Equal(t, 2, n, "nothing is emitted after the caller says stop")
	require.Equal(t, "mộthai", text)
}

func TestOpenAIUnreportedUsageIsNotZeroSpend(t *testing.T) {
	// Many local servers report nothing. A meter must treat that as unknown,
	// not as free.
	srv, _ := sseServer(t, []string{textFrame("ok")})
	c := newOpenAI(Config{BaseURL: srv.URL, Model: "m"})

	_, usage, err := c.Stream(context.Background(), StreamRequest{
		Messages: []Message{{Role: RoleUser, Content: "hi"}},
	})
	require.NoError(t, err)
	require.False(t, usage.Reported)
}

func TestOpenAISurfacesHTTPErrors(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = io.WriteString(w, `{"error":"bad key"}`)
	}))
	defer srv.Close()
	c := newOpenAI(Config{BaseURL: srv.URL, Model: "m", APIKey: "x"})

	_, _, err := c.Stream(context.Background(), StreamRequest{
		Messages: []Message{{Role: RoleUser, Content: "hi"}},
	})
	require.Error(t, err)
	var apiErr *APIError
	require.ErrorAs(t, err, &apiErr)
	require.Equal(t, 401, apiErr.Status)
}

func TestOpenAIListsModels(t *testing.T) {
	srv, _ := sseServer(t, []string{textFrame("ok")})
	c := newOpenAI(Config{BaseURL: srv.URL, Model: "m"})
	names, err := c.Models(context.Background())
	require.NoError(t, err)
	require.Equal(t, []string{"llama3.1:8b", "qwen2.5:14b"}, names)
}

func TestOpenAINeedsNoKeyButNeedsAModel(t *testing.T) {
	// A local endpoint usually has no auth; refusing without a key would make
	// the common local setup impossible.
	require.True(t, newOpenAI(Config{Model: "llama3.1:8b"}).Ready())
	require.False(t, newOpenAI(Config{APIKey: "sk-x"}).Ready())
}

func TestFactoryPicksTheAdapterAndFallsBackSafely(t *testing.T) {
	require.Equal(t, KindOpenAI, New(Config{Kind: "openai", Model: "m"}).Kind())
	require.Equal(t, KindAnthropic, New(Config{Kind: "anthropic"}).Kind())
	// A typo in a setting degrades to the documented default rather than
	// taking the assistant down.
	require.Equal(t, KindAnthropic, New(Config{Kind: "opena1"}).Kind())
	require.Equal(t, KindAnthropic, New(Config{}).Kind())
}

func TestBaseURLTrailingSlashDoesNotDouble(t *testing.T) {
	got, err := checkBase("http://x/v1/", "http://fallback")
	require.NoError(t, err)
	require.Equal(t, "http://x/v1", got)

	got, err = checkBase("   ", "http://fallback")
	require.NoError(t, err)
	require.Equal(t, "http://fallback", got)
}

// The endpoint is operator-configurable, so it is an outbound-request primitive
// pointed wherever a setting says. Loopback and private addresses must keep
// working — "run Ollama on localhost" is the reason this adapter exists — so
// the policy bans only what cannot serve a model and is what an SSRF aims at.
func TestEndpointPolicy(t *testing.T) {
	ok := []string{
		"http://127.0.0.1:11434/v1",   // the documented local-model setup
		"http://192.168.1.50:8000/v1", // a model box on the LAN
		"http://ollama:11434/v1",      // a container name
		"https://api.openai.com/v1",
	}
	for _, u := range ok {
		_, err := checkBase(u, "http://fallback")
		require.NoErrorf(t, err, "%s must stay usable", u)
	}

	bad := []string{
		"http://169.254.169.254/latest/meta-data", // IAM credentials
		"http://169.254.1.1/v1",
		"file:///etc/passwd",
		"gopher://127.0.0.1:6379/_FLUSHALL",
		"http:///v1", // no host
	}
	for _, u := range bad {
		_, err := checkBase(u, "http://fallback")
		require.ErrorIsf(t, err, ErrUnsafeEndpoint, "%s must be refused", u)
	}
}

// A hostname that resolves to the metadata address would sail past a check on
// the configured string, so the guard runs on the address actually dialled.
func TestDialGuardRefusesTheMetadataAddressAfterDNS(t *testing.T) {
	c := guardedClient(5 * time.Second)
	_, err := c.Get("http://169.254.169.254/latest/meta-data/") //nolint:noctx // guard fires before any I/O
	require.ErrorIs(t, err, ErrUnsafeEndpoint)
}

// A refused endpoint must not look like a working one. Ready() false is what
// keeps /ai/status honest and the assistant in degraded mode.
func TestUnsafeEndpointIsNotReady(t *testing.T) {
	c := New(Config{Kind: KindOpenAI, Model: "m", BaseURL: "http://169.254.169.254/v1"})
	require.False(t, c.Ready())
	_, _, err := c.Stream(context.Background(), StreamRequest{
		Messages: []Message{{Role: RoleUser, Content: "hi"}},
	})
	require.ErrorIs(t, err, ErrUnsafeEndpoint)
}

// The upstream body must not come back to the caller: the endpoint can point
// inside the network, and the admin screen would happily render whatever an
// internal service replied.
func TestAPIErrorDoesNotLeakTheUpstreamBody(t *testing.T) {
	e := &APIError{Status: 404, Body: `{"internal":"secret-value"}`}
	require.NotContains(t, e.Error(), "secret-value")
	require.Contains(t, e.Error(), "404")
}
