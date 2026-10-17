// Package endpoints holds the assistant's LLM endpoints and the ordered chain
// each job runs through.
//
// Why a package of its own: the conversation module consumes a chain, the
// console edits it, and the provider package knows how to call one. Keeping
// the records here stops any of those three from owning the other two.
package endpoints

import (
	"time"

	"github.com/google/uuid"
)

// Provider is one configured LLM endpoint. The API key never leaves the
// server: it is stored AEAD-encrypted and the responses below carry only
// whether one is set.
type Provider struct {
	ID      uuid.UUID `json:"id"`
	Label   string    `json:"label"`
	Kind    string    `json:"kind"`
	BaseURL string    `json:"base_url"`
	HasKey  bool      `json:"has_key"`
	// KeyCount is how many keys the endpoint holds. Several keys are tried in
	// turn when one hits its quota, so "3" is a meaningful thing to see.
	KeyCount  int       `json:"key_count"`
	Enabled   bool      `json:"enabled"`
	SortOrder int       `json:"sort_order"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// Step is one link of a purpose's chain: which endpoint, running which model.
type Step struct {
	ID            uuid.UUID `json:"id"`
	Purpose       string    `json:"purpose"`
	ProviderID    uuid.UUID `json:"provider_id"`
	ProviderLabel string    `json:"provider_label"`
	// ProviderEnabled is carried so the console can show a step whose endpoint
	// was switched off as inert rather than silently dropping it.
	ProviderEnabled bool   `json:"provider_enabled"`
	Model           string `json:"model"`
	SortOrder       int    `json:"sort_order"`
}

// Resolved is a step with everything needed to build a client, key included.
// It never crosses the HTTP boundary.
type Resolved struct {
	ProviderID    uuid.UUID
	ProviderLabel string
	Kind          string
	BaseURL       string
	APIKey        string
	// KeyID tells two links of the same endpoint apart when it holds several
	// keys. It is a short hash, never the key: it goes into the cooldown map
	// and into logs. Empty when the endpoint has no key.
	KeyID string
	Model string
}

// CreateProviderRequest is the POST body.
type CreateProviderRequest struct {
	Label   string  `json:"label" validate:"required,max=80"`
	Kind    string  `json:"kind" validate:"required,oneof=anthropic openai"`
	BaseURL string  `json:"base_url" validate:"omitempty,max=300"`
	APIKey  *string `json:"api_key" validate:"omitempty,max=8000"`
	Enabled *bool   `json:"enabled"`
}

// UpdateProviderRequest is the PATCH body: an absent field is left alone, and
// an absent api_key keeps the stored one (sending "" clears it).
type UpdateProviderRequest struct {
	Label   *string `json:"label" validate:"omitempty,max=80"`
	Kind    *string `json:"kind" validate:"omitempty,oneof=anthropic openai"`
	BaseURL *string `json:"base_url" validate:"omitempty,max=300"`
	APIKey  *string `json:"api_key" validate:"omitempty,max=8000"`
	Enabled *bool   `json:"enabled"`
}

// RevealKeysRequest re-authenticates before stored keys are handed back.
//
// The password is asked for even though the caller is already signed in and
// already holds the settings permission. A session left open on an unlocked
// screen is the ordinary way these keys would walk out, and a session cookie
// cannot be re-checked — only the person can.
type RevealKeysRequest struct {
	Password string `json:"password" validate:"required,max=200"`
}

// RevealKeysResponse carries the plaintext keys, one per entry, in the order
// they are tried.
type RevealKeysResponse struct {
	Keys []string `json:"keys"`
}

// SetChainRequest replaces one purpose's chain wholesale. Replacing rather
// than patching keeps the order unambiguous: the array IS the priority.
type SetChainRequest struct {
	Steps []ChainStepInput `json:"steps" validate:"dive"`
}

// ChainStepInput is one entry of the submitted chain.
type ChainStepInput struct {
	ProviderID uuid.UUID `json:"provider_id" validate:"required"`
	Model      string    `json:"model" validate:"required,max=160"`
}

// ProvidersResponse is the list the console renders.
type ProvidersResponse struct {
	Items []Provider `json:"items"`
}

// ChainResponse is one purpose's ordered chain.
type ChainResponse struct {
	Purpose string `json:"purpose"`
	Steps   []Step `json:"steps"`
}
