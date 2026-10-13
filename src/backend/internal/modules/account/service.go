package account

import (
	"context"
	"errors"
	"log/slog"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/velt/backend/internal/apperr"
	"github.com/velt/backend/internal/httpx"
	"github.com/velt/backend/internal/platform/activity"
	"github.com/velt/backend/internal/platform/authpolicy"
	"github.com/velt/backend/internal/platform/crypto"
	"github.com/velt/backend/internal/platform/ratelimit"
	"github.com/velt/backend/internal/platform/storage"
	"github.com/velt/backend/internal/platform/token"
)

const (
	maxFullNameRunes = 120

	rlChangePw       = 5
	rlChangePwWindow = 15 * time.Minute
	rl2FA            = 10
	rl2FAWindow      = 15 * time.Minute
	rlAvatar         = 10
	rlAvatarWindow   = time.Minute
)

// SettingsReader is the subset of the settings service account needs (upload
// size cap). Declared here so account stays decoupled from the settings module.
type SettingsReader interface {
	GetInt(ctx context.Context, key string) int
}

// Options configures the account Service.
type Options struct {
	AccessTTL     time.Duration
	RefreshTTL    time.Duration
	Issuer        string // TOTP issuer label (shown in authenticator apps)
	RecoveryCount int    // recovery codes generated on enable/regenerate
	Now           func() time.Time
	Logger        *slog.Logger
}

// Service holds account self-service logic. Every method operates only on the
// caller's own id; sensitive actions re-authenticate and are rate-limited.
type Service struct {
	repo     Repository
	tokens   *token.Manager
	aead     *crypto.AEAD
	limiter  ratelimit.Limiter
	store    storage.Storage
	settings SettingsReader
	now      func() time.Time
	log      *slog.Logger
	// acts is wired after construction (see activity.go) and is allowed to stay
	// nil, which means nothing is recorded.
	acts activity.Recorder

	accessTTL     time.Duration
	refreshTTL    time.Duration
	issuer        string
	recoveryCount int
}

// NewService wires the account service.
func NewService(repo Repository, tokens *token.Manager, aead *crypto.AEAD, limiter ratelimit.Limiter,
	store storage.Storage, settings SettingsReader, opts Options) *Service {
	if opts.Now == nil {
		opts.Now = time.Now
	}
	if opts.Logger == nil {
		opts.Logger = slog.Default()
	}
	if opts.RecoveryCount <= 0 {
		opts.RecoveryCount = 10
	}
	if opts.Issuer == "" {
		opts.Issuer = "Velt"
	}
	return &Service{
		repo: repo, tokens: tokens, aead: aead, limiter: limiter, store: store, settings: settings,
		now: opts.Now, log: opts.Logger,
		accessTTL: opts.AccessTTL, refreshTTL: opts.RefreshTTL,
		issuer: opts.Issuer, recoveryCount: opts.RecoveryCount,
	}
}

// GetProfile returns the caller's profile plus 2FA status.
func (s *Service) GetProfile(ctx context.Context, id *httpx.Identity) (ProfileResponse, error) {
	if id == nil {
		return ProfileResponse{}, apperr.Unauthorized("unauthorized")
	}
	user, err := s.repo.GetUserByID(ctx, id.UserID)
	if errors.Is(err, ErrNotFound) {
		return ProfileResponse{}, apperr.Unauthorized("unauthorized")
	}
	if err != nil {
		return ProfileResponse{}, apperr.Internal()
	}
	tf, err := s.repo.GetTwoFactor(ctx, id.UserID)
	if err != nil && !errors.Is(err, ErrNotFound) {
		return ProfileResponse{}, apperr.Internal()
	}
	resp := ProfileResponse{User: toUserResponse(user, s.avatarURL(ctx, user.AvatarPath))}
	if tf.Enabled() {
		resp.TwoFactorEnabled = true
		n := tf.UnusedRecoveryCount()
		resp.RecoveryCodesRemaining = &n
	}
	return resp, nil
}

// UpdateProfile changes the caller's full_name (trimmed; 1–120 runes).
func (s *Service) UpdateProfile(ctx context.Context, id *httpx.Identity, req UpdateProfileRequest) (UserResponse, error) {
	if id == nil {
		return UserResponse{}, apperr.Unauthorized("unauthorized")
	}
	name := strings.TrimSpace(req.FullName)
	if name == "" {
		return UserResponse{}, apperr.Validation(map[string]string{"full_name": "required"})
	}
	if utf8.RuneCountInString(name) > maxFullNameRunes {
		return UserResponse{}, apperr.Validation(map[string]string{"full_name": "too_long"})
	}
	user, err := s.repo.GetUserByID(ctx, id.UserID)
	if err != nil {
		return UserResponse{}, apperr.Internal()
	}
	if err := s.repo.UpdateFullName(ctx, id.UserID, name); err != nil {
		return UserResponse{}, apperr.Internal()
	}
	if name != user.FullName {
		// Only a real change is worth a row: saving the form unedited is not
		// something anyone has to account for. The old name is kept because the
		// point of the entry is that this person used to be called that.
		s.record(ctx, id, actionProfileUpdated, map[string]any{
			"field": "full_name", "from": user.FullName, "to": name,
		})
	}
	user.FullName = name
	return toUserResponse(user, s.avatarURL(ctx, user.AvatarPath)), nil
}

