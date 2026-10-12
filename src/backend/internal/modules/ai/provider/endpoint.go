package provider

import (
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"strings"
	"syscall"
	"time"
)

// ErrUnsafeEndpoint is returned when the configured base URL is one this
// process refuses to call.
var ErrUnsafeEndpoint = errors.New("ai provider: unsafe endpoint")

// The cloud instance-metadata service. Reaching it from inside the app hands
// out the machine's IAM credentials, so it is never a legitimate model
// endpoint no matter who configured it.
var (
	linkLocalV4 = mustCIDR("169.254.0.0/16")
	imdsV6      = mustCIDR("fd00:ec2::/32")
)

func mustCIDR(s string) *net.IPNet {
	_, n, err := net.ParseCIDR(s)
	if err != nil {
		panic("ai/provider: bad CIDR " + s)
	}
	return n
}

// checkBase validates a configured endpoint and returns it normalised (no
// trailing slash, so joining a path is a plain concatenation).
//
// Loopback and private addresses are deliberately ALLOWED: "point it at Ollama
// on localhost" is the whole reason the OpenAI-compatible adapter exists, so a
// blanket private-range ban would break the supported setup. What is refused is
// a non-HTTP scheme and the metadata range — neither can serve a model, and
// both are what an SSRF is actually aimed at.
func checkBase(raw, fallback string) (string, error) {
	s := strings.TrimSpace(raw)
	if s == "" {
		s = fallback
	}
	s = strings.TrimRight(s, "/")

	u, err := url.Parse(s)
	if err != nil {
		return "", fmt.Errorf("%w: %q is not a URL", ErrUnsafeEndpoint, raw)
	}
	switch u.Scheme {
	case "http", "https":
	default:
		return "", fmt.Errorf("%w: scheme %q (only http and https)", ErrUnsafeEndpoint, u.Scheme)
	}
	if u.Hostname() == "" {
		return "", fmt.Errorf("%w: no host in %q", ErrUnsafeEndpoint, raw)
	}
	if ip := net.ParseIP(u.Hostname()); ip != nil && blockedIP(ip) {
		return "", fmt.Errorf("%w: %s is the instance-metadata range", ErrUnsafeEndpoint, ip)
	}
	return s, nil
}

func blockedIP(ip net.IP) bool {
	return linkLocalV4.Contains(ip) || imdsV6.Contains(ip)
}

// guardedClient is the only http.Client this package uses for a configurable
// endpoint.
//
// The address check lives in Dialer.Control, which runs AFTER DNS with the
// concrete address about to be dialled. Checking the configured hostname alone
// would be bypassed by a name that resolves to the metadata address — either by
// accident or on purpose.
func guardedClient(timeout time.Duration) *http.Client {
	d := &net.Dialer{
		Timeout:   30 * time.Second,
		KeepAlive: 30 * time.Second,
		Control: func(_, address string, _ syscall.RawConn) error {
			host, _, err := net.SplitHostPort(address)
			if err != nil {
				return nil
			}
			if ip := net.ParseIP(host); ip != nil && blockedIP(ip) {
				return fmt.Errorf("%w: refusing to dial %s", ErrUnsafeEndpoint, ip)
			}
			return nil
		},
	}
	return &http.Client{
		Timeout:   timeout,
		Transport: &http.Transport{DialContext: d.DialContext, ForceAttemptHTTP2: true},
	}
}
