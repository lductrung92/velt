package taxonomy

import (
	"github.com/velt/backend/internal/modules/cms/shared"
	"github.com/velt/backend/internal/platform/htmlsan"
)

// Service holds taxonomy (category + tag) business logic.
type Service struct {
	*shared.Base
	repo Repository
	tr   Translator
}

// NewService wires the taxonomy service onto the shared CMS base.
func NewService(base *shared.Base, repo Repository) *Service {
	return &Service{Base: base, repo: repo}
}

// seoFields returns the category SEO fields, stripping any HTML so a stored
// title/description/keywords can't inject markup wherever the web tier renders
// them into <meta>/<title> (parity with PageSEO.Clean for pages/articles).
func seoFields(in *CategorySEO) (title, desc, keywords *string) {
	if in == nil {
		return nil, nil, nil
	}
	return plainPtr(in.Title), plainPtr(in.Description), plainPtr(in.Keywords)
}

// plainPtr strips HTML from an optional string, preserving nil.
func plainPtr(p *string) *string {
	if p == nil {
		return nil
	}
	v := htmlsan.PlainText(*p)
	return &v
}

// derefStatus is the create-time status: what was asked for, or published —
// a category that has just been made is in use, which is also what every row
// that predates the status column means.
func derefStatus(p *string) string {
	if p == nil {
		return CategoryStatusPublished
	}
	return *p
}

func derefInt(p *int) int {
	if p == nil {
		return 0
	}
	return *p
}
