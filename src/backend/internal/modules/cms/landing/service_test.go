package landing

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/velt/backend/internal/modules/cms/shared/cmstest"
)

func mkLanding(t *testing.T, e *tenv, key string) Response {
	t.Helper()
	res, err := e.svc.CreateLanding(context.Background(), cmstest.ActorWith(permManage), CreateLandingRequest{Key: key, Name: key})
	require.NoError(t, err)
	return res
}

func TestLanding_CreateAndKeyUnique(t *testing.T) {
	e := newTestSvc(t)
	a := mkLanding(t, e, "home")
	require.Equal(t, "home", a.Key)
	require.Equal(t, LandingStatusDraft, a.Status)
	_, err := e.svc.CreateLanding(context.Background(), cmstest.ActorWith(permManage), CreateLandingRequest{Key: "home", Name: "Home 2"})
	cmstest.AssertAppErr(t, err, http.StatusUnprocessableEntity, "key_already_exists")
}

func TestLanding_CreatePermissionDenied(t *testing.T) {
	e := newTestSvc(t)
	_, err := e.svc.CreateLanding(context.Background(), cmstest.ActorWith(), CreateLandingRequest{Key: "x", Name: "X"})
	cmstest.AssertAppErr(t, err, http.StatusForbidden, "access_denied")
}

func TestLanding_GetNotFound(t *testing.T) {
	e := newTestSvc(t)
	_, err := e.svc.GetLanding(context.Background(), cmstest.ActorWith(permManage), uuid.New())
	cmstest.AssertAppErr(t, err, http.StatusNotFound, "not_found")
}

func TestLanding_DeleteCascadesSections(t *testing.T) {
	e := newTestSvc(t)
	l := mkLanding(t, e, "home")
	_, err := e.svc.CreateSection(context.Background(), cmstest.ActorWith(permManage), l.ID,
		CreateSectionRequest{Type: SectionRichText, Config: json.RawMessage(`{"body_html":"<p>hi</p>"}`)})
	require.NoError(t, err)
	require.NoError(t, e.svc.DeleteLanding(context.Background(), cmstest.ActorWith(permManage), l.ID))
	require.Empty(t, e.repo.sections)
}

func TestLanding_CreateSectionDefaultsVisibleAndAppends(t *testing.T) {
	e := newTestSvc(t)
	l := mkLanding(t, e, "home")
	act := cmstest.ActorWith(permManage)
	_, err := e.svc.CreateSection(context.Background(), act, l.ID, CreateSectionRequest{Type: SectionHero})
	require.NoError(t, err)
	det, err := e.svc.CreateSection(context.Background(), act, l.ID, CreateSectionRequest{Type: SectionFAQ})
	require.NoError(t, err)
	require.Len(t, det.Sections, 2)
	require.True(t, det.Sections[0].IsVisible) // default true
	require.Equal(t, 0, det.Sections[0].SortOrder)
	require.Equal(t, 1, det.Sections[1].SortOrder)
}

func TestLanding_SectionConfigSanitizesRichText(t *testing.T) {
	e := newTestSvc(t)
	l := mkLanding(t, e, "home")
	det, err := e.svc.CreateSection(context.Background(), cmstest.ActorWith(permManage), l.ID,
		CreateSectionRequest{Type: SectionRichText, Config: json.RawMessage(`{"body_html":"<p>ok</p><script>evil()</script>"}`)})
	require.NoError(t, err)
	var cfg map[string]any
	require.NoError(t, json.Unmarshal(det.Sections[0].Config, &cfg))
	require.NotContains(t, cfg["body_html"], "<script")
	require.Contains(t, cfg["body_html"], "<p>ok</p>")
}

