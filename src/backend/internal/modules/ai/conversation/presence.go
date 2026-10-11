package conversation

import (
	"sync"
	"time"

	"github.com/google/uuid"
)

// presenceTTL is how long a heartbeat counts for. The console pings well
// inside this, so a closed laptop drops off on its own without needing a
// goodbye that may never arrive.
const presenceTTL = 90 * time.Second

// Presence tracks who is on duty.
//
// It answers one question the assistant genuinely needs: if a visitor asks for
// a person, is there one? Telling them to hold when the office is empty is
// worse than saying so.
//
// Like the Hub, this lives in one process's memory. With two instances each
// knows only its own staff, so "nobody is on duty" could be wrong. Same fix,
// same note: Redis. See docs/domains/ai/README.md §10.
type Presence struct {
	mu   sync.RWMutex
	seen map[uuid.UUID]time.Time
	now  func() time.Time
}

// NewPresence builds an empty duty roster.
func NewPresence() *Presence {
	return &Presence{seen: map[uuid.UUID]time.Time{}, now: time.Now}
}

// Beat records that a user is at their desk.
func (p *Presence) Beat(userID uuid.UUID) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.seen[userID] = p.now()
	// Opportunistic sweep: presence is small and churny, so cleaning on write
	// avoids needing a goroutine that outlives everything.
	for id, at := range p.seen {
		if p.now().Sub(at) > presenceTTL {
			delete(p.seen, id)
		}
	}
}

// Leave removes a user immediately, for an explicit sign-off.
func (p *Presence) Leave(userID uuid.UUID) {
	p.mu.Lock()
	defer p.mu.Unlock()
	delete(p.seen, userID)
}

// AnyOnline reports whether at least one person is on duty.
func (p *Presence) AnyOnline() bool {
	p.mu.RLock()
	defer p.mu.RUnlock()
	for _, at := range p.seen {
		if p.now().Sub(at) <= presenceTTL {
			return true
		}
	}
	return false
}

// Count returns how many people are on duty.
func (p *Presence) Count() int {
	p.mu.RLock()
	defer p.mu.RUnlock()
	n := 0
	for _, at := range p.seen {
		if p.now().Sub(at) <= presenceTTL {
			n++
		}
	}
	return n
}
