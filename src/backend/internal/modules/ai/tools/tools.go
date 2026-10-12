// Package tools is the one place a tool is implemented. Both edges use it: the
// site assistant calls it in-process under an anonymous identity, and the MCP
// server (later) calls it under a real user's identity. See
// docs/domains/ai/README.md §1 and docs/diagrams/ai-mcp.svg.
package tools

import (
	"context"
	"encoding/json"
	"fmt"
)

// Tool is one capability the model can invoke.
type Tool struct {
	Name        string
	Description string
	// Schema is the JSON Schema for Input, handed to the model verbatim.
	Schema map[string]any
	// Permission the caller must hold. Empty means the tool is safe for an
	// anonymous visitor — only true for reads of already-public data and for
	// the single lead-capture write.
	Permission string
	// Writes marks a tool that changes state. Used to keep the visitor-facing
	// allowlist honest: everything else it can reach is read-only.
	Writes bool

	Run func(ctx context.Context, raw json.RawMessage) (any, error)
}

// Registry holds the tools and decides which ones a given edge may see.
type Registry struct {
	byName map[string]Tool
	order  []string
}

// NewRegistry builds an empty registry.
func NewRegistry() *Registry {
	return &Registry{byName: map[string]Tool{}}
}

// Add registers a tool. Panics on a duplicate name: that is a wiring bug, and
// it should not survive until a visitor trips over it.
func (r *Registry) Add(t Tool) {
	if _, dup := r.byName[t.Name]; dup {
		panic("ai/tools: duplicate tool " + t.Name)
	}
	r.byName[t.Name] = t
	r.order = append(r.order, t.Name)
}

// Visible returns the tools whose names appear in allow, in registration order.
//
// Each edge passes its own allowlist rather than the registry deciding: the
// site assistant gets a fixed, deliberately tiny set, while the MCP server
// filters by what its authenticated user actually holds.
func (r *Registry) Visible(allow []string) []Tool {
	want := map[string]bool{}
	for _, n := range allow {
		want[n] = true
	}
	out := []Tool{}
	for _, n := range r.order {
		if want[n] {
			out = append(out, r.byName[n])
		}
	}
	return out
}

// Call runs a tool by name, refusing anything outside the caller's allowlist.
//
// The allowlist is checked HERE, not only where the tool list was built. A
// model can name a tool it was never offered — whether it hallucinated it or
// was talked into it by the visitor — and that attempt must not reach Run.
func (r *Registry) Call(ctx context.Context, allow []string, name string, raw json.RawMessage) (any, error) {
	for _, n := range allow {
		if n != name {
			continue
		}
		t, ok := r.byName[name]
		if !ok || t.Run == nil {
			// An allowlist naming a tool nobody registered is a wiring bug.
			// Without this it is a nil-map-value call: a panic, mid-answer, on
			// a visitor's request.
			return nil, fmt.Errorf("tool %q is allowed but not registered", name)
		}
		return t.Run(ctx, raw)
	}
	return nil, fmt.Errorf("tool %q is not available here", name)
}

// All returns every registered tool, in registration order. Used by an edge
// that decides visibility from the caller's permissions rather than from a
// fixed list.
func (r *Registry) All() []Tool {
	out := make([]Tool, 0, len(r.order))
	for _, n := range r.order {
		out = append(out, r.byName[n])
	}
	return out
}

// Has reports whether a tool is registered at all.
func (r *Registry) Has(name string) bool {
	_, ok := r.byName[name]
	return ok
}
