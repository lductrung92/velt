package conversation

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/velt/backend/internal/httpx"
	"github.com/velt/backend/internal/modules/ai/provider"
	"github.com/velt/backend/internal/modules/ai/shared"
)

// The admin surface behind the "Trợ lý AI" screen: is it alive, what is it
// costing, and does the configured model actually work.
//
// Gated by settings.manage, the same permission that guards the SMTP password.
// An API key is a billing credential; it does not deserve its own permission
// model to drift out of sync.
const permSettings = "settings.manage"

// Status answers the one question the screen exists to answer: is the
// assistant actually running right now, and if not, why not.
type Status struct {
	Live     bool   `json:"live"`
	Reason   string `json:"reason"`
	Provider string `json:"provider"`
	Model    string `json:"model"`
	BaseURL  string `json:"base_url"`
	HasKey   bool   `json:"has_key"`
	// StaffOnline explains a handoff being refused without anyone having to
	// guess.
	StaffOnline int `json:"staff_online"`
}

// Reasons the assistant is not answering. Deliberately distinct: "off",
// "misconfigured" and "out of money" call for different actions.
const (
	ReasonOK         = ""
	ReasonDisabled   = "disabled"
	ReasonNoKey      = "not_configured"
	ReasonOverBudget = "budget_exhausted"
)

// UsageReport is spend against the ceiling.
type UsageReport struct {
	TodayTokensOut int        `json:"today_tokens_out"`
	DailyCap       int        `json:"daily_cap"`
	Days           []UsageDay `json:"days"`
}

// TestResult is what a connection test found.
type TestResult struct {
	OK bool `json:"ok"`
	// ToolCalling is the one that matters. Without it the model answers from
	// imagination instead of the catalog, which breaks the grounding guarantee
	// rather than merely lowering quality.
	ToolCalling bool   `json:"tool_calling"`
	Model       string `json:"model"`
	Provider    string `json:"provider"`
	LatencyMS   int64  `json:"latency_ms"`
	Reply       string `json:"reply,omitempty"`
	Error       string `json:"error,omitempty"`
}

// Status reports whether the assistant can answer right now.
func (s *Service) Status(ctx context.Context, id *httpx.Identity) (Status, error) {
	if err := s.Require(ctx, id, permSettings); err != nil {
		return Status{}, err
	}
	// Everything here describes the link that would answer the NEXT visitor
	// message: the first runnable step of the chat chain. Reading it from the
	// chain rather than from settings is what keeps the screen honest now
	// that an endpoint is a record, not four settings.
	cl := s.client(ctx, shared.PurposeChat)
	st := Status{
		Provider: cl.Kind(), Model: cl.Model(),
		StaffOnline: s.presence.Count(),
	}
	if links, err := s.endpoints.Available(ctx, string(shared.PurposeChat)); err == nil && len(links) > 0 {
		st.BaseURL = links[0].BaseURL
		st.HasKey = strings.TrimSpace(links[0].APIKey) != ""
	}
	switch {
	case !s.settings.GetBool(ctx, shared.KeyEnabled):
		st.Reason = ReasonDisabled
	case !cl.Ready():
		st.Reason = ReasonNoKey
	case !s.withinBudget(ctx):
		st.Reason = ReasonOverBudget
	default:
		st.Live = true
	}
	return st, nil
}

// Usage returns spend against the ceiling.
func (s *Service) Usage(ctx context.Context, id *httpx.Identity, days int) (UsageReport, error) {
	if err := s.Require(ctx, id, permSettings); err != nil {
		return UsageReport{}, err
	}
	if days <= 0 || days > 90 {
		days = 14
	}
	today, err := s.repo.UsageToday(ctx)
	if err != nil {
		return UsageReport{}, s.MapRepoErr(ctx, "usage today", err)
	}
	rows, err := s.repo.UsageRange(ctx, days)
	if err != nil {
		return UsageReport{}, s.MapRepoErr(ctx, "usage range", err)
	}
	return UsageReport{
		TodayTokensOut: today,
		DailyCap:       s.settings.GetInt(ctx, shared.KeyDailyTokenCap),
		Days:           rows,
	}, nil
}

