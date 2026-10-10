// Package httpx holds the HTTP plumbing shared by all modules: router
// middleware (correlation id, logging, recover, auth), request decoding +
// validation, the JSON/error-envelope writers, the authenticated Identity, and
// refresh-cookie/client-IP helpers.
package httpx

import (
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/velt/backend/internal/config"
)

// SetRefreshCookie writes the httpOnly refresh cookie (shared by auth login/
// refresh and account change-password) with the standard name/path/flags.
func SetRefreshCookie(w http.ResponseWriter, value string, expires time.Time, secure bool, domain string) {
	http.SetCookie(w, &http.Cookie{
		Name:     config.RefreshCookieName,
		Value:    value,
		Path:     config.CookiePath,
		Domain:   domain,
		Expires:  expires,
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteStrictMode,
	})
}

// ClearRefreshCookie expires the refresh cookie.
func ClearRefreshCookie(w http.ResponseWriter, secure bool, domain string) {
	http.SetCookie(w, &http.Cookie{
		Name:     config.RefreshCookieName,
		Value:    "",
		Path:     config.CookiePath,
		Domain:   domain,
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteStrictMode,
	})
}

// ReadRefreshCookie returns the refresh cookie value, or "" if absent.
func ReadRefreshCookie(r *http.Request) string {
	c, err := r.Cookie(config.RefreshCookieName)
	if err != nil {
		return ""
	}
	return c.Value
}

// SetCustomerRefreshCookie writes the customer httpOnly refresh cookie. It uses
// SameSite=Lax (not Strict): the customer web flows include top-level
// navigations (e.g. returning from an email link) where the cookie must still
// be sent. The cookie is scoped to the customer auth path and is a distinct
// name from the staff cookie.
func SetCustomerRefreshCookie(w http.ResponseWriter, value string, expires time.Time, secure bool, domain string) {
	http.SetCookie(w, &http.Cookie{
		Name:     config.CustomerRefreshCookieName,
		Value:    value,
		Path:     config.CustomerCookiePath,
		Domain:   domain,
		Expires:  expires,
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteLaxMode,
	})
}

// ClearCustomerRefreshCookie expires the customer refresh cookie.
func ClearCustomerRefreshCookie(w http.ResponseWriter, secure bool, domain string) {
	http.SetCookie(w, &http.Cookie{
		Name:     config.CustomerRefreshCookieName,
		Value:    "",
		Path:     config.CustomerCookiePath,
		Domain:   domain,
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteLaxMode,
	})
}

// ReadCustomerRefreshCookie returns the customer refresh cookie value, or "".
func ReadCustomerRefreshCookie(r *http.Request) string {
	c, err := r.Cookie(config.CustomerRefreshCookieName)
	if err != nil {
		return ""
	}
	return c.Value
}

// ClientIP derives the caller IP for rate-limit bucketing. Client-supplied
// forwarding headers are trusted ONLY when trustProxy is set (a trusted reverse
// proxy is the sole source of them); otherwise the transport RemoteAddr is used
// so a spoofed X-Forwarded-For cannot evade per-IP limits.
func ClientIP(r *http.Request, trustProxy bool) string {
	if trustProxy {
		if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
			if i := strings.IndexByte(xff, ','); i >= 0 {
				return strings.TrimSpace(xff[:i])
			}
			return strings.TrimSpace(xff)
		}
		if xr := r.Header.Get("X-Real-IP"); xr != "" {
			return strings.TrimSpace(xr)
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
