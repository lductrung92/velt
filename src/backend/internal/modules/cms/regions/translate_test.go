package regions

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/velt/backend/internal/modules/cms/shared/cmstest"
	"github.com/velt/backend/internal/modules/cms/widgets"
)

// A block is translated field by field onto what was saved: the strings
// somebody wrote win, everything else — limits, flags, ids, media paths —
// stays, and an untranslated field keeps its original text rather than
// emptying.
func TestRegions_TranslatedConfigOverlaysTextAndKeepsTheRest(t *testing.T) {
	base := json.RawMessage(`{
		"title": "Liên hệ với chúng tôi",
		"body_html": "<p>Gọi ngay hôm nay.</p>",
		"limit": 4,
		"href": "/lien-he",
		"seo": {"title": "Liên hệ", "noindex": false}
	}`)
	values := map[string]any{"config": map[string]any{
		"title":     "Talk to us",
		"body_html": "   ", // blank: keeps the original
		"limit":     99,    // not text: ignored
		"seo":       map[string]any{"title": "Contact"},
	}}

	var got map[string]any
	require.NoError(t, json.Unmarshal(translatedConfig(base, values), &got))

	require.Equal(t, "Talk to us", got["title"])
	require.Equal(t, "<p>Gọi ngay hôm nay.</p>", got["body_html"], "a blank translation keeps the original")
	require.Equal(t, float64(4), got["limit"], "a number is not text and is never overlaid")
	require.Equal(t, "/lien-he", got["href"], "a field nobody translated keeps its value")
	require.Equal(t, "Contact", got["seo"].(map[string]any)["title"])
	require.Equal(t, false, got["seo"].(map[string]any)["noindex"])
}

func TestRegions_TranslatedConfigNothingToApply(t *testing.T) {
	base := json.RawMessage(`{"title":"Giữ nguyên"}`)
	for _, values := range []map[string]any{
		nil,
		{},
		{"config": map[string]any{}},
		{"config": "not an object"},
	} {
		require.JSONEq(t, string(base), string(translatedConfig(base, values)))
	}
}

// A block left out of the saved list is gone, so the copy stored against its id
// goes with it: ids are handed out by the database and a row left behind would
// come back attached to whatever block is given that id next.
func TestRegions_ReplacePurgesTheTranslationsOfRemovedBlocks(t *testing.T) {
	e := newTestSvc(t)
	tr := newFakeTranslator()
	e.svc.SetTranslator(tr)
	ctx := context.Background()
	actor := cmstest.ActorWith(permManage, permView)

	saved, err := e.svc.ReplaceRegionBlocks(ctx, actor, GroupCommon, SlotFooter, BlocksRequest{
		Blocks: []BlockInput{
			widgetBlock(widgets.TypeRichText, `{"body_html":"<p>Một</p>"}`),
			widgetBlock(widgets.TypeRichText, `{"body_html":"<p>Hai</p>"}`),
		},
	})
	require.NoError(t, err)
	require.Len(t, saved.Blocks, 2)
	kept, dropped := saved.Blocks[0], saved.Blocks[1]

	// Save again with only the first block, sent back under its own id.
	keptInput := widgetBlock(widgets.TypeRichText, `{"body_html":"<p>Một</p>"}`)
	keptInput.ID = &kept.ID
	_, err = e.svc.ReplaceRegionBlocks(ctx, actor, GroupCommon, SlotFooter,
		BlocksRequest{Blocks: []BlockInput{keptInput}})
	require.NoError(t, err)

	require.Equal(t, []uuid.UUID{dropped.ID}, tr.purged,
		"only the block that is gone is purged")
}

// Translating a block's text is editing the chrome, so it answers to the same
// gate as placing the block — and a block that is not there cannot be
// translated into existence.
func TestRegions_AuthorizeTranslateRequiresMenuManage(t *testing.T) {
	e := newTestSvc(t)
	ctx := context.Background()
	saved, err := e.svc.ReplaceRegionBlocks(ctx, cmstest.ActorWith(permManage), GroupCommon, SlotFooter,
		BlocksRequest{Blocks: []BlockInput{widgetBlock(widgets.TypeRichText, `{"body_html":"<p>Một</p>"}`)}})
	require.NoError(t, err)
	id := saved.Blocks[0].ID

	cmstest.AssertAppErr(t, e.svc.AuthorizeTranslate(ctx, cmstest.ActorWith(permView), id),
		http.StatusForbidden, "access_denied")
	cmstest.AssertAppErr(t, e.svc.AuthorizeTranslate(ctx, cmstest.ActorWith(permManage), uuid.New()),
		http.StatusNotFound, "not_found")
	require.NoError(t, e.svc.AuthorizeTranslate(ctx, cmstest.ActorWith(permManage), id))
}
