package shared

import (
	"errors"
	"strings"

	"github.com/velt/backend/internal/platform/htmlsan"
)

// PageSEO is the shared SEO request/response object used by pages, articles, and
// landing pages (whole-object replace on update).
type PageSEO struct {
	Title         *string `json:"title" validate:"omitempty,max=255"`
	Description   *string `json:"description" validate:"omitempty,max=500"`
	Keywords      *string `json:"keywords" validate:"omitempty,max=255"`
	CanonicalURL  *string `json:"canonical_url" validate:"omitempty,max=500"`
	NoIndex       bool    `json:"noindex"`
	NoFollow      bool    `json:"nofollow"`
	OGTitle       *string `json:"og_title" validate:"omitempty,max=255"`
	OGDescription *string `json:"og_description" validate:"omitempty,max=500"`
}

// ErrInvalidCanonical is returned by Clean when canonical_url is not a safe
// http(s)/relative URL (e.g. a javascript:/data: scheme).
var ErrInvalidCanonical = errors.New("invalid_canonical_url")

// Clean sanitizes the SEO fields on WRITE (the allowlist guards body_html but the
// SEO surface bypasses it): text fields are stripped of any HTML so they can't
// inject markup into <meta>/<title>, and canonical_url is constrained to an
// http(s) absolute or a site-relative ("/...") URL — rejecting javascript:/data:
// and other dangerous schemes. Call before persisting; returns ErrInvalidCanonical
// for a bad canonical so the handler can map it to a 422.
func (s *PageSEO) Clean() error {
	plain := func(p *string) {
		if p != nil {
			v := htmlsan.PlainText(strings.TrimSpace(*p))
			*p = v
		}
	}
	plain(s.Title)
	plain(s.Description)
	plain(s.Keywords)
	plain(s.OGTitle)
	plain(s.OGDescription)
	if s.CanonicalURL != nil {
		u := strings.TrimSpace(*s.CanonicalURL)
		*s.CanonicalURL = u
		// Allow an http(s) absolute or a site-relative "/path"; reject everything
		// else (javascript:/data:/… schemes) AND protocol-relative "//host" (which
		// would point off-site).
		lc := strings.ToLower(u)
		relative := strings.HasPrefix(u, "/") && !strings.HasPrefix(u, "//")
		if u != "" && !relative &&
			!strings.HasPrefix(lc, "http://") && !strings.HasPrefix(lc, "https://") {
			return ErrInvalidCanonical
		}
	}
	return nil
}
