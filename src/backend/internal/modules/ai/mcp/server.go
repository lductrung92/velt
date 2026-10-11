// Package mcp exposes Zukatek's tool layer over the Model Context Protocol, so
// clients nobody here wrote — Claude Desktop, Claude Code, an internal agent —
// can query the catalog and the pipeline.
//
// This is the ONLY place MCP belongs. The site assistant does not go through
// it: it shares a process with the tools and calls them directly. Routing that
// through JSON-RPC would add a hop, a session lifecycle and failure modes for
// data that is one function call away.
// See docs/domains/ai/README.md §1 and docs/diagrams/ai-mcp.svg.
package mcp

import (
	"context"
	"encoding/json"

	"github.com/velt/backend/internal/httpx"
	"github.com/velt/backend/internal/modules/ai/tools"
)

// protocolVersion is the MCP revision this server speaks.
const protocolVersion = "2024-11-05"

const serverName = "zukatek"

// IdentityPort resolves a user id into the claims a tool call runs under.
//
// Tools run under the USER's permissions, never under permissions attached to
// the token. Revoking someone in the console therefore revokes their agent too,
// with no second place to remember.
type IdentityPort interface {
	Claims(ctx context.Context, userID string) (*httpx.Identity, error)
}

// Server answers MCP JSON-RPC calls.
type Server struct {
	reg    *tools.Registry
	tokens *TokenStore
	ident  IdentityPort
}

// NewServer builds the MCP server over an existing tool registry.
func NewServer(reg *tools.Registry, tokens *TokenStore, ident IdentityPort) *Server {
	return &Server{reg: reg, tokens: tokens, ident: ident}
}

// --- JSON-RPC envelope ---

type rpcRequest struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params"`
}

type rpcError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

type rpcResponse struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id"`
	Result  any             `json:"result,omitempty"`
	Error   *rpcError       `json:"error,omitempty"`
}

// JSON-RPC error codes, plus the one MCP adds for an unknown method.
const (
	codeParse          = -32700
	codeInvalidRequest = -32600
	codeMethodNotFound = -32601
	codeInvalidParams  = -32602
	codeInternal       = -32603
)

// allowedFor returns the tools this identity may both see and call.
//
// Filtering happens at tools/list, not only at tools/call. A model that is
// never shown a tool does not try it, which saves a whole round of
// try-then-get-refused — and refusing at call time as well (the registry does)
// means the shorter list is a convenience, not the control.
func (s *Server) allowedFor(id *httpx.Identity) []string {
	out := []string{}
	for _, t := range s.reg.All() {
		if t.Permission == "" {
			// A tool with no permission is anonymous-safe by construction. On
			// this surface that means the lead-capture write, which belongs to
			// the site assistant and its session context — not to an agent.
			if t.Writes {
				continue
			}
			out = append(out, t.Name)
			continue
		}
		if id.Has(t.Permission) {
			out = append(out, t.Name)
		}
	}
	return out
}

// Handle dispatches one JSON-RPC call for an authenticated identity.
func (s *Server) Handle(ctx context.Context, id *httpx.Identity, body []byte) rpcResponse {
	var req rpcRequest
	if err := json.Unmarshal(body, &req); err != nil {
		return rpcResponse{JSONRPC: "2.0", Error: &rpcError{codeParse, "parse error"}}
	}
	res := rpcResponse{JSONRPC: "2.0", ID: req.ID}
	if req.JSONRPC != "2.0" {
		res.Error = &rpcError{codeInvalidRequest, "jsonrpc must be 2.0"}
		return res
	}

	switch req.Method {
	case "initialize":
		res.Result = map[string]any{
			"protocolVersion": protocolVersion,
			"capabilities":    map[string]any{"tools": map[string]any{}},
			"serverInfo":      map[string]any{"name": serverName, "version": "1"},
		}

	case "notifications/initialized", "ping":
		res.Result = map[string]any{}

	case "tools/list":
		allow := s.allowedFor(id)
		list := make([]map[string]any, 0, len(allow))
		for _, t := range s.reg.Visible(allow) {
			list = append(list, map[string]any{
				"name": t.Name, "description": t.Description, "inputSchema": t.Schema,
			})
		}
		res.Result = map[string]any{"tools": list}

	case "tools/call":
		var p struct {
			Name      string          `json:"name"`
			Arguments json.RawMessage `json:"arguments"`
		}
		if err := json.Unmarshal(req.Params, &p); err != nil {
			res.Error = &rpcError{codeInvalidParams, "invalid params"}
			return res
		}
		if len(p.Arguments) == 0 {
			p.Arguments = json.RawMessage(`{}`)
		}
		out, err := s.reg.Call(ctx, s.allowedFor(id), p.Name, p.Arguments)
		if err != nil {
			// MCP wants tool failures as a result with isError, not as a
			// protocol error: the model should be able to read what went wrong
			// and try something else.
			res.Result = map[string]any{
				"isError": true,
				"content": []map[string]any{{"type": "text", "text": err.Error()}},
			}
			return res
		}
		encoded, err := json.Marshal(out)
		if err != nil {
			res.Error = &rpcError{codeInternal, "could not encode result"}
			return res
		}
		res.Result = map[string]any{
			"content": []map[string]any{{"type": "text", "text": string(encoded)}},
		}

	default:
		res.Error = &rpcError{codeMethodNotFound, "unknown method: " + req.Method}
	}
	return res
}
