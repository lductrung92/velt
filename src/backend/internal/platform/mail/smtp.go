package mail

import (
	"context"
	"crypto/tls"
	"net"
	"net/smtp"
	"strconv"
	"strings"
	"time"
)

// stripCRLF removes CR/LF so a value used in an SMTP envelope/header can't inject
// extra headers or commands (defense-in-depth; recipients are already validated
// as RFC-5322 emails at the API boundary).
func stripCRLF(s string) string {
	return strings.NewReplacer("\r", "", "\n", "").Replace(s)
}

// SMTP failure reason keys (translation keys, never raw SMTP prose). They match
// docs/apis/settings-api.md POST /email/test.
const (
	ReasonNotConfigured    = "not_configured"
	ReasonAuthFailed       = "auth_failed"
	ReasonConnectionRefuse = "connection_refused"
	ReasonTimeout          = "timeout"
	ReasonTLSError         = "tls_error"
	ReasonUnknown          = "unknown"
)

// SMTPConfig is the connection config assembled from settings (the password is
// decrypted in RAM by the caller, used here transiently, never logged).
type SMTPConfig struct {
	Host     string
	Port     int
	Username string
	Password string
	From     string
}

// Tester probes an SMTP server by attempting to send a test message. It returns
// "" on success or a reason key on failure — never raw server text/credentials.
type Tester interface {
	Test(ctx context.Context, cfg SMTPConfig, to string) (reason string)
}

// SMTPTester is the real net/smtp-based Tester.
type SMTPTester struct {
	DialTimeout time.Duration
}

// NewSMTPTester builds an SMTPTester with a sane default dial timeout.
func NewSMTPTester() *SMTPTester { return &SMTPTester{DialTimeout: 10 * time.Second} }

// Test implements Tester — a probe that sends a fixed test message.
func (t *SMTPTester) Test(ctx context.Context, cfg SMTPConfig, to string) string {
	if cfg.Host == "" {
		return ReasonNotConfigured
	}
	return sendSMTP(ctx, cfg, t.DialTimeout, to,
		"velt SMTP test", "This is a test message from velt.")
}

var _ Tester = (*SMTPTester)(nil)

// sendSMTP delivers one plaintext message and returns "" on success or a reason
// key on failure (never raw server text/credentials). Shared by the tester and
// the real mailer. STARTTLS is used when offered; AUTH only when a username is
// set (so it works against an open dev relay like Mailpit).
func sendSMTP(ctx context.Context, cfg SMTPConfig, dialTimeout time.Duration, to, subject, body string) string {
	if dialTimeout <= 0 {
		dialTimeout = 10 * time.Second
	}
	dialCtx, cancel := context.WithTimeout(ctx, dialTimeout)
	defer cancel()

	addr := net.JoinHostPort(cfg.Host, strconv.Itoa(cfg.Port))
	conn, err := (&net.Dialer{}).DialContext(dialCtx, "tcp", addr)
	if err != nil {
		if ne, ok := err.(net.Error); ok && ne.Timeout() {
			return ReasonTimeout
		}
		return ReasonConnectionRefuse
	}
	defer func() { _ = conn.Close() }()

	client, err := smtp.NewClient(conn, cfg.Host)
	if err != nil {
		return ReasonUnknown
	}
	defer func() { _ = client.Close() }()

	if ok, _ := client.Extension("STARTTLS"); ok {
		if err := client.StartTLS(&tls.Config{ServerName: cfg.Host, MinVersion: tls.VersionTLS12}); err != nil {
			return ReasonTLSError
		}
	}
	if cfg.Username != "" {
		if err := client.Auth(smtp.PlainAuth("", cfg.Username, cfg.Password, cfg.Host)); err != nil {
			return ReasonAuthFailed
		}
	}
	from := stripCRLF(cfg.From)
	rcpt := stripCRLF(to)
	subj := stripCRLF(subject)
	if err := client.Mail(from); err != nil {
		return ReasonUnknown
	}
	if err := client.Rcpt(rcpt); err != nil {
		return ReasonUnknown
	}
	w, err := client.Data()
	if err != nil {
		return ReasonUnknown
	}
	msg := "From: " + from + "\r\n" +
		"To: " + rcpt + "\r\n" +
		"Subject: " + subj + "\r\n" +
		"MIME-Version: 1.0\r\n" +
		"Content-Type: text/plain; charset=UTF-8\r\n" +
		"\r\n" + body + "\r\n"
	if _, err := w.Write([]byte(msg)); err != nil {
		return ReasonUnknown
	}
	if err := w.Close(); err != nil {
		return ReasonUnknown
	}
	_ = client.Quit()
	return ""
}
