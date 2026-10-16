package landing

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"

	"github.com/velt/backend/internal/modules/cms/shared"
	"github.com/velt/backend/internal/platform/media"
	"github.com/velt/backend/internal/platform/storage"
)

// PagesPort is the admin-side port the pages service drives when a landing lives
// as an attachment of a page (create-with-page, publish-with-page, delete-with-
// page). It wraps the repository directly and performs NO permission checks —
// the caller (pages service) has already authorized the page operation this is a
// consequence of; the landing here is an implementation detail of the page.
type PagesPort struct {
	repo  Repository
	files storage.Storage // reclaim section/og media on delete + publish
	// forget drops the public identity of the media it reclaims. It may stay
	// nil, which is the shape this port had before the `files` table existed.
	forget media.Forgetter
}

// NewPagesPort builds the pages-facing admin port.
func NewPagesPort(repo Repository, files storage.Storage) *PagesPort {
	return &PagesPort{repo: repo, files: files}
}

// SetMediaForget wires the files-table forgetter (called once at startup).
func (p *PagesPort) SetMediaForget(f media.Forgetter) { p.forget = f }

// CreateDraft creates an empty draft landing for a page (name = page title,
// key derived from the page slug). Landing keys are globally UNIQUE while page
// slugs are unique per parent, so a taken key gets a numeric suffix.
func (p *PagesPort) CreateDraft(ctx context.Context, name, key string) (uuid.UUID, error) {
	try := key
	for i := 2; ; i++ {
		created, err := p.repo.CreateLanding(ctx, landingWrite{Key: try, Name: name})
		if err == nil {
			return created.ID, nil
		}
		if !errors.Is(err, shared.ErrConflict) || i > 50 {
			return uuid.Nil, fmt.Errorf("create landing for page: %w", err)
		}
		try = fmt.Sprintf("%s-%d", key, i)
	}
}

// Delete removes a landing (sections cascade). Missing landing is treated as
// done — the delete is a cleanup step, not a user-visible operation.
func (p *PagesPort) Delete(ctx context.Context, id uuid.UUID) error {
	if err := p.repo.DeleteLanding(ctx, id); err != nil && !errors.Is(err, shared.ErrNotFound) {
		return fmt.Errorf("delete landing for page: %w", err)
	}
	// Landing (+ its snapshot) is gone → reclaim its whole media folder.
	_ = shared.PurgeMediaTree(ctx, p.files, p.forget, "cms/landing/"+id.String()+"/")
	return nil
}

// Publish freezes the landing's CURRENT visible sections into its published
// snapshot. The page publish is the action, so the landing must always mirror it:
// even an already-published landing gets its snapshot rebuilt (SetLandingPublished
// is unconditional), so a prior failed best-effort unpublish can't strand a stale
// snapshot on the public page.
func (p *PagesPort) Publish(ctx context.Context, id uuid.UUID) error {
	cur, err := p.repo.GetLanding(ctx, id)
	if errors.Is(err, shared.ErrNotFound) {
		return nil // stale landing_id → nothing to publish
	}
	if err != nil {
		return fmt.Errorf("publish landing for page: %w", err)
	}
	sections, err := p.repo.LandingSections(ctx, id)
	if err != nil {
		return fmt.Errorf("publish landing for page: %w", err)
	}
	snap, err := buildLandingSnapshot(*cur, sections)
	if err != nil {
		return fmt.Errorf("publish landing for page: %w", err)
	}
	if _, err := p.repo.SetLandingPublished(ctx, id, snap); err != nil {
		if errors.Is(err, shared.ErrNotFound) {
			return nil // deleted mid-flight → nothing to publish
		}
		return fmt.Errorf("publish landing for page: %w", err)
	}
	// Reclaim media that dropped out of the snapshot since the last publish, but
	// keep anything still referenced by a current (incl. hidden) section or og_path.
	gcDroppedMedia(ctx, p.files, p.forget, landingMediaPrefix(id), cur.PublishedSnapshot,
		liveMediaPaths(snap, sections, cur.OGPath))
	return nil
}

// Unpublish flips the landing back to draft. Already-draft (or missing) is a
// no-op for the same idempotency reason as Publish.
func (p *PagesPort) Unpublish(ctx context.Context, id uuid.UUID) error {
	if _, err := p.repo.UnpublishLanding(ctx, id); err != nil &&
		!errors.Is(err, shared.ErrInvalidStatus) && !errors.Is(err, shared.ErrNotFound) {
		return fmt.Errorf("unpublish landing for page: %w", err)
	}
	return nil
}
