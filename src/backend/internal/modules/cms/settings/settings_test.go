package settings

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/velt/backend/internal/apperr"
	"github.com/velt/backend/internal/httpx"
	"github.com/velt/backend/internal/modules/cms/shared"
	"github.com/velt/backend/internal/modules/cms/shared/cmstest"
	settingssvc "github.com/velt/backend/internal/modules/settings"
)

// portFake records the last scoped write and serves a configurable group view.
type portFake struct {
	group       []map[string]any
	lastUpdates map[string]json.RawMessage
	lastPrefixes []string
	updateErr   error
}

func (f *portFake) GroupView(_ context.Context, group string) (settingssvc.GroupedView, error) {
	return settingssvc.GroupedView{group: f.group}, nil
}

func (f *portFake) UpdateScoped(_ context.Context, _ *httpx.Identity, updates map[string]json.RawMessage, allowPrefixes ...string) (settingssvc.GroupedView, error) {
	f.lastUpdates = updates
	f.lastPrefixes = allowPrefixes
	if f.updateErr != nil {
		return nil, f.updateErr
	}
	return settingssvc.GroupedView{shared.GroupCMS: f.group}, nil
}

func (f *portFake) GetInt(_ context.Context, _ string) int { return 0 }

type tenv struct {
	svc  *Service
	port *portFake
}

func newTestSvc(t *testing.T) *tenv {
	t.Helper()
	port := &portFake{}
	base := shared.NewBase(port, slog.New(slog.NewTextHandler(io.Discard, nil)))
	return &tenv{svc: NewService(base, port), port: port}
}

func TestGetSettings_RequiresRead(t *testing.T) {
	e := newTestSvc(t)
	_, err := e.svc.GetSettings(context.Background(), cmstest.ActorWith("cms.article.view"))
	cmstest.AssertAppErr(t, err, 403, "access_denied")
}

func TestGetSettings_ReturnsCMSGroup(t *testing.T) {
	e := newTestSvc(t)
	e.port.group = []map[string]any{{"key": shared.FlagPublishAllowNow, "type": "bool", "value": true}}
	view, err := e.svc.GetSettings(context.Background(), cmstest.ActorWith(permRead))
	require.NoError(t, err)
	require.Len(t, view[shared.GroupCMS], 1)
	require.Equal(t, shared.FlagPublishAllowNow, view[shared.GroupCMS][0]["key"])
}

func TestGetSettings_SuperAdminPasses(t *testing.T) {
	e := newTestSvc(t)
	_, err := e.svc.GetSettings(context.Background(), cmstest.SuperActor())
	require.NoError(t, err)
}

func TestUpdateSettings_RequiresManage(t *testing.T) {
	e := newTestSvc(t)
	_, err := e.svc.UpdateSettings(context.Background(), cmstest.ActorWith(permRead),
		UpdateRequest{Updates: map[string]json.RawMessage{shared.FlagPublishAllowNow: json.RawMessage(`false`)}})
	cmstest.AssertAppErr(t, err, 403, "access_denied")
	require.Nil(t, e.port.lastUpdates, "must not reach the settings writer when denied")
}

func TestUpdateSettings_ForwardsCMSPrefixAndScopesResponse(t *testing.T) {
	e := newTestSvc(t)
	e.port.group = []map[string]any{{"key": shared.FlagPublishAllowNow, "type": "bool", "value": false}}
	updates := map[string]json.RawMessage{shared.FlagPublishAllowNow: json.RawMessage(`false`)}

	view, err := e.svc.UpdateSettings(context.Background(), cmstest.ActorWith(permManage), UpdateRequest{Updates: updates})
	require.NoError(t, err)
	require.Equal(t,
		[]string{shared.KeyPrefixCMS, shared.KeyPrefixSite, shared.KeyPrefixTranslation},
		e.port.lastPrefixes,
		"writes must stay scoped to the three prefixes this screen owns")
	require.Equal(t, updates, e.port.lastUpdates)
	require.Contains(t, view, shared.GroupCMS)
	require.NotContains(t, view, "storage", "response is scoped to the cms group only")
}

func TestUpdateSettings_EmptyUpdatesNoOp(t *testing.T) {
	e := newTestSvc(t)
	e.port.group = []map[string]any{{"key": shared.FlagPublishAllowNow, "type": "bool", "value": true}}
	view, err := e.svc.UpdateSettings(context.Background(), cmstest.ActorWith(permManage),
		UpdateRequest{Updates: map[string]json.RawMessage{}})
	require.NoError(t, err)
	require.Len(t, view[shared.GroupCMS], 1)
}

func TestUpdateSettings_SurfacesWriterError(t *testing.T) {
	e := newTestSvc(t)
	e.port.updateErr = apperr.Unprocessable("unknown_setting_key")
	_, err := e.svc.UpdateSettings(context.Background(), cmstest.ActorWith(permManage),
		UpdateRequest{Updates: map[string]json.RawMessage{"storage.driver": json.RawMessage(`"s3"`)}})
	cmstest.AssertAppErr(t, err, 422, "unknown_setting_key")
}
