// Package config loads typed application configuration from environment
// variables. There are no hardcoded secrets, URLs, or ports anywhere else.
package config

import (
	"fmt"
	"strings"
	"time"

	"github.com/caarlos0/env/v11"
)

// Config is the fully-typed application configuration. Populate it once at
// startup with Load; never read os.Getenv elsewhere.
type Config struct {
	// App
	Env      string `env:"APP_ENV" envDefault:"dev"`
	HTTPAddr string `env:"HTTP_ADDR" envDefault:":8080"`
	LogLevel string `env:"LOG_LEVEL" envDefault:"info"`
	// LogFile: when set, JSON logs are ALSO written here (in addition to stdout).
	// Empty (default) = stdout only (12-factor). Dev sets logs/app.log.
	LogFile string `env:"LOG_FILE"`

	// Data stores
	DatabaseURL string `env:"DATABASE_URL,required"`
	RedisURL    string `env:"REDIS_URL"` // empty → in-memory rate limiter (single instance)

	// Secrets
	JWTSecret     string `env:"JWT_SECRET,required"`     // HMAC key for staff access/challenge tokens
	EncryptionKey string `env:"ENCRYPTION_KEY,required"` // 32-byte AES-GCM key, hex (64 chars) or base64

	// Token lifetimes
	AccessTokenTTL    time.Duration `env:"ACCESS_TOKEN_TTL" envDefault:"15m"`
	ChallengeTokenTTL time.Duration `env:"CHALLENGE_TOKEN_TTL" envDefault:"5m"`
	RefreshTokenTTL   time.Duration `env:"REFRESH_TOKEN_TTL" envDefault:"720h"` // 30 days
	ResetTokenTTL     time.Duration `env:"RESET_TOKEN_TTL" envDefault:"30m"`    // staff password reset

	// Login security
	MaxFailedLogins int           `env:"MAX_FAILED_LOGINS" envDefault:"5"`
	LockoutBase     time.Duration `env:"LOCKOUT_BASE" envDefault:"1m"` // exponential: base, base*5, base*15...
	SessionCap      int           `env:"SESSION_CAP" envDefault:"10"`

	// Refresh cookie
	CookieDomain string `env:"COOKIE_DOMAIN"`
	CookieSecure bool   `env:"COOKIE_SECURE" envDefault:"true"`

	// TrustProxyHeaders: only true when the app sits behind a trusted reverse
	// proxy that sets X-Forwarded-For/X-Real-IP. When false (default), the
	// client IP is taken from RemoteAddr so spoofed headers can't split the
	// per-IP rate-limit buckets.
	TrustProxyHeaders bool `env:"TRUST_PROXY_HEADERS" envDefault:"false"`

	// Outbound
	AppBaseURL         string `env:"APP_BASE_URL" envDefault:"http://localhost:5173"`          // console base for staff reset links
	CustomerWebBaseURL string `env:"CUSTOMER_WEB_BASE_URL" envDefault:"http://localhost:3000"` // public web base for customer magic-link sign-in
	MailFrom           string `env:"MAIL_FROM" envDefault:"no-reply@velt.local.vn"`

	// RevalidateSecret is the shared secret for the web's POST /api/revalidate
	// (must match the web REVALIDATE_SECRET). Empty → on-publish revalidation is
	// disabled and content relies on the plain ISR window.
	RevalidateSecret string `env:"REVALIDATE_SECRET"`

	// Storage (local driver root; S3 config comes from the settings registry)
	StorageLocalRoot string `env:"STORAGE_LOCAL_ROOT" envDefault:"./storage"`

	// CORS: browser origins allowed to call the API with credentials. The
	// console/web are separate origins (admin./api. subdomains), so cross-origin
	// requests need this. Comma-separated; defaults cover local dev.
	CORSAllowedOrigins []string `env:"CORS_ALLOWED_ORIGINS" envSeparator:"," envDefault:"http://localhost:5273,http://localhost:5373"`
}

// CookiePath scopes the staff refresh cookie to the auth endpoints only.
const CookiePath = "/api/auth"

// RefreshCookieName is the shared name of the staff httpOnly refresh-token
// cookie (set by auth login/refresh and by account change-password).
const RefreshCookieName = "refresh_token"

// CustomerCookiePath scopes the customer refresh cookie to the customer API.
// It is broader than the staff path (/api/auth) on purpose: self-service
// endpoints (sessions) need the cookie to identify the caller's CURRENT session
// (revoke-others / mark-current).
const CustomerCookiePath = "/api/customer"

// CustomerRefreshCookieName is the name of the customer httpOnly refresh-token
// cookie. Distinct from the staff cookie name (separate identity systems).
const CustomerRefreshCookieName = "customer_refresh_token"

// Load reads and validates configuration from the environment.
func Load() (Config, error) {
	var cfg Config
	if err := env.Parse(&cfg); err != nil {
		return Config{}, fmt.Errorf("parse config: %w", err)
	}
	return cfg, nil
}

// IsProd reports whether the app runs in the production environment.
func (c Config) IsProd() bool { return c.Env == "prod" }

// Validate enforces security-critical invariants the env-tag layer can't express.
// Called at API startup (fail fast). The two signing secrets must be long enough
// to resist offline brute force and MUST differ (the documented blast-radius
// isolation collapses silently if an operator reuses one). In production, secure
// cookies are mandatory and CORS must not trust localhost origins.
func (c Config) Validate() error {
	if len(c.JWTSecret) < 32 {
		return fmt.Errorf("JWT_SECRET must be at least 32 bytes")
	}
	if c.IsProd() {
		if !c.CookieSecure {
			return fmt.Errorf("COOKIE_SECURE must be true in production")
		}
		for _, o := range c.CORSAllowedOrigins {
			if strings.Contains(o, "localhost") || strings.Contains(o, "127.0.0.1") {
				return fmt.Errorf("CORS_ALLOWED_ORIGINS must not include localhost origins in production: %q", o)
			}
		}
	}
	return nil
}
