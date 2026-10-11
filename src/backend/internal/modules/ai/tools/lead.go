package tools

import (
	"context"
	"encoding/json"
	"errors"
	"strings"

	"github.com/google/uuid"
)

// NameCreateLead is the ONLY write the site assistant can perform. The whole
// prompt-injection defence rests on that: whatever the model is talked into,
// recording a contact request is the worst it can do.
const NameCreateLead = "create_lead"

// LeadInput is what the assistant collected.
type LeadInput struct {
	ConversationID   uuid.UUID
	ReferrerMemberID *uuid.UUID
	Name             string
	Email            string
	Phone            string
	Zalo             string
	Note             string
	ProductSlugs     []string
}

// LeadPort records a lead. The implementation lives outside this package so
// the tool layer stays free of CRM internals.
type LeadPort interface {
	// Capture records the lead, or reports that this conversation already has
	// one. Returning alreadyHad=true must NOT create a second row: a model that
	// loops would otherwise fill the pipeline with duplicates of one person.
	Capture(ctx context.Context, in LeadInput) (alreadyHad bool, err error)
}

// leadCtxKey carries the conversation a tool call belongs to.
//
// It travels in the context rather than in the tool's JSON arguments on
// purpose: the model must not be able to name which conversation a lead
// belongs to, or who gets credited for it. Those are facts about the session,
// not something the visitor's text can influence.
type leadCtxKey struct{}

// LeadContext is the session-owned half of a lead.
type LeadContext struct {
	ConversationID   uuid.UUID
	ReferrerMemberID *uuid.UUID
}

// WithLeadContext attaches the conversation identity to a context.
func WithLeadContext(ctx context.Context, lc LeadContext) context.Context {
	return context.WithValue(ctx, leadCtxKey{}, lc)
}

func leadContextFrom(ctx context.Context) (LeadContext, bool) {
	lc, ok := ctx.Value(leadCtxKey{}).(LeadContext)
	return lc, ok
}

// RegisterLead adds the lead-capture tool.
func RegisterLead(r *Registry, port LeadPort) {
	r.Add(Tool{
		Name: NameCreateLead,
		Description: "Ghi lại thông tin liên hệ của khách khi họ muốn được tư vấn hoặc " +
			"muốn người phụ trách liên hệ lại. Chỉ gọi khi khách đã cho ít nhất một " +
			"cách liên hệ (số điện thoại, Zalo hoặc email). Đừng đoán thông tin.",
		Writes: true,
		Schema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"name":  map[string]any{"type": "string", "description": "Tên khách tự xưng"},
				"phone": map[string]any{"type": "string"},
				"zalo":  map[string]any{"type": "string"},
				"email": map[string]any{"type": "string"},
				"note": map[string]any{
					"type":        "string",
					"description": "Tóm tắt nhu cầu: quy mô, ngành, vấn đề đang gặp",
				},
				"product_slugs": map[string]any{
					"type":        "array",
					"items":       map[string]any{"type": "string"},
					"description": "Slug các sản phẩm khách quan tâm, nếu có",
				},
			},
		},
		Run: func(ctx context.Context, raw json.RawMessage) (any, error) {
			lc, ok := leadContextFrom(ctx)
			if !ok {
				return nil, errors.New("lead capture is not available here")
			}
			var in struct {
				Name         string   `json:"name"`
				Phone        string   `json:"phone"`
				Zalo         string   `json:"zalo"`
				Email        string   `json:"email"`
				Note         string   `json:"note"`
				ProductSlugs []string `json:"product_slugs"`
			}
			if err := json.Unmarshal(raw, &in); err != nil {
				return nil, err
			}

			name := strings.TrimSpace(in.Name)
			phone := strings.TrimSpace(in.Phone)
			zalo := strings.TrimSpace(in.Zalo)
			email := strings.TrimSpace(in.Email)
			if phone == "" && zalo == "" && email == "" {
				// An answer, not an error: the model should go back and ask
				// rather than retry the same empty call.
				return map[string]any{
					"saved":  false,
					"reason": "Chưa có cách liên hệ nào. Hãy hỏi khách số điện thoại hoặc Zalo.",
				}, nil
			}

			already, err := port.Capture(ctx, LeadInput{
				ConversationID:   lc.ConversationID,
				ReferrerMemberID: lc.ReferrerMemberID,
				Name:             name, Email: email, Phone: phone, Zalo: zalo,
				Note:         strings.TrimSpace(in.Note),
				ProductSlugs: in.ProductSlugs,
			})
			if err != nil {
				return nil, err
			}
			if already {
				return map[string]any{
					"saved":  true,
					"reason": "Đã ghi nhận liên hệ của khách trước đó rồi, không cần ghi lại.",
				}, nil
			}
			return map[string]any{"saved": true}, nil
		},
	})
}
