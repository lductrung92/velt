package settings

import (
	"context"
	"encoding/json"
	"log/slog"
	"strings"
	"time"

	"github.com/velt/backend/internal/apperr"
	"github.com/velt/backend/internal/httpx"
	"github.com/velt/backend/internal/platform/activity"
	"github.com/velt/backend/internal/platform/crypto"
	"github.com/velt/backend/internal/platform/mail"
	"github.com/velt/backend/internal/platform/ratelimit"
)

const (
	permRead   = "settings.read"
	permManage = "settings.manage"

	rlTestEmailPerUser = 5
	rlTestEmailWindow  = time.Minute
)

// Options configures the settings Service.
type Options struct {
	Now    func() time.Time
	Logger *slog.Logger
}

// Service holds settings business logic: registry-validated reads/writes,
// secret encryption, read-through cache, and the SMTP test utility. All
// authorization is enforced here in the service layer.
type Service struct {
	repo     Repository
	cache    Cache
	aead     *crypto.AEAD
	registry *Registry
	limiter  ratelimit.Limiter
	tester   mail.Tester
	now      func() time.Time
	log      *slog.Logger
	// acts is wired after construction (see activity.go) and is allowed to stay
	// nil, which means nothing is recorded.
	acts activity.Recorder
	// text is wired after construction too and may stay nil: without it the
	// public read serves every setting in the language it was typed in.
	text TranslatedTextPort
}

// NewService wires the settings service.
func NewService(repo Repository, cache Cache, aead *crypto.AEAD, registry *Registry,
	limiter ratelimit.Limiter, tester mail.Tester, opts Options) *Service {
	if opts.Now == nil {
		opts.Now = time.Now
	}
	if opts.Logger == nil {
		opts.Logger = slog.Default()
	}
	return &Service{
		repo: repo, cache: cache, aead: aead, registry: registry,
		limiter: limiter, tester: tester, now: opts.Now, log: opts.Logger,
	}
}

// GetAll returns every registry key grouped, with secrets masked. Requires
// settings.read.
func (s *Service) GetAll(ctx context.Context, id *httpx.Identity) (GroupedView, error) {
	if id == nil || !id.Has(permRead) {
		return nil, apperr.AccessDenied("access_denied")
	}
	snap, err := s.loadSnapshot(ctx)
	if err != nil {
		return nil, apperr.Internal()
	}
	return s.buildView(snap), nil
}

// GetPublic returns only is_public keys' effective values (no auth required).
//
// `locale` picks the language of the keys that carry words rather than
// configuration — the site's header and footer copy. Everything else is the
// same in every language, and an empty locale, an unknown one, or a key with no
// translation all leave the stored value standing.
func (s *Service) GetPublic(ctx context.Context, locale string) (map[string]any, error) {
	snap, err := s.loadSnapshot(ctx)
	if err != nil {
		return nil, apperr.Internal()
	}
	out := make(map[string]any)
	for _, key := range s.registry.Keys() {
		def, _ := s.registry.Get(key)
		if !def.IsPublic {
			continue
		}
		out[key] = s.effectiveValue(def, snap)
	}
	s.overlayTranslations(ctx, out, locale)
	return out, nil
}

// TranslatedTextPort hands back one language's copy of the translatable public
// settings, keyed by SETTINGS KEY. It is satisfied by the translation module and
// may be nil — nil, like a locale with nothing stored, means "serve what is
// stored", which is the base language.
type TranslatedTextPort interface {
	PublicText(ctx context.Context, locale string) map[string]any
}

// SetTranslatedText wires that port (called once at startup).
func (s *Service) SetTranslatedText(p TranslatedTextPort) { s.text = p }

func (s *Service) overlayTranslations(ctx context.Context, out map[string]any, locale string) {
	if s.text == nil || strings.TrimSpace(locale) == "" {
		return
	}
	for key, value := range s.text.PublicText(ctx, locale) {
		if _, ok := out[key]; !ok {
			continue // never introduce a key the registry does not publish
		}
		if text, ok := value.(string); ok && strings.TrimSpace(text) != "" {
			out[key] = text
		}
	}
}

// auditEntry records one applied change for the security log (never secret values).
type auditEntry struct {
	key    string
	secret bool
	action string // secret: "changed"|"removed"
	oldVal any
	newVal any
}

