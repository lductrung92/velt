package menus

import (
	"net"
	"net/url"
	"regexp"
	"strings"

	"github.com/velt/backend/internal/apperr"
)

// numericHostRe matches a host made only of digits/dots/x — a valid dotted IP is
// handled by net.ParseIP; anything else matching this is an obfuscated IP
// encoding (decimal 2130706433 / octal 0177.0.0.1 / hex 0x7f.0.0.1) → reject.
var numericHostRe = regexp.MustCompile(`^[0-9xX.]+$`)

// validateItems recursively checks each node's link_type-specific fields.
func validateItems(items []ItemInput) error {
	for _, it := range items {
		switch it.LinkType {
		case LinkExternal:
			if it.URL == nil || strings.TrimSpace(*it.URL) == "" {
				return apperr.Validation(map[string]string{"url": "required"})
			}
			if err := validateExternalURL(*it.URL); err != nil {
				return err
			}
		case LinkInternal:
			if it.URL == nil || !strings.HasPrefix(*it.URL, "/") {
				// Internal links are same-site relative paths (open-redirect guard).
				return apperr.Validation(map[string]string{"url": "invalid_internal_url"})
			}
		case LinkArticle, LinkPage, LinkCategory:
			if it.TargetID == nil {
				return apperr.Validation(map[string]string{"target_id": "required"})
			}
		}
		if err := validateItems(it.Children); err != nil {
			return err
		}
	}
	return nil
}

// validateExternalURL enforces http/https scheme and rejects internal hosts
// (open-redirect / defense-in-depth): localhost + internal suffixes + metadata
// hostnames, IP literals in loopback/private/link-local ranges (incl. IPv4-mapped
// IPv6 via To4), and obfuscated IP encodings (decimal/octal/hex) net.ParseIP
// can't read.
func validateExternalURL(raw string) error {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
		return apperr.Validation(map[string]string{"url": "invalid_url"})
	}
	host := strings.ToLower(u.Hostname())
	if host == "" || isBlockedHostname(host) {
		return apperr.Validation(map[string]string{"url": "host_not_allowed"})
	}
	if ip := net.ParseIP(host); ip != nil {
		if ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() || ip.IsUnspecified() {
			return apperr.Validation(map[string]string{"url": "host_not_allowed"})
		}
	} else if numericHostRe.MatchString(host) {
		return apperr.Validation(map[string]string{"url": "host_not_allowed"})
	}
	return nil
}

// isBlockedHostname denylists localhost, internal TLD suffixes, and cloud
// metadata hostnames (the URL is only ever rendered as an <a href>, never fetched
// server-side, so DNS resolution is intentionally avoided).
func isBlockedHostname(host string) bool {
	switch host {
	case "localhost", "metadata", "metadata.google.internal":
		return true
	}
	for _, suffix := range []string{".localhost", ".local", ".internal", ".lan"} {
		if strings.HasSuffix(host, suffix) {
			return true
		}
	}
	return false
}

// toItemWrites flattens validated inputs to persistence nodes, keeping only the
// link_type-relevant pointer (target_id XOR url) to avoid stale data.
func toItemWrites(items []ItemInput) []itemWrite {
	if len(items) == 0 {
		return nil
	}
	out := make([]itemWrite, 0, len(items))
	for _, it := range items {
		w := itemWrite{
			Label: strings.TrimSpace(it.Label), LinkType: it.LinkType,
			TargetID: it.TargetID, URL: it.URL, OpenNewTab: it.OpenNewTab,
			Children: toItemWrites(it.Children),
		}
		switch it.LinkType {
		case LinkInternal, LinkExternal:
			w.TargetID = nil
		case LinkArticle, LinkPage, LinkCategory:
			w.URL = nil
		}
		out = append(out, w)
	}
	return out
}