// ChangePassword verifies the current password, sets a new one, revokes all
// sessions, and issues a fresh session for the current device (so the caller
// stays logged in here while other devices are logged out).
func (s *Service) ChangePassword(ctx context.Context, id *httpx.Identity, req ChangePasswordRequest, meta RequestMeta) (ChangePasswordResult, error) {
	if id == nil {
		return ChangePasswordResult{}, apperr.Unauthorized("unauthorized")
	}
	if err := s.allow(ctx, "account:chpw:user:"+id.UserID.String(), rlChangePw, rlChangePwWindow); err != nil {
		return ChangePasswordResult{}, err
	}
	user, err := s.repo.GetUserByID(ctx, id.UserID)
	if err != nil {
		return ChangePasswordResult{}, apperr.Internal()
	}
	if ok, _ := crypto.VerifyPassword(req.CurrentPassword, user.PasswordHash); !ok {
		s.sec(ctx).Warn("change-password: wrong current password", "user_id", id.UserID)
		return ChangePasswordResult{}, apperr.Unauthorized("invalid_credentials")
	}
	if key, ok := authpolicy.ValidatePassword(req.NewPassword); !ok {
		return ChangePasswordResult{}, apperr.Validation(map[string]string{"new_password": key})
	}
	if same, _ := crypto.VerifyPassword(req.NewPassword, user.PasswordHash); same {
		return ChangePasswordResult{}, apperr.Unprocessable("password_unchanged")
	}

	hash, err := crypto.HashPassword(req.NewPassword)
	if err != nil {
		return ChangePasswordResult{}, apperr.Internal()
	}
	now := s.now()
	raw, sess, err := s.buildSession(id.UserID, meta, now)
	if err != nil {
		return ChangePasswordResult{}, apperr.Internal()
	}
	if err := s.repo.ApplyPasswordChange(ctx, id.UserID, hash, now, sess); err != nil {
		return ChangePasswordResult{}, apperr.Internal()
	}
	access, err := s.tokens.NewAccess(id.UserID, id.Roles, id.Permissions)
	if err != nil {
		return ChangePasswordResult{}, apperr.Internal()
	}
	// The new password is not in the metadata and never will be; that this
	// account's password moved, and when, is the whole of what is recorded.
	s.record(ctx, id, actionPasswordChanged, nil)
	s.sec(ctx).Info("password changed", "user_id", id.UserID)
	return ChangePasswordResult{
		AccessToken:      access,
		ExpiresIn:        int(s.accessTTL.Seconds()),
		RefreshToken:     raw,
		RefreshExpiresAt: sess.ExpiresAt,
	}, nil
}

func (s *Service) buildSession(userID uuid.UUID, meta RequestMeta, now time.Time) (string, *Session, error) {
	raw, err := crypto.RandomToken(32)
	if err != nil {
		return "", nil, err
	}
	sess := &Session{
		ID:               uuid.New(),
		UserID:           userID,
		RefreshTokenHash: crypto.HashToken(raw),
		UserAgent:        strPtr(meta.UserAgent),
		IP:               strPtr(meta.IP),
		CreatedAt:        now,
		ExpiresAt:        now.Add(s.refreshTTL),
	}
	return raw, sess, nil
}

// allow consults the rate limiter and FAILS CLOSED — account actions are
// sensitive (re-auth surfaces), so a limiter outage must deny, not allow.
func (s *Service) allow(ctx context.Context, key string, limit int, window time.Duration) error {
	ok, retryAfter, err := s.limiter.Allow(ctx, key, limit, window)
	if err != nil {
		s.sec(ctx).Error("rate limiter error", "err", err)
		return apperr.RateLimited(1)
	}
	if !ok {
		return apperr.RateLimited(retryAfter)
	}
	return nil
}

func (s *Service) sec(ctx context.Context) *slog.Logger {
	return s.log.With("correlation_id", httpx.CorrelationIDFromContext(ctx))
}

func (s *Service) avatarURL(ctx context.Context, path *string) *string {
	if path == nil || *path == "" {
		return nil
	}
	u := s.store.URL(ctx, *path)
	return &u
}

func strPtr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