func TestLanding_SectionConfigEmbedWhitelist(t *testing.T) {
	e := newTestSvc(t)
	l := mkLanding(t, e, "home")
	act := cmstest.ActorWith(permManage)
	bad, err := e.svc.CreateSection(context.Background(), act, l.ID,
		CreateSectionRequest{Type: SectionHTMLEmbed, Config: json.RawMessage(`{"html":"<iframe src=\"https://evil.example/x\"></iframe>"}`)})
	require.NoError(t, err)
	var cfgBad map[string]any
	require.NoError(t, json.Unmarshal(bad.Sections[0].Config, &cfgBad))
	require.NotContains(t, cfgBad["html"], "evil.example")
	det, err := e.svc.UpdateSection(context.Background(), act, bad.Sections[0].ID,
		UpdateSectionRequest{Config: json.RawMessage(`{"html":"<iframe src=\"https://www.youtube.com/embed/abc\"></iframe>"}`)})
	require.NoError(t, err)
	var cfgOK map[string]any
	require.NoError(t, json.Unmarshal(det.Sections[0].Config, &cfgOK))
	require.Contains(t, cfgOK["html"], "youtube.com/embed/abc")
}

func TestLanding_SectionConfigInvalidObject(t *testing.T) {
	e := newTestSvc(t)
	l := mkLanding(t, e, "home")
	_, err := e.svc.CreateSection(context.Background(), cmstest.ActorWith(permManage), l.ID,
		CreateSectionRequest{Type: SectionHero, Config: json.RawMessage(`["not","an","object"]`)})
	cmstest.AssertFieldErr(t, err, "config", "invalid")
}

func TestLanding_SectionConfigRejectsDangerousScheme(t *testing.T) {
	e := newTestSvc(t)
	l := mkLanding(t, e, "home")
	_, err := e.svc.CreateSection(context.Background(), cmstest.ActorWith(permManage), l.ID,
		CreateSectionRequest{Type: SectionCTABanner, Config: json.RawMessage(`{"cta_url":"javascript:alert(1)"}`)})
	cmstest.AssertFieldErr(t, err, "config", "invalid_url")
}

func TestLanding_SectionConfigRejectsOversized(t *testing.T) {
	e := newTestSvc(t)
	l := mkLanding(t, e, "home")
	big := `{"x":"` + strings.Repeat("a", 70*1024) + `"}`
	_, err := e.svc.CreateSection(context.Background(), cmstest.ActorWith(permManage), l.ID,
		CreateSectionRequest{Type: SectionRichText, Config: json.RawMessage(big)})
	cmstest.AssertFieldErr(t, err, "config", "too_large")
}

func TestLanding_ReorderSections(t *testing.T) {
	e := newTestSvc(t)
	l := mkLanding(t, e, "home")
	act := cmstest.ActorWith(permManage)
	d1, _ := e.svc.CreateSection(context.Background(), act, l.ID, CreateSectionRequest{Type: SectionHero})
	_ = d1
	det, _ := e.svc.CreateSection(context.Background(), act, l.ID, CreateSectionRequest{Type: SectionFAQ})
	first, second := det.Sections[0].ID, det.Sections[1].ID

	res, err := e.svc.ReorderSections(context.Background(), act, l.ID, ReorderSectionsRequest{SectionIDs: []uuid.UUID{second, first}})
	require.NoError(t, err)
	require.Equal(t, second, res.Sections[0].ID)
	require.Equal(t, first, res.Sections[1].ID)

	_, err = e.svc.ReorderSections(context.Background(), act, l.ID, ReorderSectionsRequest{SectionIDs: []uuid.UUID{first}})
	cmstest.AssertFieldErr(t, err, "section_ids", "mismatch")
}

