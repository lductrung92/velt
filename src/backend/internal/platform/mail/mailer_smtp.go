package mail

import (
	"context"
	"fmt"
	"log/slog"
	"time"
)

// SMTPMailer is the real transactional Mailer. It resolves the SMTP connection
// config per send (via cfgFn — typically backed by the settings registry, so
// admins can change SMTP at runtime). When no host is configured it FALLS BACK
// to logging the link (dev convenience) instead of failing, so the auth flow
// still works before SMTP is set up.
type SMTPMailer struct {
	cfgFn       func(ctx context.Context) SMTPConfig
	log         *slog.Logger
	devel       bool // log the reset URL when SMTP unconfigured (dev only)
	dialTimeout time.Duration
}

// NewSMTPMailer builds the mailer. cfgFn returns the current SMTP config; devel
// (non-prod) lets the fallback log the reset URL so a developer can complete
// the flow without an SMTP server.
func NewSMTPMailer(cfgFn func(ctx context.Context) SMTPConfig, log *slog.Logger, devel bool) *SMTPMailer {
	return &SMTPMailer{cfgFn: cfgFn, log: log, devel: devel, dialTimeout: 10 * time.Second}
}

// SendPasswordReset implements Mailer.
func (m *SMTPMailer) SendPasswordReset(ctx context.Context, to, resetURL string) error {
	cfg := m.cfgFn(ctx)
	if cfg.Host == "" {
		// SMTP not configured: don't fail the flow. In dev, log the URL so the
		// reset can be completed; in prod, log only that a send was skipped.
		if m.devel {
			m.log.Debug("password reset email (SMTP unconfigured — link logged)", "reset_url", resetURL)
		} else {
			m.log.Warn("password reset email skipped: SMTP not configured")
		}
		return nil
	}
	subject := "Reset your password"
	body := "Use the link below to reset your password:\r\n\r\n" + resetURL +
		"\r\n\r\nIf you did not request this, you can ignore this email."
	if reason := sendSMTP(ctx, cfg, m.dialTimeout, to, subject, body); reason != "" {
		return fmt.Errorf("smtp send failed: %s", reason)
	}
	return nil
}

// SendEmailVerification sends a customer email-verification link. Same
// unconfigured-SMTP fallback as SendPasswordReset (dev logs the link).
func (m *SMTPMailer) SendEmailVerification(ctx context.Context, to, verifyURL string) error {
	cfg := m.cfgFn(ctx)
	if cfg.Host == "" {
		if m.devel {
			m.log.Debug("email verification (SMTP unconfigured — link logged)", "verify_url", verifyURL)
		} else {
			m.log.Warn("email verification skipped: SMTP not configured")
		}
		return nil
	}
	subject := "Verify your email"
	body := "Welcome! Confirm your email with the link below:\r\n\r\n" + verifyURL +
		"\r\n\r\nIf you did not create an account, you can ignore this email."
	if reason := sendSMTP(ctx, cfg, m.dialTimeout, to, subject, body); reason != "" {
		return fmt.Errorf("smtp send failed: %s", reason)
	}
	return nil
}

// SendMagicLink sends a passwordless sign-in link. Same unconfigured-SMTP
// fallback as the others (dev logs the link).
func (m *SMTPMailer) SendMagicLink(ctx context.Context, to, signInURL string) error {
	cfg := m.cfgFn(ctx)
	if cfg.Host == "" {
		if m.devel {
			m.log.Debug("magic-link sign-in (SMTP unconfigured — link logged)", "sign_in_url", signInURL)
		} else {
			m.log.Warn("magic-link sign-in email skipped: SMTP not configured")
		}
		return nil
	}
	subject := "Your sign-in link"
	body := "Use the link below to sign in (valid for a short time):\r\n\r\n" + signInURL +
		"\r\n\r\nIf you did not request this, you can ignore this email."
	if reason := sendSMTP(ctx, cfg, m.dialTimeout, to, subject, body); reason != "" {
		return fmt.Errorf("smtp send failed: %s", reason)
	}
	return nil
}

var _ Mailer = (*SMTPMailer)(nil)
