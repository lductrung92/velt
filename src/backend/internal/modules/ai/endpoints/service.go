package endpoints

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"

	"github.com/velt/backend/internal/apperr"

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
	// passwords re-checks the operator's own password before stored keys are
	// shown. Optional at construction so a test can build a service without
	// a users table; RevealKeys refuses when it is missing.
	passwords PasswordPort
	// activity records that a credential was read. Optional; see activity.go.
	activity Recorder

	// cooling remembers, per (provider, model, key), when a 429 says we may try
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
	list, err := s.repo.ListProviders(ctx)
	if err != nil {
		return nil, err
	}
	// Keys are write-only on the wire, so without a count the operator has no
	// way to tell whether three keys are stored or one. The count is the only
	// thing about a key this list reveals.
	sealed, err := s.repo.SealedKeys(ctx)
	if err != nil {
		return nil, err
	}
	for i := range list {
		blob, ok := sealed[list[i].ID]
		if !ok {
			continue
		}
		plain, err := s.aead.Decrypt(blob)
		if err != nil {
			// A key that will not open counts as none: saying "1 key" about
			// something unusable would send the operator looking elsewhere.
			continue
		}
		list[i].KeyCount = len(splitKeys(string(plain)))
	}
	return list, nil
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

// PasswordPort re-checks the signed-in person's own password.
//
// An interface rather than a users repository: this module has no business
// reading the users table, and the only question it ever asks is "is this the
// password of the person already holding this session".
type PasswordPort interface {
	Verify(ctx context.Context, userID uuid.UUID, password string) (bool, error)
}

// SetPasswords supplies the re-authentication port. Absent, RevealKeys refuses
// — a reveal that cannot verify must not fall back to showing the keys.
func (s *Service) SetPasswords(p PasswordPort) { s.passwords = p }

// RevealKeys returns one endpoint's stored keys in plaintext.
//
// Guarded three ways, and all three are needed: the caller must hold the
// settings permission (so it is an administrator), must re-enter their own
// password (so it is the administrator and not a borrowed screen), and the
// handler rate-limits the attempt (so the password cannot be guessed through
// this door). The caller is also responsible for recording it: reading a
// credential is an event somebody may later need to account for.
func (s *Service) RevealKeys(ctx context.Context, userID uuid.UUID, id uuid.UUID,
	password string,
) ([]string, error) {
	if s.passwords == nil {
		return nil, apperr.Internal()
	}
	ok, err := s.passwords.Verify(ctx, userID, password)
	if err != nil {
		return nil, apperr.Internal()
	}
	if !ok {
		// Deliberately the same shape as a wrong password anywhere else: this
		// endpoint must not become a way to probe which accounts exist or
		// which endpoints hold keys.
		return nil, apperr.Validation(map[string]string{"password": "invalid"})
	}

	_, _, blob, err := s.repo.ProviderConfig(ctx, id)
	if err != nil {
		return nil, err
	}
	if len(blob) == 0 {
		return []string{}, nil
	}
	plain, err := s.aead.Decrypt(blob)
	if err != nil {
		return nil, apperr.Internal()
	}
	return splitKeys(string(plain)), nil
}

// --- running a purpose ---

// Available returns the chain for a purpose with the keys decrypted and the
// links that are cooling off removed, in priority order.
//
// An empty result means every link is either absent, disabled or rate-limited;
// the caller treats that the way it treats an unconfigured assistant, which is
// to fall back to its scripted answer rather than to fail.
// An endpoint may hold SEVERAL keys, one per line, and each becomes its own
// link. That is the whole of the multi-key feature: Stream already walks the
// chain, already moves on when a link is rate-limited, and already refuses to
// move on once the answer has started. Expanding keys into links reuses all of
// that instead of growing a second, subtly different retry loop beside it.
//
// Order is preserved, so the keys run in the order they were typed.
func (s *Service) Available(ctx context.Context, purpose string) ([]Resolved, error) {
	resolved, keys, err := s.chain.ResolveChain(ctx, purpose)
	if err != nil {
		return nil, err
	}
	now := time.Now()
	out := make([]Resolved, 0, len(resolved))
	for i, r := range resolved {
		if len(keys[i]) == 0 {
			// No key at all is legitimate: a local endpoint usually has none.
			if !s.isCooling(r, now) {
				out = append(out, r)
			}
			continue
		}
		plain, err := s.aead.Decrypt(keys[i])
		if err != nil {
			// A key that will not open is a broken link, not a broken chain:
			// skip it and let the next one answer.
			continue
		}
		for _, k := range splitKeys(string(plain)) {
			link := r
			link.APIKey = k
			link.KeyID = keyFingerprint(k)
			// Checked per key, not per endpoint: one key hitting its quota
			// must not park the others sitting behind it.
			if s.isCooling(link, now) {
				continue
			}
			out = append(out, link)
		}
	}
	return out, nil
}

// splitKeys reads the newline-separated list the console stores in one field.
//
// Blank lines and stray whitespace are the normal result of pasting keys in,
// and duplicates would waste a retry on a quota that is already spent, so both
// are dropped here rather than being somebody else's problem.
func splitKeys(raw string) []string {
	seen := make(map[string]bool)
	out := []string{}
	for _, line := range strings.Split(raw, "\n") {
		k := strings.TrimSpace(line)
		if k == "" || seen[k] {
			continue
		}
		seen[k] = true
		out = append(out, k)
	}
	return out
}

// keyFingerprint identifies a key without being one.
//
// It ends up in the cooldown map and in logs, so it must not be the key
// itself; eight hex characters of a SHA-256 are enough to tell a handful of
// keys apart and reveal nothing about any of them. It is also stable across
// reordering, so moving a line in the textarea does not resurrect a key that
// is still rate-limited.
func keyFingerprint(key string) string {
	sum := sha256.Sum256([]byte(key))
	return hex.EncodeToString(sum[:4])
}

// coolKey names one link of one chain: an endpoint, a model, and — when the
// endpoint has several — which key.
func coolKey(r Resolved) string {
	return r.ProviderID.String() + "|" + r.Model + "|" + r.KeyID
}

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