func TestLanding_PublishSnapshotsVisibleOnly(t *testing.T) {
	e := newTestSvc(t)
	l := mkLanding(t, e, "home")
	act := cmstest.ActorWith(permManage)
	visible := false
	_, _ = e.svc.CreateSection(context.Background(), act, l.ID, CreateSectionRequest{Type: SectionHero})
	_, _ = e.svc.CreateSection(context.Background(), act, l.ID, CreateSectionRequest{Type: SectionFAQ, IsVisible: &visible})

	res, err := e.svc.PublishLanding(context.Background(), act, l.ID)
	require.NoError(t, err)
	require.Equal(t, LandingStatusPublished, res.Status)

	var snap landingSnapshot
	require.NoError(t, json.Unmarshal(e.repo.landings[l.ID].PublishedSnapshot, &snap))
	require.Len(t, snap.Sections, 1) // only the visible hero
	require.Equal(t, SectionHero, snap.Sections[0].Type)

	res, err = e.svc.UnpublishLanding(context.Background(), act, l.ID)
	require.NoError(t, err)
	require.Equal(t, LandingStatusDraft, res.Status)
}

// Save = live: hiding a section on a PUBLISHED landing re-freezes the snapshot
// immediately (no re-publish), so the hidden section leaves the public page.
func TestLanding_SaveIsLive_HidingSectionRefreshesSnapshot(t *testing.T) {
	e := newTestSvc(t)
	l := mkLanding(t, e, "home")
	act := cmstest.ActorWith(permManage)
	_, _ = e.svc.CreateSection(context.Background(), act, l.ID, CreateSectionRequest{Type: SectionHero})
	d, err := e.svc.CreateSection(context.Background(), act, l.ID, CreateSectionRequest{Type: SectionFAQ})
	require.NoError(t, err)
	require.Len(t, d.Sections, 2)

	_, err = e.svc.PublishLanding(context.Background(), act, l.ID)
	require.NoError(t, err)
	var snap landingSnapshot
	require.NoError(t, json.Unmarshal(e.repo.landings[l.ID].PublishedSnapshot, &snap))
	require.Len(t, snap.Sections, 2)

	hidden := false
	_, err = e.svc.UpdateSection(context.Background(), act, d.Sections[0].ID,
		UpdateSectionRequest{IsVisible: &hidden})
	require.NoError(t, err)
	require.NoError(t, json.Unmarshal(e.repo.landings[l.ID].PublishedSnapshot, &snap))
	require.Len(t, snap.Sections, 1) // hero hidden → dropped from the live snapshot
	require.Equal(t, SectionFAQ, snap.Sections[0].Type)
}

// A DRAFT landing has nothing public, so editing a section must NOT freeze a
// snapshot (no accidental publish).
func TestLanding_SaveIsLive_DraftNotRefreshed(t *testing.T) {
	e := newTestSvc(t)
	l := mkLanding(t, e, "draft")
	act := cmstest.ActorWith(permManage)
	d, err := e.svc.CreateSection(context.Background(), act, l.ID, CreateSectionRequest{Type: SectionHero})
	require.NoError(t, err)
	hidden := false
	_, err = e.svc.UpdateSection(context.Background(), act, d.Sections[0].ID,
		UpdateSectionRequest{IsVisible: &hidden})
	require.NoError(t, err)
	require.Empty(t, e.repo.landings[l.ID].PublishedSnapshot)
}

func TestLanding_UpdateSectionNotFound(t *testing.T) {
	e := newTestSvc(t)
	_, err := e.svc.UpdateSection(context.Background(), cmstest.ActorWith(permManage), uuid.New(), UpdateSectionRequest{})
	cmstest.AssertAppErr(t, err, http.StatusNotFound, "not_found")
}

func TestLanding_ListRequiresPermission(t *testing.T) {
	e := newTestSvc(t)
	_, err := e.svc.ListLandings(context.Background(), cmstest.ActorWith())
	cmstest.AssertAppErr(t, err, http.StatusForbidden, "access_denied")
}

func TestLanding_UpdateOK(t *testing.T) {
	e := newTestSvc(t)
	l := mkLanding(t, e, "home")
	name := "Home Renamed"
	res, err := e.svc.UpdateLanding(context.Background(), cmstest.ActorWith(permManage), l.ID,
		UpdateLandingRequest{Name: &name, UpdatedAt: &l.UpdatedAt})
	require.NoError(t, err)
	require.Equal(t, "Home Renamed", res.Name)
	require.True(t, res.UpdatedAt.After(l.UpdatedAt)) // version advanced
}

