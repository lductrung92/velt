package shared

import "encoding/json"

// PublicSection is a resolved landing-builder section on the public read path.
// It is shared so the pages feature can expose a landing's sections (via a port)
// without importing the landing package. Config is the sanitized, media-resolved
// section config; Data is fresh dynamic data (articles/categories lists) or nil
// for static sections / on resolve error.
type PublicSection struct {
	Type      string          `json:"type"`
	SortOrder int             `json:"sort_order"`
	Config    json.RawMessage `json:"config"`
	Data      any             `json:"data"`
}
