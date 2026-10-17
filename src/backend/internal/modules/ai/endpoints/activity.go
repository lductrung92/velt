package endpoints

import (
	"context"

	"github.com/google/uuid"

	"github.com/velt/backend/internal/httpx"
	"github.com/velt/backend/internal/platform/activity"
)

// actionKeysRevealed is the one action here worth a row of its own.
//
// Creating or editing an endpoint is already visible in the endpoint itself;
// READING a credential leaves no other trace. Someone asking later "who saw
// the key before it was abused" has this and nothing else.
const actionKeysRevealed = "ai_provider.keys_revealed"

const entityProvider = "ai_provider"

// Recorder is the activity sink. An interface so the module does not depend
// on the platform store, and optional so a test needs no table.
type Recorder interface {
	Record(ctx context.Context, id *httpx.Identity, e activity.Entry)
}

// SetActivity supplies the sink. Without it the reveal still works and still
// logs to the JSON log; only the console-visible trail is missing.
func (s *Service) SetActivity(rec Recorder) { s.activity = rec }

// RecordReveal notes that somebody read an endpoint's keys. The entry carries
// no key material — the point is who and when, never what.
func (s *Service) RecordReveal(ctx context.Context, id *httpx.Identity, provider uuid.UUID) {
	if s.activity == nil {
		return
	}
	label := provider.String()
	if name, err := s.repo.ProviderLabel(ctx, provider); err == nil && name != "" {
		label = name
	}
	s.activity.Record(ctx, id, activity.Entry{
		Action: actionKeysRevealed, Entity: entityProvider,
		EntityID: &provider, EntityLabel: label,
	})
}