// Update applies per-key changes (set/delete) with registry + cross-key
// validation, encrypting secrets, invalidating the cache AFTER commit, and
// auditing. Requires settings.manage.
func (s *Service) Update(ctx context.Context, id *httpx.Identity, updates map[string]json.RawMessage) (GroupedView, error) {
	if id == nil || !id.Has(permManage) {
		return nil, apperr.AccessDenied("access_denied")
	}
	snap, err := s.loadSnapshot(ctx)
	if err != nil {
		return nil, apperr.Internal()
	}

	// merged effective state for cross-key validation (non-secret keys only).
	merged := make(map[string]any)
	for _, key := range s.registry.Keys() {
		if def, _ := s.registry.Get(key); !def.IsSecret {
			merged[key] = s.effectiveValue(def, snap)
		}
	}

	var ops []writeOp
	var audits []auditEntry
	fields := make(map[string]string)

	for key, raw := range updates {
		def, ok := s.registry.Get(key)
		if !ok {
			return nil, unknownKeyErr(key)
		}
		op, audit, reason, err := s.planChange(def, snap, raw)
		if err != nil {
			return nil, apperr.Internal()
		}
		if reason != "" {
			fields[key] = reason
			continue
		}
		ops = append(ops, op)
		audits = append(audits, audit)
		if !def.IsSecret {
			merged[key] = audit.newVal
		}
	}
	if len(fields) > 0 {
		return nil, apperr.Validation(fields)
	}
	if xerrs := validateCrossKey(merged); len(xerrs) > 0 {
		return nil, apperr.Validation(xerrs)
	}

	if err := s.repo.Apply(ctx, ops, id.UserID); err != nil {
		return nil, apperr.Internal()
	}
	// Invalidate ONLY after the write commits, so a concurrent reader can't
	// repopulate the cache with the pre-commit value (business-rules §5.2).
	s.cache.Invalidate(ctx)
	s.audit(ctx, id, audits)

	snap, err = s.loadSnapshot(ctx)
	if err != nil {
		return nil, apperr.Internal()
	}
	return s.buildView(snap), nil
}

// GroupView returns the registry entries for a single group (secrets masked),
// WITHOUT any auth check — the caller scopes access (e.g. the CMS module gates
// cms.settings.read before calling for the "cms" group). An unknown/empty group
// yields an empty list, not nil.
func (s *Service) GroupView(ctx context.Context, group string) (GroupedView, error) {
	snap, err := s.loadSnapshot(ctx)
	if err != nil {
		return nil, apperr.Internal()
	}
	entries := s.buildView(snap)[group]
	if entries == nil {
		entries = []map[string]any{}
	}
	return GroupedView{group: entries}, nil
}

// UpdateScoped applies updates WITHOUT re-checking settings.manage, and ONLY for
// keys under one of allowPrefixes (e.g. "cms."). It lets a module that gates its
// own permission (the CMS module gates cms.settings.manage) write its slice of
// the shared registry without holding the global settings.manage. Keys under no
// allowed prefix — or unknown to the registry — fail with 422
// unknown_setting_key. A module owning more than one prefix passes them all.
//
// Cross-key validation is intentionally skipped: it only covers the foundation
// storage keys, and a scoped group (cms.*) carries no inter-key constraints, so
// running it could spuriously block a flag write when storage is misconfigured.
// The original Update (gated settings.manage) remains for System Settings.
func (s *Service) UpdateScoped(ctx context.Context, id *httpx.Identity, updates map[string]json.RawMessage, allowPrefixes ...string) (GroupedView, error) {
	if id == nil {
		return nil, apperr.Unauthorized("unauthorized")
	}
	snap, err := s.loadSnapshot(ctx)
	if err != nil {
		return nil, apperr.Internal()
	}

	var ops []writeOp
	var audits []auditEntry
	fields := make(map[string]string)

	for key, raw := range updates {
		if !hasAnyPrefix(key, allowPrefixes) {
			return nil, unknownKeyErr(key)
		}
		def, ok := s.registry.Get(key)
		if !ok {
			return nil, unknownKeyErr(key)
		}
		op, audit, reason, err := s.planChange(def, snap, raw)
		if err != nil {
			return nil, apperr.Internal()
		}
		if reason != "" {
			fields[key] = reason
			continue
		}
		ops = append(ops, op)
		audits = append(audits, audit)
	}
	if len(fields) > 0 {
		return nil, apperr.Validation(fields)
	}
	if len(ops) == 0 {
		return s.buildView(snap), nil
	}

	if err := s.repo.Apply(ctx, ops, id.UserID); err != nil {
		return nil, apperr.Internal()
	}
	s.cache.Invalidate(ctx) // after commit (same ordering rationale as Update)
	s.audit(ctx, id, audits)

	snap, err = s.loadSnapshot(ctx)
	if err != nil {
		return nil, apperr.Internal()
	}
	return s.buildView(snap), nil
}

