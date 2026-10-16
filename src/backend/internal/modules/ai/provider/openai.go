package provider

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"time"
)

const openaiDefaultBase = "https://api.openai.com/v1"

// openaiClient speaks the OpenAI Chat Completions shape.
//
// That one shape covers OpenAI itself, Ollama, LM Studio, vLLM, Groq, Together
// and DeepSeek — which is why "run a local model" needs no code here, only a
// different base URL.
type openaiClient struct {
	http *http.Client
	base string
	// baseErr records a configured endpoint this process refuses to call.
	baseErr error
	key     string
	model   string
}

func newOpenAI(cfg Config) *openaiClient {
	base, err := checkBase(cfg.BaseURL, openaiDefaultBase)
	return &openaiClient{
		// Longer than the Anthropic client's: a local model on CPU can take a
		// minute to produce its first token.
		http:    guardedClient(300 * time.Second),
		base:    base,
		baseErr: err,
		key:     strings.TrimSpace(cfg.APIKey),
		model:   strings.TrimSpace(cfg.Model),
	}
}

// Ready needs a model but NOT a key: a local server usually has no auth, and
// refusing to run without one would make the common local setup impossible. A
// refused endpoint is not ready at all.
func (c *openaiClient) Ready() bool   { return c.model != "" && c.baseErr == nil }
func (c *openaiClient) Kind() string  { return KindOpenAI }
func (c *openaiClient) Model() string { return c.model }

func (c *openaiClient) auth(r *http.Request) {
	r.Header.Set("content-type", "application/json")
	if c.key != "" {
		r.Header.Set("Authorization", "Bearer "+c.key)
	}
}

