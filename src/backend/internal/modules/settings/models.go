package settings

import "encoding/json"

// storedValue is one row of system_settings: exactly one of Value (plaintext
// JSONB) or Encrypted (AES-GCM ciphertext for secrets) is set.
type storedValue struct {
	Value     json.RawMessage `json:"value,omitempty"`
	Encrypted []byte          `json:"enc,omitempty"`
}

// snapshot is the full set of stored rows keyed by setting key. Keys without a
// row fall back to the registry default. It is what the cache holds.
type snapshot map[string]storedValue

// updateRequest is the PUT body. Updates is decoded as raw messages so the
// service can distinguish absent (key not in map), explicit null (delete), and
// a value (set) — see docs/domains/settings/business-rules.md §2.2.
type updateRequest struct {
	Updates map[string]json.RawMessage `json:"updates" validate:"required"`
}

// testEmailRequest is the POST /email/test body.
type testEmailRequest struct {
	To string `json:"to" validate:"required,email"`
}

// GroupedView is the GET/PUT response: group → list of entries. Each entry is a
// loose map so non-secret entries carry "value" (incl. "", false, 0) while
// secret entries carry only "is_set" — never the raw value.
type GroupedView map[string][]map[string]any
