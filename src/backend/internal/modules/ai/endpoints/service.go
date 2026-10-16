package endpoints

import (
	"context"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"

	"github.com/velt/backend/internal/modules/ai/provider"
	"github.com/velt/backend/internal/platform/crypto"
)

// ChainSource is the one read running a purpose needs. An interface so a
// caller can supply a fixed chain instead of a database — which is how the
// chain walk and the conversation service are tested, the thing worth testing
// there being the behaviour, not the SQL.
type ChainSource interface {
	ResolveChain(ctx context.Context, purpose string) ([]Resolved, [][]byte, error)
}

// Service owns the endpoints, the chains, and the memory of which link is
// currently rate-limited.
type Service struct {
	repo  *Repository
	chain ChainSource
	aead  *crypto.AEAD

	// cooling remembers, per (provider, model), when a 429 says we may try
	// again. In memory on purpose: it is a hint, not a fact. Losing it on
	// restart costs one rejected request, which the chain then walks past —
	// cheaper than a shared store for a value that is stale within minutes.
	// A deployment running several instances simply learns it per instance.
	mu      sync.Mutex
	cooling map[string]time.Time
}

// NewService wires the service.
func NewService(repo *Repository, aead *crypto.AEAD) *Service {
	return &Service{repo: repo, chain: repo, aead: aead, cooling: map[string]time.Time{}}
}

// NewServiceWithChain builds a service over any chain source. Production uses
// NewService; this exists so a test can run a purpose against a fixed chain.
// Only the running half works — editing endpoints needs the repository.
func NewServiceWithChain(chain ChainSource) *Service {
	return &Service{chain: chain, cooling: map[string]time.Time{}}
}

// --- endpoints ---

// Providers lists the configured endpoints.
func (s *Service) Providers(ctx context.Context) ([]Provider, error) {
	return s.repo.ListProviders(ctx)
}

// CreateProvider adds one, sealing the key if given.
func (s *Service) CreateProvider(ctx context.Context, in CreateProviderRequest) (*Provider, error) {
	in.Label = strings.TrimSpace(in.Label)
	in.BaseURL = strings.TrimSpace(in.BaseURL)
	key, err := s.seal(in.APIKey)
	if err != nil {
		return nil, err
	}
	return s.repo.CreateProvider(ctx, in, key)
}

// UpdateProvider patches one. An absent api_key keeps what is stored; an empty
// string clears it, which is how an operator removes a credential without
// deleting the endpoint.
func (s *Service) UpdateProvider(ctx context.Context, id uuid.UUID, in UpdateProviderRequest) (*Provider, error) {
	if in.Label != nil {
		trimmed := strings.TrimSpace(*in.Label)
		in.Label = &trimmed
	}
	if in.BaseURL != nil {
		trimmed := strings.TrimSpace(*in.BaseURL)
		in.BaseURL = &trimmed
	}
	var key []byte
	setKey := in.APIKey != nil
	if setKey {
		var err error
		if key, err = s.seal(in.APIKey); err != nil {
			return nil, err
		}
	}
	return s.repo.UpdateProvider(ctx, id, in, key, setKey)
}

// DeleteProvider removes an endpoint and every chain step using it.
func (s *Service) DeleteProvider(ctx context.Context, id uuid.UUID) error {
	return s.repo.DeleteProvider(ctx, id)
}

// ReorderProviders rewrites display order.
func (s *Service) ReorderProviders(ctx context.Context, ids []uuid.UUID) error {
	return s.repo.ReorderProviders(ctx, ids)
}

// seal encrypts a key for storage. An empty string stores NULL rather than the
// ciphertext of nothing, so "has a key" stays a straight NULL test.
func (s *Service) seal(secret *string) ([]byte, error) {
	if secret == nil || strings.TrimSpace(*secret) == "" {
		return nil, nil
	}
	return s.aead.Encrypt([]byte(strings.TrimSpace(*secret)))
}

// --- chains ---