func (c *openaiClient) Models(ctx context.Context) ([]string, error) {
	if c.baseErr != nil {
		return nil, c.baseErr
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.base+"/models", nil)
	if err != nil {
		return nil, err
	}
	c.auth(req)
	res, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer func() { _ = res.Body.Close() }()
	if res.StatusCode != http.StatusOK {
		slurp, _ := io.ReadAll(io.LimitReader(res.Body, 4<<10))
		return nil, &APIError{Status: res.StatusCode, Body: string(slurp), RetryAfter: retryAfter(res.Header)}
	}
	var body struct {
		Data []struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	if err := json.NewDecoder(res.Body).Decode(&body); err != nil {
		return nil, err
	}
	out := make([]string, 0, len(body.Data))
	for _, m := range body.Data {
		out = append(out, m.ID)
	}
	return out, nil
}

// --- wire types ---

type oaFunction struct {
	Name      string `json:"name"`
	Arguments string `json:"arguments"`
}

type oaToolCall struct {
	Index    int        `json:"index"`
	ID       string     `json:"id,omitempty"`
	Type     string     `json:"type,omitempty"`
	Function oaFunction `json:"function"`
}

// oaMessage is one message on the wire. Content is a pointer so an
// assistant turn that is ONLY tool calls can send an explicit null, which is
// what the API expects — an empty string is rejected by some servers.
type oaMessage struct {
	Role       string       `json:"role"`
	Content    *string      `json:"content"`
	ToolCalls  []oaToolCall `json:"tool_calls,omitempty"`
	ToolCallID string       `json:"tool_call_id,omitempty"`
}

type oaTool struct {
	Type     string `json:"type"`
	Function struct {
		Name        string         `json:"name"`
		Description string         `json:"description"`
		Parameters  map[string]any `json:"parameters"`
	} `json:"function"`
}

type oaRequest struct {
	Model         string      `json:"model"`
	Messages      []oaMessage `json:"messages"`
	Tools         []oaTool    `json:"tools,omitempty"`
	MaxTokens     int         `json:"max_tokens,omitempty"`
	Stream        bool        `json:"stream"`
	StreamOptions *struct {
		IncludeUsage bool `json:"include_usage"`
	} `json:"stream_options,omitempty"`
}

func str(s string) *string { return &s }

// Stream runs one assistant turn, including any tool round-trips.
func (c *openaiClient) Stream(ctx context.Context, req StreamRequest) (string, Usage, error) {
	// Reported separately from ErrNotConfigured: "you set a URL we refuse to
	// call" and "you set nothing" need different answers from the operator.
	if c.baseErr != nil {
		return "", Usage{}, c.baseErr
	}
	if !c.Ready() {
		return "", Usage{}, ErrNotConfigured
	}
	if req.MaxTokens <= 0 {
		req.MaxTokens = 1500
	}

	// The system prompt is a message here, not a top-level field.
	msgs := make([]oaMessage, 0, len(req.Messages)+4)
	if s := strings.TrimSpace(req.System); s != "" {
		msgs = append(msgs, oaMessage{Role: "system", Content: str(req.System)})
	}
	for _, m := range req.Messages {
		msgs = append(msgs, oaMessage{Role: m.Role, Content: str(m.Content)})
	}

	tools := make([]oaTool, 0, len(req.Tools))
	for _, t := range req.Tools {
		var ot oaTool
		ot.Type = "function"
		ot.Function.Name = t.Name
		ot.Function.Description = t.Description
		ot.Function.Parameters = t.InputSchema
		tools = append(tools, ot)
	}

	var full strings.Builder
	var total Usage

	for round := 0; ; round++ {
		if round >= maxToolRounds {
			break
		}
		body := oaRequest{
			Model: c.model, Messages: msgs, Tools: tools,
			MaxTokens: req.MaxTokens, Stream: true,
		}
		body.StreamOptions = &struct {
			IncludeUsage bool `json:"include_usage"`
		}{IncludeUsage: true}

		text, calls, usage, err := c.once(ctx, body, req.OnDelta)
		total.InputTokens += usage.InputTokens
		total.OutputTokens += usage.OutputTokens
		total.Reported = total.Reported || usage.Reported
		// Keep what was already said BEFORE reporting the failure: the visitor
		// has seen those words stream in, so dropping them would make the
		// transcript disagree with the screen they are looking at.
		full.WriteString(text)
		if err != nil {
			return full.String(), total, err
		}

		if len(calls) == 0 {
			break
		}

		// Echo the assistant's tool_calls back, then one `tool` message per
		// call — the mirror image of Anthropic's tool_use / tool_result pair.
		assistant := oaMessage{Role: RoleAssistant, ToolCalls: make([]oaToolCall, 0, len(calls))}
		if text != "" {
			assistant.Content = str(text)
		}
		results := make([]oaMessage, 0, len(calls))
		for i, call := range calls {
			assistant.ToolCalls = append(assistant.ToolCalls, oaToolCall{
				Index: i, ID: call.ID, Type: "function",
				Function: oaFunction{Name: call.Name, Arguments: string(call.Input)},
			})
			out, err := req.Invoke(ctx, call.Name, call.Input)
			content := ""
			if err != nil {
				// Hand the failure to the model rather than aborting: it can
				// apologise or try something else, which beats a dead turn.
				content = "error: " + err.Error()
			} else if b, mErr := json.Marshal(out); mErr != nil {
				content = "error: could not encode tool result"
			} else {
				content = string(b)
			}
			results = append(results, oaMessage{
				Role: "tool", ToolCallID: call.ID, Content: str(content),
			})
		}
		msgs = append(msgs, assistant)
		msgs = append(msgs, results...)
	}
	return full.String(), total, nil
}

// once performs a single streamed request and decodes the SSE body.
func (c *openaiClient) once(ctx context.Context, body oaRequest, onDelta func(string) error) (string, []toolRound, Usage, error) {
	buf, err := json.Marshal(body)
	if err != nil {
		return "", nil, Usage{}, err
	}
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost,
		c.base+"/chat/completions", bytes.NewReader(buf))
	if err != nil {
		return "", nil, Usage{}, err
	}
	c.auth(httpReq)

	res, err := c.http.Do(httpReq)
	if err != nil {
		return "", nil, Usage{}, err
	}
	defer func() { _, _ = io.Copy(io.Discard, res.Body); _ = res.Body.Close() }()

	if res.StatusCode != http.StatusOK {
		slurp, _ := io.ReadAll(io.LimitReader(res.Body, 4<<10))
		return "", nil, Usage{}, &APIError{Status: res.StatusCode, Body: string(slurp), RetryAfter: retryAfter(res.Header)}
	}

	var (
		text  strings.Builder
		usage Usage
		// Tool calls arrive in fragments keyed by index, with the name and id
		// usually only on the first one — so they are accumulated by index
		// rather than appended in arrival order.
		byIndex = map[int]*toolRound{}
		args    = map[int]*strings.Builder{}
		order   []int
		scanner = bufio.NewScanner(res.Body)
	)
	scanner.Buffer(make([]byte, 0, 64<<10), 1<<20)

	for scanner.Scan() {
		line := scanner.Text()
		if !strings.HasPrefix(line, "data:") {
			continue
		}
		payload := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		if payload == "" || payload == "[DONE]" {
			continue
		}
		var ev struct {
			Choices []struct {
				Delta struct {
					Content   string       `json:"content"`
					ToolCalls []oaToolCall `json:"tool_calls"`
				} `json:"delta"`
			} `json:"choices"`
			Usage *struct {
				PromptTokens     int `json:"prompt_tokens"`
				CompletionTokens int `json:"completion_tokens"`
			} `json:"usage"`
		}
		if err := json.Unmarshal([]byte(payload), &ev); err != nil {
			continue // a frame we do not model is not a reason to fail the turn
		}
		if ev.Usage != nil {
			usage.InputTokens += ev.Usage.PromptTokens
			usage.OutputTokens += ev.Usage.CompletionTokens
			usage.Reported = true
		}
		for _, ch := range ev.Choices {
			if ch.Delta.Content != "" {
				text.WriteString(ch.Delta.Content)
				if onDelta != nil {
					if err := onDelta(ch.Delta.Content); err != nil {
						// The caller pulled the plug mid-answer (a human took
						// over). Stop here and keep what was already said.
						return text.String(), nil, usage, err
					}
				}
			}
			for _, tc := range ch.Delta.ToolCalls {
				cur, seen := byIndex[tc.Index]
				if !seen {
					cur = &toolRound{}
					byIndex[tc.Index] = cur
					args[tc.Index] = &strings.Builder{}
					order = append(order, tc.Index)
				}
				if tc.ID != "" {
					cur.ID = tc.ID
				}
				if tc.Function.Name != "" {
					cur.Name = tc.Function.Name
				}
				args[tc.Index].WriteString(tc.Function.Arguments)
			}
		}
	}
	if err := scanner.Err(); err != nil {
		return text.String(), nil, usage, err
	}

	calls := make([]toolRound, 0, len(order))
	for _, i := range order {
		cur := byIndex[i]
		raw := args[i].String()
		if strings.TrimSpace(raw) == "" {
			raw = "{}"
		}
		cur.Input = json.RawMessage(raw)
		if cur.ID == "" {
			// Some OpenAI-compatible servers omit the id entirely. The protocol
			// needs one to pair the result back, so synthesise a stable one.
			cur.ID = "call_" + cur.Name
		}
		calls = append(calls, *cur)
	}
	return text.String(), calls, usage, nil
}
