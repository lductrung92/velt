package settings

import (
	"context"
	"sort"

	"github.com/velt/backend/internal/httpx"
	"github.com/velt/backend/internal/platform/activity"
)

// actionUpdated is the stable code for a settings write. A code, not prose:
// the console filters on it and renders its own label per language.
const actionUpdated = "settings.updated"

// actionEmailTested records the SMTP probe. It changes no setting, so it is not
// an update — but it sends mail to an address of the caller's choosing using the
// stored credentials, which is exactly why the endpoint is rate limited. A
// capability that is worth bounding is worth a row saying who used it.
const actionEmailTested = "settings.email_tested"

// SetRecorder wires the activity recorder (called once at startup). nil stays
// valid and means "do not record", which is what this module looked like
// before the activity log existed — tests need no recorder.
func (s *Service) SetRecorder(r activity.Recorder) { s.acts = r }

// recordUpdate writes ONE row per request, listing the keys that moved.
//
// The values are absent, and that is the whole point. mail.smtp_password,
// storage.s3_secret and ai.api_key come through planChange like every other
// key; the registry is what knows they are secrets, and by the time an audit
// entry exists the plaintext has already been encrypted away. Putting the new
// value in the metadata would park it in a JSONB column, in plaintext, in the
// one table built to be read by people — so the log written to catch a breach
// would be the easiest place in the system to commit one. Which key changed,
// and who changed it, is what anyone actually comes looking for; the value is
// in the settings screen for whoever is allowed to see it.
//
// The same rule applies to the non-secret keys, which is why none of the audit
// entries' old/new values are read here: a per-key allowlist would be one
// forgotten IsSecret away from leaking, and the key list answers the question
// without needing one.
func (s *Service) recordUpdate(ctx context.Context, id *httpx.Identity, audits []auditEntry) {
	if s.acts == nil || len(audits) == 0 {
		return
	}
	keys := make([]string, 0, len(audits))
	for _, a := range audits {
		keys = append(keys, a.key)
	}
	sort.Strings(keys) // the updates arrive as a map, so the order is otherwise random
	s.acts.Record(ctx, id, activity.Entry{
		Action:   actionUpdated,
		Metadata: map[string]any{"keys": keys},
	})
}

// recordEmailTest notes who probed SMTP and where to. The destination is the
// point of the row: the abuse this guards against is using the server's
// credentials to reach an address, not the test itself.
func (s *Service) recordEmailTest(ctx context.Context, id *httpx.Identity, to string) {
	if s.acts == nil {
		return
	}
	s.acts.Record(ctx, id, activity.Entry{
		Action:   actionEmailTested,
		Metadata: map[string]any{"to": to},
	})
}
