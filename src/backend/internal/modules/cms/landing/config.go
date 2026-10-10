package landing

import (
	"bytes"
	"context"
	"encoding/json"
	"strings"

	"github.com/google/uuid"

	"github.com/velt/backend/internal/apperr"
	"github.com/velt/backend/internal/modules/cms/shared"
	"github.com/velt/backend/internal/platform/htmlsan"
	"github.com/velt/backend/internal/platform/storage"
)

func applyLandingSEO(w *landingWrite, seo *shared.PageSEO) {
	if seo == nil {
		return
	}
	// Sanitize on write: strip markup from text fields; drop an unsafe canonical
	// (non-http/relative) so it can't carry a javascript:/data: scheme.
	if err := seo.Clean(); err != nil {
		seo.CanonicalURL = nil
	}
	w.SEOTitle = seo.Title
	w.SEODescription = seo.Description
	w.SEOKeywords = seo.Keywords
	w.CanonicalURL = seo.CanonicalURL
	w.SEONoindex = seo.NoIndex
	w.SEONofollow = seo.NoFollow
	w.OGTitle = seo.OGTitle
	w.OGDescription = seo.OGDescription
}

// maxSectionConfigBytes caps a section config payload (defense against oversized
// JSON frozen into the snapshot).
const maxSectionConfigBytes = 64 * 1024

// sanitizeSectionConfig ensures config is a bounded JSON object, sanitizes the
// HTML-bearing types (rich_text body_html, html_embed iframe whitelist) and
// rejects dangerous-scheme URLs anywhere in the config (javascript:/vbscript:/
// data:text/html in hero/slider/cta link fields).
func sanitizeSectionConfig(typ string, raw json.RawMessage, mediaPrefix string) (json.RawMessage, error) {
	if len(raw) == 0 || string(raw) == "null" {
		return json.RawMessage(`{}`), nil
	}
	if len(raw) > maxSectionConfigBytes {
		return nil, apperr.Validation(map[string]string{"config": "too_large"})
	}
	var m map[string]any
	if err := json.Unmarshal(raw, &m); err != nil {
		return nil, apperr.Validation(map[string]string{"config": "invalid"})
	}
	switch typ {
	case SectionRichText, SectionMediaText:
		if v, ok := m["body_html"].(string); ok {
			m["body_html"] = htmlsan.Body(v)
		}
	case SectionHTMLEmbed:
		if v, ok := m["html"].(string); ok {
			m["html"] = htmlsan.Embed(v)
		}
	case SectionFAQ:
		sanitizeFAQAnswers(m)
	}
	if hasDangerousScheme(m) {
		return nil, apperr.Validation(map[string]string{"config": "invalid_url"})
	}
	if !ownedMediaPaths(m, mediaPrefix) {
		return nil, apperr.Validation(map[string]string{"config": "invalid_media_path"})
	}
	out, err := json.Marshal(m)
	if err != nil {
		return nil, apperr.Internal()
	}
	return out, nil
}

// ownedMediaPaths reports whether every "<X>_path" string in the config lies
// under the landing's own media prefix — blocks a client from pointing a section
// at (and later, on republish GC, deleting) another entity's storage object.
func ownedMediaPaths(v any, prefix string) bool {
	switch t := v.(type) {
	case map[string]any:
		for k, val := range t {
			if s, ok := val.(string); ok && strings.HasSuffix(k, "_path") {
				if !shared.OwnsMedia(prefix, s) {
					return false
				}
				continue
			}
			if !ownedMediaPaths(val, prefix) {
				return false
			}
		}
	case []any:
		for _, val := range t {
			if !ownedMediaPaths(val, prefix) {
				return false
			}
		}
	}
	return true
}

// hasDangerousScheme walks the decoded config and reports any string value that
// is an unsafe URL scheme (would XSS when rendered as href/src on the public web).
func hasDangerousScheme(v any) bool {
	switch t := v.(type) {
	case string:
		s := strings.ToLower(strings.TrimSpace(t))
		// Block ALL data:/blob: (not just data:text/html): data:image/svg+xml is
		// script-bearing and would XSS when used as an href/src. Matches the
		// widgets registry check (kept consistent to prevent drift).
		return strings.HasPrefix(s, "javascript:") || strings.HasPrefix(s, "vbscript:") ||
			strings.HasPrefix(s, "data:") || strings.HasPrefix(s, "blob:")
	case map[string]any:
		for _, val := range t {
			if hasDangerousScheme(val) {
				return true
			}
		}
	case []any:
		for _, val := range t {
			if hasDangerousScheme(val) {
				return true
			}
		}
	}
	return false
}

// sanitizeFAQAnswers runs each faq items[].answer_html through the body allowlist.
func sanitizeFAQAnswers(m map[string]any) {
	items, ok := m["items"].([]any)
	if !ok {
		return
	}
	for _, it := range items {
		obj, ok := it.(map[string]any)
		if !ok {
			continue
		}
		if v, ok := obj["answer_html"].(string); ok {
			obj["answer_html"] = htmlsan.Body(v)
		}
	}
}

