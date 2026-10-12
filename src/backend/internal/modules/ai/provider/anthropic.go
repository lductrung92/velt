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

const (
	anthropicDefaultBase = "https://api.anthropic.com"
	anthropicVersion     = "2023-06-01"
)

// anthropicClient speaks Anthropic's Messages API.
type anthropicClient struct {
	http *http.Client
	base string
	// baseErr records a configured endpoint this process refuses to call.
	baseErr error
	key     string
	model   string
}

func newAnthropic(cfg Config) *anthropicClient {
	model := strings.TrimSpace(cfg.Model)
	if model == "" {
		model = "claude-sonnet-5-5"
	}
	base, err := checkBase(cfg.BaseURL, anthropicDefaultBase)
	return &anthropicClient{
		http:    guardedClient(120 * time.Second),
		base:    base,
		baseErr: err,
		key:     strings.TrimSpace(cfg.APIKey),
		model:   model,
	}
}

// Ready is false when the configured endpoint was refused, so a bad base URL
// shows up as "not configured" in /ai/status instead of as a failure on the
// first visitor message.
func (c *anthropicClient) Ready() bool   { return c.key != "" && c.baseErr == nil }
func (c *anthropicClient) Kind() string  { return KindAnthropic }
func (c *anthropicClient) Model() string { return c.model }