// A stale updated_at loses the optimistic lock → 409 (was silently
// last-writer-wins before landing got optimistic locking).
func TestLanding_UpdateOptimisticConflict(t *testing.T) {
	e := newTestSvc(t)
	l := mkLanding(t, e, "home")
	stale := l.UpdatedAt.Add(-time.Hour)
	name := "X"
	_, err := e.svc.UpdateLanding(context.Background(), cmstest.ActorWith(permManage), l.ID,
		UpdateLandingRequest{Name: &name, UpdatedAt: &stale})
	cmstest.AssertAppErr(t, err, http.StatusConflict, "conflict")
}

func TestLanding_UpdateNotFound(t *testing.T) {
	e := newTestSvc(t)
	ts := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	name := "X"
	_, err := e.svc.UpdateLanding(context.Background(), cmstest.ActorWith(permManage), uuid.New(),
		UpdateLandingRequest{Name: &name, UpdatedAt: &ts})
	cmstest.AssertAppErr(t, err, http.StatusNotFound, "not_found")
}

// Publishing an already-published landing is a no-op transition → 422 (the repo's
// status<>'published' guard, surfaced; also closes the publish-race window).
func TestLanding_PublishAlreadyPublishedRejected(t *testing.T) {
	e := newTestSvc(t)
	l := mkLanding(t, e, "home")
	act := cmstest.ActorWith(permManage)
	_, err := e.svc.PublishLanding(context.Background(), act, l.ID)
	require.NoError(t, err)
	_, err = e.svc.PublishLanding(context.Background(), act, l.ID)
	cmstest.AssertAppErr(t, err, http.StatusUnprocessableEntity, "invalid_status_transition")
}

func TestLanding_UnpublishWhenDraftRejected(t *testing.T) {
	e := newTestSvc(t)
	l := mkLanding(t, e, "home")
	_, err := e.svc.UnpublishLanding(context.Background(), cmstest.ActorWith(permManage), l.ID)
	cmstest.AssertAppErr(t, err, http.StatusUnprocessableEntity, "invalid_status_transition")
}

// --- PagesPort (pages-driven lifecycle: create/publish/unpublish/delete) ---

func TestPagesPort_CreateDraft_SuffixesTakenKey(t *testing.T) {
	e := newTestSvc(t)
	port := NewPagesPort(e.repo, e.store)
	mkLanding(t, e, "home") // key "home" taken
	id, err := port.CreateDraft(context.Background(), "Home Page", "home")
	require.NoError(t, err)
	require.Equal(t, "home-2", e.repo.landings[id].Key) // suffixed, globally-unique key
	require.Equal(t, "Home Page", e.repo.landings[id].Name)
	require.Equal(t, LandingStatusDraft, e.repo.landings[id].Status)
}

func TestPagesPort_PublishIsIdempotent(t *testing.T) {
	e := newTestSvc(t)
	port := NewPagesPort(e.repo, e.store)
	l := mkLanding(t, e, "home")
	require.NoError(t, port.Publish(context.Background(), l.ID))
	require.Equal(t, LandingStatusPublished, e.repo.landings[l.ID].Status)
	require.NoError(t, port.Publish(context.Background(), l.ID), "second publish is a no-op")
}

func TestPagesPort_UnpublishAndDeleteAreNoopSafe(t *testing.T) {
	e := newTestSvc(t)
	port := NewPagesPort(e.repo, e.store)
	l := mkLanding(t, e, "home") // draft
	require.NoError(t, port.Unpublish(context.Background(), l.ID), "already draft → no-op")
	require.NoError(t, port.Delete(context.Background(), l.ID))
	require.NoError(t, port.Delete(context.Background(), l.ID), "already gone → no-op")
	require.NoError(t, port.Unpublish(context.Background(), uuid.New()), "missing landing → no-op")
}
