package auth

import (
	"context"
	"errors"
	"log/slog"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/velt/backend/internal/apperr"
	"github.com/velt/backend/internal/httpx"
	"github.com/velt/backend/internal/platform/activity"
	"github.com/velt/backend/internal/platform/crypto"
	"github.com/velt/backend/internal/platform/mail"
	"github.com/velt/backend/internal/platform/ratelimit"
	"github.com/velt/backend/internal/platform/storage"
	"github.com/velt/backend/internal/platform/token"
)

// Rate-limit policy (ephemeral, per IP/email). The durable lockout counter is
// separate (users.failed_login_count). Tunable here as policy constants.
const (
	rlLoginPerIP     = 20
	rlLoginPerEmail  = 10
	rlLoginWindow    = time.Minute
	rl2FAPerIP       = 10
	rl2FAWindow      = time.Minute
	rl2FAPerUser     = 10
	rl2FAUserWindow  = 15 * time.Minute
	rlRefreshPerIP   = 60
	rlRefreshWindow  = time.Minute
	rlForgotPerEmail = 5
	rlForgotPerIP    = 20
	rlForgotWindow   = 15 * time.Minute
	rlResetPerIP     = 20
	rlResetWindow    = time.Minute
)

// Options configures the auth Service. Durations/limits come from config.
type Options struct {
	AccessTTL       time.Duration
	RefreshTTL      time.Duration
	ResetTTL        time.Duration
	MaxFailedLogins int
	LockoutBase     time.Duration
	SessionCap      int
	AppBaseURL      string
	Now             func() time.Time
	Logger          *slog.Logger
	// Dispatch runs a background task (e.g. sending email off the request path).
	// Defaults to `go fn()`; tests inject a synchronous runner.
	Dispatch func(func())
}

// Service holds all auth business logic. It is the only layer that enforces
// authentication/authorization rules.
type Service struct {
	repo     Repository
	tokens   *token.Manager
	rl       ratelimit.Limiter
	mailer   mail.Mailer
	aead     *crypto.AEAD
	files    storage.URLer
	now      func() time.Time
	log      *slog.Logger
	dispatch func(func())
	// acts is wired after construction (see activity.go) and is allowed to stay
	// nil, which means nothing is recorded.
	acts activity.Recorder

	accessTTL   time.Duration
	refreshTTL  time.Duration
	resetTTL    time.Duration
	maxFailed   int
	lockoutBase time.Duration
	sessionCap  int
	appBaseURL  string
}

// NewService wires the auth service with its dependencies.
func NewService(repo Repository, tokens *token.Manager, rl ratelimit.Limiter,
	mailer mail.Mailer, aead *crypto.AEAD, files storage.URLer, opts Options) *Service {
	if opts.Now == nil {
		opts.Now = time.Now
	}
	if opts.Logger == nil {
		opts.Logger = slog.Default()
	}
	if opts.Dispatch == nil {
		opts.Dispatch = func(fn func()) { go fn() }
	}
	return &Service{
		repo: repo, tokens: tokens, rl: rl, mailer: mailer, aead: aead, files: files,
		now: opts.Now, log: opts.Logger, dispatch: opts.Dispatch,
		accessTTL: opts.AccessTTL, refreshTTL: opts.RefreshTTL, resetTTL: opts.ResetTTL,
		maxFailed: opts.MaxFailedLogins, lockoutBase: opts.LockoutBase,
		sessionCap: opts.SessionCap, appBaseURL: strings.TrimRight(opts.AppBaseURL, "/"),
	}
}

// dummyHash is a precomputed argon2id hash used to keep the timing of an
// unknown-email login indistinguishable from a wrong-password login (anti
// user-enumeration). Computed once, lazily.
var (
	dummyHash     string
	dummyHashOnce sync.Once
)

func getDummyHash() string {
	dummyHashOnce.Do(func() {
		h, err := crypto.HashPassword("timing-mitigation-placeholder")
		if err == nil {
			dummyHash = h
		}
	})
	return dummyHash
}

// Login performs the password step. On success without 2FA it returns a full
// LoginResult; with 2FA it returns a challenge. Wrong email and wrong password
// are indistinguishable (401 invalid_credentials).
func (s *Service) Login(ctx context.Context, req LoginRequest, meta RequestMeta) (LoginResult, error) {
	if err := s.allow(ctx, "login:ip:"+meta.IP, rlLoginPerIP, rlLoginWindow, true); err != nil {
		return LoginResult{}, err
	}
	if err := s.allow(ctx, "login:email:"+strings.ToLower(req.Email), rlLoginPerEmail, rlLoginWindow, true); err != nil {
		return LoginResult{}, err
	}

	user, err := s.repo.GetUserByEmail(ctx, req.Email)
	if errors.Is(err, ErrNotFound) {
		_, _ = crypto.VerifyPassword(req.Password, getDummyHash()) // constant-time mitigation
		s.recordSignInFailure(ctx, req.Email, nil, reasonUnknownEmail)
		return LoginResult{}, apperr.Unauthorized("invalid_credentials")
	}
	if err != nil {
		return LoginResult{}, apperr.Internal()
	}

	ok, err := crypto.VerifyPassword(req.Password, user.PasswordHash)
	if err != nil || !ok {
		s.recordSignInFailure(ctx, req.Email, user, reasonBadPassword)
		s.registerFailedLogin(ctx, user)
		return LoginResult{}, apperr.Unauthorized("invalid_credentials")
	}

	now := s.now()
	// Only reveal lock/disabled state to someone who proved the password.
	if user.LockedUntil != nil && user.LockedUntil.After(now) {
		s.recordSignInFailure(ctx, req.Email, user, reasonAccountLocked)
		return LoginResult{}, apperr.Unauthorized("account_locked")
	}
	if user.Status != statusActive {
		s.recordSignInFailure(ctx, req.Email, user, reasonAccountOff)
		return LoginResult{}, apperr.AccessDenied("account_disabled")
	}

	tf, err := s.repo.GetTwoFactor(ctx, user.ID)
	if err != nil && !errors.Is(err, ErrNotFound) {
		return LoginResult{}, apperr.Internal()
	}
	if tf.Enabled() {
		challenge, err := s.tokens.New2FAChallenge(user.ID)
		if err != nil {
			return LoginResult{}, apperr.Internal()
		}
		return LoginResult{TwoFactorRequired: true, ChallengeToken: challenge}, nil
	}

	return s.completeLogin(ctx, user, meta, methodPassword)
}