// Models lists the account's available models.
func (c *anthropicClient) Models(ctx context.Context) ([]string, error) {
	if c.baseErr != nil {
		return nil, c.baseErr
	}
	if !c.Ready() {
		return nil, ErrNotConfigured
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.base+"/v1/models", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("x-api-key", c.key)
	req.Header.Set("anthropic-version", anthropicVersion)

	res, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer func() { _ = res.Body.Close() }()
	if res.StatusCode != http.StatusOK {
		slurp, _ := io.ReadAll(io.LimitReader(res.Body, 4<<10))
		return nil, &APIError{Status: res.StatusCode, Body: string(slurp)}
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

type wireContent struct {
	Type  string          `json:"type"`
	Text  string          `json:"text,omitempty"`
	ID    string          `json:"id,omitempty"`
	Name  string          `json:"name,omitempty"`
	Input json.RawMessage `json:"input,omitempty"`

	// tool_result
	ToolUseID string `json:"tool_use_id,omitempty"`
	Content   string `json:"content,omitempty"`
	IsError   bool   `json:"is_error,omitempty"`
}

type wireMessage struct {
	Role    string        `json:"role"`
	Content []wireContent `json:"content"`
}

type wireRequest struct {
	Model     string        `json:"model"`
	System    string        `json:"system,omitempty"`
	Messages  []wireMessage `json:"messages"`
	Tools     []ToolSpec    `json:"tools,omitempty"`
	MaxTokens int           `json:"max_tokens"`
	Stream    bool          `json:"stream"`
}

// Stream runs one assistant turn, including any tool round-trips, and returns
// the final text plus what it cost.
func (c *anthropicClient) Stream(ctx context.Context, req StreamRequest) (string, Usage, error) {
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

	msgs := make([]wireMessage, 0, len(req.Messages)+4)
	for _, m := range req.Messages {
		msgs = append(msgs, wireMessage{
			Role:    m.Role,
			Content: []wireContent{{Type: "text", Text: m.Content}},
		})
	}

	var full strings.Builder
	var total Usage

	for round := 0; ; round++ {
		if round >= maxToolRounds {
			// Stop asking. Whatever text we have is what the visitor gets.
			break
		}
		text, toolUses, usage, err := c.once(ctx, wireRequest{
			Model: c.model, System: req.System, Messages: msgs,
			Tools: req.Tools, MaxTokens: req.MaxTokens, Stream: true,
		}, req.OnDelta)
		total.InputTokens += usage.InputTokens
		total.OutputTokens += usage.OutputTokens
		// Keep what was already said BEFORE reporting the failure: the visitor
		// has seen those words stream in, so dropping them would make the
		// transcript disagree with the screen they are looking at.
		full.WriteString(text)
		if err != nil {
			return full.String(), total, err
		}

		if len(toolUses) == 0 {
			break
		}

		// Echo the assistant's tool_use blocks back, then answer each one.
		assistant := wireMessage{Role: RoleAssistant}
		if text != "" {
			assistant.Content = append(assistant.Content, wireContent{Type: "text", Text: text})
		}
		results := wireMessage{Role: RoleUser}
		for _, tu := range toolUses {
			assistant.Content = append(assistant.Content, wireContent{
				Type: "tool_use", ID: tu.ID, Name: tu.Name, Input: tu.Input,
			})
			out, err := req.Invoke(ctx, tu.Name, tu.Input)
			res := wireContent{Type: "tool_result", ToolUseID: tu.ID}
			if err != nil {
				// Hand the failure to the model instead of aborting: it can
				// apologise or try a different tool, which beats a dead turn.
				res.IsError = true
				res.Content = err.Error()
			} else {
				b, mErr := json.Marshal(out)
				if mErr != nil {
					res.IsError = true
					res.Content = "could not encode tool result"
				} else {
					res.Content = string(b)
				}
			}
			results.Content = append(results.Content, res)
		}
		msgs = append(msgs, assistant, results)
	}
	return full.String(), total, nil
}

// once performs a single streamed request and decodes the SSE body.
func (c *anthropicClient) once(ctx context.Context, body wireRequest, onDelta func(string) error) (string, []toolRound, Usage, error) {
	buf, err := json.Marshal(body)
	if err != nil {
		return "", nil, Usage{}, err
	}
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, c.base+"/v1/messages", bytes.NewReader(buf))
	if err != nil {
		return "", nil, Usage{}, err
	}
	httpReq.Header.Set("content-type", "application/json")
	httpReq.Header.Set("x-api-key", c.key)
	httpReq.Header.Set("anthropic-version", anthropicVersion)

	res, err := c.http.Do(httpReq)
	if err != nil {
		return "", nil, Usage{}, err
	}
	defer func() { _, _ = io.Copy(io.Discard, res.Body); _ = res.Body.Close() }()

	if res.StatusCode != http.StatusOK {
		slurp, _ := io.ReadAll(io.LimitReader(res.Body, 4<<10))
		return "", nil, Usage{}, &APIError{Status: res.StatusCode, Body: string(slurp)}
	}

	var (
		text    strings.Builder
		uses    []toolRound
		partial strings.Builder // accumulating tool input json
		curUse  *toolRound
		usage   Usage
		scanner = bufio.NewScanner(res.Body)
		maxLine = 1 << 20
		lineBuf = make([]byte, 0, 64<<10)
	)
	scanner.Buffer(lineBuf, maxLine)

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
			Type         string `json:"type"`
			Index        int    `json:"index"`
			ContentBlock *struct {
				Type string `json:"type"`
				ID   string `json:"id"`
				Name string `json:"name"`
			} `json:"content_block"`
			Delta *struct {
				Type        string `json:"type"`
				Text        string `json:"text"`
				PartialJSON string `json:"partial_json"`
			} `json:"delta"`
			Message *struct {
				Usage struct {
					InputTokens  int `json:"input_tokens"`
					OutputTokens int `json:"output_tokens"`
				} `json:"usage"`
			} `json:"message"`
			Usage *struct {
				OutputTokens int `json:"output_tokens"`
			} `json:"usage"`
		}
		if err := json.Unmarshal([]byte(payload), &ev); err != nil {
			continue // a frame we do not model is not a reason to fail the turn
		}

		switch ev.Type {
		case "message_start":
			if ev.Message != nil {
				usage.InputTokens += ev.Message.Usage.InputTokens
				usage.OutputTokens += ev.Message.Usage.OutputTokens
			}
		case "content_block_start":
			if ev.ContentBlock != nil && ev.ContentBlock.Type == "tool_use" {
				curUse = &toolRound{ID: ev.ContentBlock.ID, Name: ev.ContentBlock.Name}
				partial.Reset()
			}
		case "content_block_delta":
			if ev.Delta == nil {
				continue
			}
			switch ev.Delta.Type {
			case "text_delta":
				text.WriteString(ev.Delta.Text)
				if onDelta != nil {
					if err := onDelta(ev.Delta.Text); err != nil {
						// The caller pulled the plug mid-answer (a human took
						// over). Stop here and keep what was already said.
						return text.String(), uses, usage, err
					}
				}
			case "input_json_delta":
				partial.WriteString(ev.Delta.PartialJSON)
			}
		case "content_block_stop":
			if curUse != nil {
				raw := partial.String()
				if raw == "" {
					raw = "{}"
				}
				curUse.Input = json.RawMessage(raw)
				uses = append(uses, *curUse)
				curUse = nil
			}
		case "message_delta":
			if ev.Usage != nil {
				usage.OutputTokens += ev.Usage.OutputTokens
			}
		}
	}
	if err := scanner.Err(); err != nil {
		return text.String(), uses, usage, err
	}
	return text.String(), uses, usage, nil
}
