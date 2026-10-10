// Package mail abstracts outbound transactional email. The foundation ships a
// LogMailer (writes the message to the structured log) so flows like
// forgot-password are runnable without an SMTP server; a real SMTP sender
// plugs into the same Mailer interface once the settings module lands.
package mail

import (
	"context"
	"log/slog"
)

// Mailer sends transactional emails. Implementations must never log the
// recipient's PII at a level that leaks it broadly; reset links are secrets.
type Mailer interface {
	// SendPasswordReset sends the reset link to the given address. It is called
	// only for existing, active accounts (the caller enforces no-enumeration by
	// always returning 200 to the client regardless of outcome).
	SendPasswordReset(ctx context.Context, to, resetURL string) error
}

// LogMailer is a development Mailer that records that a mail would be sent.
// In dev it logs the reset URL at DEBUG so a developer can complete the flow;
// in any non-dev environment it logs only that a send occurred (no URL/PII).
type LogMailer struct {
	log   *slog.Logger
	devel bool
}

// NewLogMailer builds a LogMailer. When devel is true the reset URL is logged
// at DEBUG to aid local testing; otherwise it is never logged.
func NewLogMailer(log *slog.Logger, devel bool) *LogMailer {
	return &LogMailer{log: log, devel: devel}
}

// SendPasswordReset implements Mailer.
func (m *LogMailer) SendPasswordReset(_ context.Context, _ string, resetURL string) error {
	if m.devel {
		m.log.Debug("password reset email (dev)", "reset_url", resetURL)
	} else {
		m.log.Info("password reset email queued")
	}
	return nil
}

// SendEmailVerification logs the customer verification link (dev) or that a
// send occurred (non-dev). Mirrors SendPasswordReset.
func (m *LogMailer) SendEmailVerification(_ context.Context, _ string, verifyURL string) error {
	if m.devel {
		m.log.Debug("email verification (dev)", "verify_url", verifyURL)
	} else {
		m.log.Info("email verification queued")
	}
	return nil
}

// SendMagicLink logs the passwordless sign-in link (dev) or that a send
// occurred (non-dev). Mirrors SendPasswordReset.
func (m *LogMailer) SendMagicLink(_ context.Context, _ string, signInURL string) error {
	if m.devel {
		m.log.Debug("magic-link sign-in (dev)", "sign_in_url", signInURL)
	} else {
		m.log.Info("magic-link sign-in email queued")
	}
	return nil
}