// completeLogin marks the login successful, issues an access token, and creates
// a refresh session (enforcing the per-user session cap). method says which
// step produced the session, for the activity row.
func (s *Service) completeLogin(ctx context.Context, user *User, meta RequestMeta, method string) (LoginResult, error) {
	now := s.now()
	if err := s.repo.MarkLoginSuccess(ctx, user.ID, now); err != nil {
		return LoginResult{}, apperr.Internal()
	}
	roles, perms, err := s.repo.GetRolesAndPermissions(ctx, user.ID)
	if err != nil {
		return LoginResult{}, apperr.Internal()
	}
	access, err := s.tokens.NewAccess(user.ID, roles, perms)
	if err != nil {
		return LoginResult{}, apperr.Internal()
	}
	raw, sess, err := s.newSession(ctx, user.ID, meta, now)
	if err != nil {
		return LoginResult{}, apperr.Internal()
	}
	s.sec(ctx).Info("login success", "user_id", user.ID)
	// The session exists now, so the sign-in is a fact worth accounting for.
	// The actor and the entity are the same person on purpose: "who did this"
	// and "whose account was it done to" are asked separately of every row.
	e := userEntry(actionSignIn, user)
	e.Metadata = map[string]any{"method": method}
	s.record(ctx, actor(user.ID), e)
	return LoginResult{
		AccessToken:      access,
		ExpiresIn:        int(s.accessTTL.Seconds()),
		User:             toUserResponse(user, s.avatarURL(ctx, user.AvatarPath)),
		RefreshToken:     raw,
		RefreshExpiresAt: sess.ExpiresAt,
	}, nil
}

func (s *Service) newSession(ctx context.Context, userID uuid.UUID, meta RequestMeta, now time.Time) (string, *Session, error) {
	cnt, err := s.repo.CountActiveSessions(ctx, userID, now)
	if err != nil {
		return "", nil, err
	}
	if cnt >= s.sessionCap {
		if err := s.repo.RevokeOldestActiveSession(ctx, userID, now); err != nil {
			return "", nil, err
		}
	}
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
	if err := s.repo.CreateSession(ctx, sess); err != nil {
		return "", nil, err
	}
	return raw, sess, nil
}

func (s *Service) registerFailedLogin(ctx context.Context, user *User) {
	newCount := user.FailedLoginCount + 1
	var lockedUntil *time.Time
	if newCount >= s.maxFailed {
		t := s.now().Add(s.lockoutBackoff(newCount))
		lockedUntil = &t
	}
	if err := s.repo.IncrementFailedLogin(ctx, user.ID, lockedUntil); err != nil {
		s.sec(ctx).Error("increment failed login", "err", err)
	}
	if lockedUntil != nil {
		s.recordLockout(ctx, user, newCount, *lockedUntil)
	}
	s.sec(ctx).Warn("login failed", "user_id", user.ID, "locked", lockedUntil != nil)
}

// lockoutBackoff returns the lock duration for a failure count at/over the
// threshold: exponential (base, base*2, base*4, ...) capped at 1 hour.
func (s *Service) lockoutBackoff(count int) time.Duration {
	exp := count - s.maxFailed
	if exp < 0 {
		exp = 0
	}
	if exp > 6 {
		exp = 6
	}
	d := s.lockoutBase << uint(exp)
	if d > time.Hour {
		d = time.Hour
	}
	return d
}

// allow consults the rate limiter. On a limiter error, failClosed decides the
// outcome: critical auth surfaces (login, 2FA verify) fail CLOSED — a limiter
// outage must not open unlimited brute-force — while availability-sensitive
// flows (refresh, forgot, reset) degrade open (logged).
func (s *Service) allow(ctx context.Context, key string, limit int, window time.Duration, failClosed bool) error {
	ok, retryAfter, err := s.rl.Allow(ctx, key, limit, window)
	if err != nil {
		s.sec(ctx).Error("rate limiter error", "err", err, "fail_closed", failClosed)
		if failClosed {
			return apperr.RateLimited(1)
		}
		return nil
	}
	if !ok {
		return apperr.RateLimited(retryAfter)
	}
	return nil
}

func (s *Service) sec(ctx context.Context) *slog.Logger {
	return s.log.With("correlation_id", httpx.CorrelationIDFromContext(ctx))
}

// avatarURL maps a stored avatar path to a served URL. Path is never returned
// raw. Files serving is implemented in a later module; nil path → nil URL.
func (s *Service) avatarURL(ctx context.Context, path *string) *string {
	if path == nil || *path == "" {
		return nil
	}
	u := s.files.URL(ctx, *path)
	return &u
}

func strPtr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