// Models asks the endpoint what it offers, so nobody has to type a model id
// from memory — the typo that silently breaks everything.
func (s *Service) Models(ctx context.Context, id *httpx.Identity) ([]string, error) {
	if err := s.Require(ctx, id, permSettings); err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	// Endpoint-level: the list is what the account offers, the same for
	// every purpose.
	names, err := s.client(ctx, shared.PurposeChat).Models(ctx)
	if err != nil {
		// As in Test: the body is log-only, because this endpoint can be
		// pointed at an internal host and the screen renders whatever comes
		// back.
		var apiErr *provider.APIError
		if errors.As(err, &apiErr) {
			s.Sec(ctx).Warn("ai: provider rejected the model list",
				"status", apiErr.Status, "body", apiErr.Body)
		}
	}
	return names, err
}

// probeTool is the tool a connection test offers. Trivial on purpose: if the
// model will not call THIS, it will not call the real ones either.
var probeTool = provider.ToolSpec{
	Name:        "report_ready",
	Description: "Gọi hàm này để báo rằng bạn đã sẵn sàng.",
	InputSchema: map[string]any{
		"type":       "object",
		"properties": map[string]any{"ready": map[string]any{"type": "boolean"}},
		"required":   []string{"ready"},
	},
}

// Test makes one small real call against the configured endpoint.
//
// It deliberately costs a few tokens. The alternative — finding out the key is
// wrong when a customer's conversation silently degrades — is how this went
// unnoticed before.
func (s *Service) Test(ctx context.Context, id *httpx.Identity) (TestResult, error) {
	if err := s.Require(ctx, id, permSettings); err != nil {
		return TestResult{}, err
	}
	// The chat model on purpose: this probe's whole point is whether the model
	// calls tools, and that only matters for the chatbot. The content model
	// shares the endpoint, so the same probe proves its connectivity too.
	cl := s.client(ctx, shared.PurposeChat)
	res := TestResult{Provider: cl.Kind(), Model: cl.Model()}
	if !cl.Ready() {
		res.Error = "chưa cấu hình đủ để gọi"
		return res, nil
	}

	ctx, cancel := context.WithTimeout(ctx, 90*time.Second)
	defer cancel()

	called := false
	started := time.Now()
	text, _, err := cl.Stream(ctx, provider.StreamRequest{
		System:    "Bạn đang được kiểm tra kết nối. Hãy gọi tool report_ready với ready=true, rồi trả lời đúng một từ: OK.",
		Messages:  []provider.Message{{Role: provider.RoleUser, Content: "Kiểm tra."}},
		Tools:     []provider.ToolSpec{probeTool},
		MaxTokens: 100,
		Invoke: func(context.Context, string, json.RawMessage) (any, error) {
			called = true
			return map[string]any{"acknowledged": true}, nil
		},
	})
	res.LatencyMS = time.Since(started).Milliseconds()
	res.ToolCalling = called
	res.Reply = strings.TrimSpace(text)

	if err != nil {
		res.Error = err.Error()
		// The upstream body stays in the log, never in the response: the
		// endpoint is operator-configurable and may point inside the network.
		// The operator gets the status code on screen and the detail here.
		var apiErr *provider.APIError
		if errors.As(err, &apiErr) {
			s.Sec(ctx).Warn("ai: provider rejected the probe",
				"status", apiErr.Status, "body", apiErr.Body)
		}
		return res, nil
	}
	res.OK = true
	return res, nil
}

// withinBudget is the ceiling check, split out of live() so Status can report
// which of the three reasons applies rather than just "not running".
func (s *Service) withinBudget(ctx context.Context) bool {
	cap := s.settings.GetInt(ctx, shared.KeyDailyTokenCap)
	if cap <= 0 {
		return true
	}
	spent, err := s.repo.UsageToday(ctx)
	if err != nil {
		s.Sec(ctx).Error("ai: usage lookup failed", "err", err)
		return true
	}
	return spent < cap
}