// planChange turns one raw update into a write op + audit entry, or a field
// reason key on validation failure.
func (s *Service) planChange(def SettingDef, snap snapshot, raw json.RawMessage) (writeOp, auditEntry, string, error) {
	if isJSONNull(raw) { // explicit null → delete (revert to default)
		if def.IsSecret {
			return writeOp{Key: def.Key, Kind: opDelete}, auditEntry{key: def.Key, secret: true, action: "removed"}, "", nil
		}
		return writeOp{Key: def.Key, Kind: opDelete},
			auditEntry{key: def.Key, oldVal: s.effectiveValue(def, snap), newVal: def.Default}, "", nil
	}

	val, reason := def.validate(raw)
	if reason != "" {
		return writeOp{}, auditEntry{}, reason, nil
	}

	if def.IsSecret {
		secret := val.(string)
		// An empty secret is meaningless: treat "" as unset (delete) so is_set
		// reflects reality, rather than storing ciphertext of "" with is_set=true.
		if secret == "" {
			return writeOp{Key: def.Key, Kind: opDelete},
				auditEntry{key: def.Key, secret: true, action: "removed"}, "", nil
		}
		ct, err := s.aead.Encrypt([]byte(secret))
		if err != nil {
			return writeOp{}, auditEntry{}, "", err
		}
		return writeOp{Key: def.Key, Kind: opSetEncrypted, Encrypted: ct},
			auditEntry{key: def.Key, secret: true, action: "changed"}, "", nil
	}

	b, err := json.Marshal(val)
	if err != nil {
		return writeOp{}, auditEntry{}, "", err
	}
	return writeOp{Key: def.Key, Kind: opSetValue, Value: b},
		auditEntry{key: def.Key, oldVal: s.effectiveValue(def, snap), newVal: val}, "", nil
}

// TestEmail sends a probe email using the STORED SMTP config. Requires
// settings.manage and is rate-limited per user.
func (s *Service) TestEmail(ctx context.Context, id *httpx.Identity, to string) error {
	if id == nil || !id.Has(permManage) {
		return apperr.AccessDenied("access_denied")
	}
	// Fail CLOSED: a limiter outage must not allow unbounded probe emails to be
	// sent to arbitrary addresses (the limit exists precisely to bound this).
	ok, retry, err := s.limiter.Allow(ctx, "settings:test-email:user:"+id.UserID.String(), rlTestEmailPerUser, rlTestEmailWindow)
	if err != nil {
		s.sec(ctx).Error("test-email limiter error", "err", err)
		return apperr.RateLimited(1)
	}
	if !ok {
		return apperr.RateLimited(retry)
	}

	snap, err := s.loadSnapshot(ctx)
	if err != nil {
		return apperr.Internal()
	}
	cfg := mail.SMTPConfig{
		Host:     s.getString(snap, "mail.smtp_host"),
		Port:     s.getInt(snap, "mail.smtp_port"),
		Username: s.getString(snap, "mail.smtp_user"),
		Password: s.getSecret(ctx, snap, "mail.smtp_password"),
		From:     s.getString(snap, "mail.from_address"),
	}
	if cfg.Host == "" {
		return apperr.BadGateway("smtp_test_failed", mail.ReasonNotConfigured)
	}
	if reason := s.tester.Test(ctx, cfg, to); reason != "" {
		s.sec(ctx).Warn("smtp test failed", "reason", reason)
		return apperr.BadGateway("smtp_test_failed", reason)
	}
	s.recordEmailTest(ctx, id, to)
	return nil
}

func (s *Service) audit(ctx context.Context, id *httpx.Identity, audits []auditEntry) {
	for _, a := range audits {
		lg := s.sec(ctx).With("setting_key", a.key, "actor", id.UserID)
		if a.secret {
			lg.Info("setting changed", "change", a.action) // never log secret values
		} else {
			lg.Info("setting changed", "old", a.oldVal, "new", a.newVal)
		}
	}
	// Both write paths (Update and UpdateScoped) land here, so this is the one
	// place the activity row has to be written from.
	s.recordUpdate(ctx, id, audits)
}

func (s *Service) sec(ctx context.Context) *slog.Logger {
	return s.log.With("correlation_id", httpx.CorrelationIDFromContext(ctx))
}

func unknownKeyErr(key string) *apperr.AppError {
	ae := apperr.Unprocessable("unknown_setting_key")
	ae.Details = map[string]any{"key": key}
	return ae
}

func isJSONNull(raw json.RawMessage) bool {
	return strings.TrimSpace(string(raw)) == "null"
}

// validateCrossKey enforces inter-key constraints on the MERGED state.
func validateCrossKey(merged map[string]any) map[string]string {
	errs := make(map[string]string)
	if asString(merged["storage.driver"]) == "s3" {
		// S3 needs at least a bucket, an endpoint, and an access key to talk to
		// the gateway (the secret is write-only and may already be stored).
		for _, k := range []string{"storage.s3_bucket", "storage.s3_endpoint", "storage.s3_access_key"} {
			if asString(merged[k]) == "" {
				errs[k] = "required"
			}
		}
	}
	return errs
}

func asString(v any) string {
	s, _ := v.(string)
	return s
}

// hasAnyPrefix reports whether key sits under one of the allowed prefixes. No
// prefixes means nothing is writable, which is the safe reading of "scoped".
func hasAnyPrefix(key string, prefixes []string) bool {
	for _, p := range prefixes {
		if strings.HasPrefix(key, p) {
			return true
		}
	}
	return false
}