// resolveConfigMediaURLs returns config with a sibling "<X>_url" (served URL)
// injected next to every string "<X>_path" (a stored storage key). Section-agnostic
// so the same pass covers all 14 types. On any error it returns raw unchanged.
func resolveConfigMediaURLs(ctx context.Context, files storage.Storage, raw json.RawMessage) json.RawMessage {
	if len(raw) == 0 || files == nil {
		return raw
	}
	var v any
	// UseNumber so integers (limit/columns/…) round-trip exactly instead of being
	// coerced to float64 and possibly reformatted.
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.UseNumber()
	if err := dec.Decode(&v); err != nil {
		return raw
	}
	injectMediaURLs(ctx, files, v)
	out, err := json.Marshal(v)
	if err != nil {
		return raw
	}
	return out
}

// collectMediaPaths walks a decoded config/snapshot value and records every
// non-empty string under a "<X>_path" key — the storage keys of referenced media
// (mirrors injectMediaURLs' key detection).
func collectMediaPaths(v any, out map[string]struct{}) {
	switch t := v.(type) {
	case map[string]any:
		for k, val := range t {
			if s, ok := val.(string); ok && s != "" && strings.HasSuffix(k, "_path") {
				out[s] = struct{}{}
				continue
			}
			collectMediaPaths(val, out)
		}
	case []any:
		for _, val := range t {
			collectMediaPaths(val, out)
		}
	}
}

// snapshotMediaPaths returns the set of storage keys referenced by a published
// snapshot (section configs + top-level og_path). Empty/invalid → empty set.
func snapshotMediaPaths(snap json.RawMessage) map[string]struct{} {
	out := map[string]struct{}{}
	if len(snap) == 0 {
		return out
	}
	var v any
	dec := json.NewDecoder(bytes.NewReader(snap))
	dec.UseNumber()
	if err := dec.Decode(&v); err != nil {
		return out
	}
	collectMediaPaths(v, out)
	return out
}

// gcDroppedMedia deletes media that was in the OLD published snapshot but not the
// NEW one — images removed or replaced since the last publish, now referenced by
// nobody (public reads the new snapshot). Best-effort. This is the SAFE moment to
// reclaim landing media: while a path is in the published snapshot it is live, so
// we never delete at edit time — only once a (re)publish drops it.
func gcDroppedMedia(ctx context.Context, files storage.Storage, prefix string, oldSnap json.RawMessage, keep map[string]struct{}) {
	if files == nil {
		return
	}
	for p := range snapshotMediaPaths(oldSnap) {
		if _, live := keep[p]; live {
			continue
		}
		// Scope deletes to the landing's own media folder (defense-in-depth: a
		// spoofed *_path that slipped into an old snapshot can't nuke other files).
		if !strings.HasPrefix(p, prefix) {
			continue
		}
		_ = files.Delete(ctx, p)
	}
}

// liveMediaPaths is the set of storage keys still referenced after a (re)publish:
// the new snapshot PLUS every current section's config (INCLUDING hidden/draft
// sections, which are excluded from the snapshot but still reference their media)
// PLUS the landing og_path. GC only deletes old-snapshot paths absent from this
// set — so hiding a section then republishing never destroys its image.
func liveMediaPaths(newSnap json.RawMessage, sections []Section, ogPath *string) map[string]struct{} {
	keep := snapshotMediaPaths(newSnap)
	for _, sec := range sections {
		if len(sec.Config) == 0 {
			continue
		}
		var v any
		dec := json.NewDecoder(bytes.NewReader(sec.Config))
		dec.UseNumber()
		if err := dec.Decode(&v); err == nil {
			collectMediaPaths(v, keep)
		}
	}
	if ogPath != nil && *ogPath != "" {
		keep[*ogPath] = struct{}{}
	}
	return keep
}

func injectMediaURLs(ctx context.Context, files storage.Storage, v any) {
	switch t := v.(type) {
	case map[string]any:
		add := map[string]any{}
		for k, val := range t {
			if s, ok := val.(string); ok && s != "" && strings.HasSuffix(k, "_path") {
				add[strings.TrimSuffix(k, "_path")+"_url"] = files.URL(ctx, s)
				continue
			}
			injectMediaURLs(ctx, files, val)
		}
		for k, val := range add {
			t[k] = val
		}
	case []any:
		for _, val := range t {
			injectMediaURLs(ctx, files, val)
		}
	}
}

func buildLandingSnapshot(p Page, sections []Section) ([]byte, error) {
	snap := landingSnapshot{Key: p.Key, Name: p.Name, SEO: landingSEOObj(p), OGPath: p.OGPath}
	for _, sec := range sections {
		if !sec.IsVisible {
			continue
		}
		cfg := sec.Config
		if len(cfg) == 0 {
			cfg = json.RawMessage(`{}`)
		}
		snap.Sections = append(snap.Sections, sectionSnapshot{Type: sec.Type, SortOrder: sec.SortOrder, Config: cfg})
	}
	return json.Marshal(snap)
}

// sameSectionSet reports whether ids is exactly the set of section IDs (count +
// membership), so a reorder always covers the whole landing.
func sameSectionSet(sections []Section, ids []uuid.UUID) bool {
	if len(sections) != len(ids) {
		return false
	}
	// Multiset compare: count occurrences so a duplicate id in ids (e.g. [A,A] for
	// {A,B}) is rejected instead of silently passing count+membership.
	have := make(map[uuid.UUID]int, len(sections))
	for _, s := range sections {
		have[s.ID]++
	}
	for _, id := range ids {
		if have[id] == 0 {
			return false
		}
		have[id]--
	}
	return true
}