// Chain returns a purpose's steps for display.
func (s *Service) Chain(ctx context.Context, purpose string) ([]Step, error) {
	return s.repo.Chain(ctx, purpose)
}

// SetChain replaces a purpose's chain.
func (s *Service) SetChain(ctx context.Context, purpose string, steps []ChainStepInput) error {
	cleaned := make([]ChainStepInput, 0, len(steps))
	for _, st := range steps {
		st.Model = strings.TrimSpace(st.Model)
		if st.Model == "" {
			continue
		}
		cleaned = append(cleaned, st)
	}
	return s.repo.SetChain(ctx, purpose, cleaned)
}

// --- running a purpose ---

// Available returns the chain for a purpose with the keys decrypted and the
// links that are cooling off removed, in priority order.
//
// An empty result means every link is either absent, disabled or rate-limited;
// the caller treats that the way it treats an unconfigured assistant, which is
// to fall back to its scripted answer rather than to fail.
func (s *Service) Available(ctx context.Context, purpose string) ([]Resolved, error) {
	resolved, keys, err := s.chain.ResolveChain(ctx, purpose)
	if err != nil {
		return nil, err
	}
	now := time.Now()
	out := make([]Resolved, 0, len(resolved))
	for i, r := range resolved {
		if s.isCooling(r, now) {
			continue
		}
		if len(keys[i]) > 0 {
			plain, err := s.aead.Decrypt(keys[i])
			if err != nil {
				// A key that will not open is a broken link, not a broken
				// chain: skip it and let the next one answer.
				continue
			}
			r.APIKey = string(plain)
		}
		out = append(out, r)
	}
	return out, nil
}

// coolKey names one link of one chain.
func coolKey(r Resolved) string { return r.ProviderID.String() + "|" + r.Model }

func (s *Service) isCooling(r Resolved, now time.Time) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	until, ok := s.cooling[coolKey(r)]
	if !ok {
		return false
	}
	if now.After(until) {
		delete(s.cooling, coolKey(r))
		return false
	}
	return true
}

// CoolDown parks a link until it is worth trying again. retryAfter comes from
// the provider's own Retry-After header; zero means "it said nothing", and the
// default below is short enough not to strand a chain of one.
func (s *Service) CoolDown(r Resolved, retryAfter time.Duration) {
	if retryAfter <= 0 {
		retryAfter = 60 * time.Second
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.cooling[coolKey(r)] = time.Now().Add(retryAfter)
}

// CoolingUntil reports when a link is free again, for diagnostics. The zero
// time means it is not cooling.
func (s *Service) CoolingUntil(r Resolved) time.Time {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.cooling[coolKey(r)]
}

// ModelsFor asks one endpoint what it offers, so the console can present a
// list instead of asking an operator to type a model id from memory. The
// endpoint is addressed by id: a provider that is switched off still answers,
// because you configure it before you turn it on.
func (s *Service) ModelsFor(ctx context.Context, id uuid.UUID, newClient Client) ([]string, error) {
	providers, err := s.repo.ListProviders(ctx)
	if err != nil {
		return nil, err
	}
	found := false
	for _, p := range providers {
		if p.ID == id {
			found = true
			break
		}
	}
	if !found {
		return nil, ErrNotFound
	}
	cfg, err := s.config(ctx, id)
	if err != nil {
		return nil, err
	}
	return newClient(cfg).Models(ctx)
}

// config rebuilds one endpoint's call configuration, key decrypted.
func (s *Service) config(ctx context.Context, id uuid.UUID) (provider.Config, error) {
	kind, baseURL, key, err := s.repo.ProviderConfig(ctx, id)
	if err != nil {
		return provider.Config{}, err
	}
	cfg := provider.Config{Kind: kind, BaseURL: baseURL}
	if len(key) > 0 {
		plain, err := s.aead.Decrypt(key)
		if err != nil {
			return provider.Config{}, err
		}
		cfg.APIKey = string(plain)
	}
	return cfg, nil
}
