package conversation

import (
	"sync"

	"github.com/google/uuid"
)

// Event is one thing that happens in a conversation, as the browser sees it.
type Event struct {
	// Type is the SSE event name: delta | message | state | error.
	Type string `json:"-"`
	// Text carries a streaming fragment for `delta`.
	Text string `json:"text,omitempty"`
	// Message carries a finished line for `message`.
	Message *MessageView `json:"message,omitempty"`
	// State carries the new conversation state for `state`.
	State string `json:"state,omitempty"`
	// Code names the failure for `error`.
	Code string `json:"code,omitempty"`
}

// Event type names.
const (
	EventDelta   = "delta"
	EventMessage = "message"
	EventState   = "state"
	EventError   = "error"
)

// Hub fans events out to everyone watching a conversation: the visitor's own
// stream, and (from step 4) the member who took it over.
//
// It lives in the memory of ONE process. With a second instance, a staff reply
// handled by instance A never reaches a visitor whose SSE connection landed on
// instance B. Redis pub/sub is the fix and `buildLimiter` already shows the
// shape of it — but that is a scaling problem, not today's problem.
// See docs/domains/ai/README.md §10.
type Hub struct {
	mu   sync.RWMutex
	subs map[uuid.UUID]map[chan Event]struct{}
}

// NewHub builds an empty hub.
func NewHub() *Hub {
	return &Hub{subs: map[uuid.UUID]map[chan Event]struct{}{}}
}

// Subscribe registers a listener and returns it with its unsubscribe func.
//
// The channel is buffered: a slow reader must never block the goroutine that
// is streaming the model's answer. If the buffer fills, events for that one
// listener are dropped rather than stalling everyone.
func (h *Hub) Subscribe(id uuid.UUID) (<-chan Event, func()) {
	ch := make(chan Event, 64)
	h.mu.Lock()
	if h.subs[id] == nil {
		h.subs[id] = map[chan Event]struct{}{}
	}
	h.subs[id][ch] = struct{}{}
	h.mu.Unlock()

	return ch, func() {
		h.mu.Lock()
		if set, ok := h.subs[id]; ok {
			if _, still := set[ch]; still {
				delete(set, ch)
				close(ch)
			}
			if len(set) == 0 {
				delete(h.subs, id)
			}
		}
		h.mu.Unlock()
	}
}

// Publish delivers an event to every listener on a conversation.
func (h *Hub) Publish(id uuid.UUID, ev Event) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for ch := range h.subs[id] {
		select {
		case ch <- ev:
		default: // listener is behind; drop rather than block the stream
		}
	}
}

// Watching reports how many listeners a conversation has. Used to decide
// whether anyone is still there before spending tokens on an answer.
func (h *Hub) Watching(id uuid.UUID) int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.subs[id])
}
