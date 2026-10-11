package tools

import (
	"context"
	"encoding/json"
	"strings"

	"github.com/google/uuid"
)

// Tools for the team's own agents, reached over MCP. Unlike the visitor tools
// these carry a permission, and the MCP edge both hides and refuses the ones
// the caller does not hold.
const (
	NameListLeads       = "list_leads"
	NameGetConversation = "get_conversation"
)

// LeadSummary is a lead as an agent sees it.
type LeadSummary struct {
	ID        string   `json:"id"`
	Name      string   `json:"name,omitempty"`
	Email     string   `json:"email,omitempty"`
	Phone     string   `json:"phone,omitempty"`
	Zalo      string   `json:"zalo,omitempty"`
	Status    string   `json:"status"`
	Source    string   `json:"source"`
	Assignee  string   `json:"assignee,omitempty"`
	Products  []string `json:"products,omitempty"`
	Note      string   `json:"note,omitempty"`
	CreatedAt string   `json:"created_at"`
}

// TranscriptLine is one line of a conversation as an agent sees it.
type TranscriptLine struct {
	Role      string `json:"role"`
	Content   string `json:"content"`
	CreatedAt string `json:"created_at"`
}

// PipelinePort is the slice of CRM an agent may read.
type PipelinePort interface {
	ListLeads(ctx context.Context, status string, limit int) ([]LeadSummary, error)
}

// TranscriptPort is the slice of the assistant's own history an agent may read.
type TranscriptPort interface {
	Transcript(ctx context.Context, conversationID uuid.UUID) ([]TranscriptLine, error)
}

// Permissions these tools demand. They are the same codes the console uses, so
// there is no separate agent permission model to drift.
const (
	PermLeadsView  = "crm.leads.view"
	PermChatHandle = "ai.chat.handle"
)

// RegisterTeam adds the agent-facing read tools.
//
// Read-only, deliberately. A client here is an agent, and an agent that gets it
// wrong gets it wrong in bulk rather than once — so writes go in one at a time,
// each considered on its own, when there is a real need.
func RegisterTeam(r *Registry, pipeline PipelinePort, transcripts TranscriptPort) {
	r.Add(Tool{
		Name:        NameListLeads,
		Description: "Danh sách khách tiềm năng (lead) của Zukatek, lọc theo trạng thái.",
		Permission:  PermLeadsView,
		Schema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"status": map[string]any{
					"type":        "string",
					"description": "new | contacted | qualified | won | lost",
				},
				"limit": map[string]any{"type": "integer"},
			},
		},
		Run: func(ctx context.Context, raw json.RawMessage) (any, error) {
			var in struct {
				Status string `json:"status"`
				Limit  int    `json:"limit"`
			}
			if err := json.Unmarshal(raw, &in); err != nil {
				return nil, err
			}
			items, err := pipeline.ListLeads(ctx, strings.TrimSpace(in.Status), in.Limit)
			if err != nil {
				return nil, err
			}
			return map[string]any{"items": items}, nil
		},
	})

	r.Add(Tool{
		Name:        NameGetConversation,
		Description: "Toàn bộ nội dung một cuộc trò chuyện với trợ lý, theo id.",
		Permission:  PermChatHandle,
		Schema: map[string]any{
			"type":       "object",
			"properties": map[string]any{"conversation_id": map[string]any{"type": "string"}},
			"required":   []string{"conversation_id"},
		},
		Run: func(ctx context.Context, raw json.RawMessage) (any, error) {
			var in struct {
				ConversationID string `json:"conversation_id"`
			}
			if err := json.Unmarshal(raw, &in); err != nil {
				return nil, err
			}
			id, err := uuid.Parse(strings.TrimSpace(in.ConversationID))
			if err != nil {
				return map[string]any{"found": false, "reason": "conversation_id không hợp lệ"}, nil
			}
			lines, err := transcripts.Transcript(ctx, id)
			if err != nil {
				return nil, err
			}
			return map[string]any{"messages": lines}, nil
		},
	})
}
