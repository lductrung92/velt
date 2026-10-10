package mail

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"log/slog"
	"net"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func discardLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

func TestSMTPMailer_UnconfiguredFallsBack(t *testing.T) {
	// No SMTP host → must NOT error (auth flow keeps working) and must NOT
	// attempt a connection.
	m := NewSMTPMailer(func(context.Context) SMTPConfig { return SMTPConfig{} }, discardLogger(), true)
	require.NoError(t, m.SendPasswordReset(context.Background(), "to@example.com", "http://app/reset?token=abc"))
}

func TestSMTPMailer_ImplementsMailer(t *testing.T) {
	var _ Mailer = NewSMTPMailer(func(context.Context) SMTPConfig { return SMTPConfig{} }, discardLogger(), false)
}

// fakeSMTPServer is a minimal in-process SMTP sink for tests: it accepts one
// message and returns its raw DATA on the channel.
func fakeSMTPServer(t *testing.T) (host string, port int, received <-chan string) {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	require.NoError(t, err)
	t.Cleanup(func() { _ = ln.Close() })
	ch := make(chan string, 1)
	go func() {
		conn, err := ln.Accept()
		if err != nil {
			return
		}
		defer func() { _ = conn.Close() }()
		r := bufio.NewReader(conn)
		w := func(s string) { _, _ = fmt.Fprintf(conn, "%s\r\n", s) }
		w("220 test ESMTP")
		var data strings.Builder
		inData := false
		for {
			line, err := r.ReadString('\n')
			if err != nil {
				return
			}
			line = strings.TrimRight(line, "\r\n")
			if inData {
				if line == "." {
					w("250 OK queued")
					ch <- data.String()
					return
				}
				data.WriteString(line + "\n")
				continue
			}
			switch up := strings.ToUpper(line); {
			case strings.HasPrefix(up, "EHLO"), strings.HasPrefix(up, "HELO"):
				w("250-test")
				w("250 OK")
			case strings.HasPrefix(up, "DATA"):
				w("354 end with .")
				inData = true
			case strings.HasPrefix(up, "QUIT"):
				w("221 Bye")
				return
			default:
				w("250 OK")
			}
		}
	}()
	h, p, _ := net.SplitHostPort(ln.Addr().String())
	port, _ = strconv.Atoi(p)
	return h, port, ch
}

func TestSMTPMailer_DeliversResetLink(t *testing.T) {
	host, port, received := fakeSMTPServer(t)
	m := NewSMTPMailer(func(context.Context) SMTPConfig {
		return SMTPConfig{Host: host, Port: port, From: "no-reply@velt.local.vn"}
	}, discardLogger(), false)

	err := m.SendPasswordReset(context.Background(), "user@example.com", "http://localhost:5173/reset-password?token=XYZ123")
	require.NoError(t, err)

	select {
	case msg := <-received:
		require.Contains(t, msg, "From: no-reply@velt.local.vn")
		require.Contains(t, msg, "To: user@example.com")
		require.Contains(t, msg, "Subject: Reset your password")
		require.Contains(t, msg, "http://localhost:5173/reset-password?token=XYZ123")
	case <-time.After(3 * time.Second):
		t.Fatal("SMTP server received no message")
	}
}
