package mcp

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/velt/backend/internal/httpx"
	"github.com/velt/backend/internal/modules/ai/tools"
)

// A registry holding one of each shape the MCP edge has to tell apart: an
// anonymous read, an anonymous WRITE, and two permissioned reads.
func fixture() (*Server, *int) {
	calls := 0
	reg := tools.NewRegistry()
	reg.Add(tools.Tool{
		Name: "open_read", Schema: map[string]any{"type": "object"},
		Run: func(context.Context, json.RawMessage) (any, error) { calls++; return "ok", nil },
	})
	reg.Add(tools.Tool{
		Name: "open_write", Writes: true, Schema: map[string]any{"type": "object"},
		Run: func(context.Context, json.RawMessage) (any, error) { calls++; return "ok", nil },
	})
	reg.Add(tools.Tool{
		Name: "needs_leads", Permission: tools.PermLeadsView, Schema: map[string]any{"type": "object"},
		Run: func(context.Context, json.RawMessage) (any, error) { calls++; return "leads", nil },
	})
	reg.Add(tools.Tool{
		Name: "needs_chat", Permission: tools.PermChatHandle, Schema: map[string]any{"type": "object"},
		Run: func(context.Context, json.RawMessage) (any, error) { calls++; return "chat", nil },
	})
	return NewServer(reg, nil, nil), &calls
}

func who(perms ...string) *httpx.Identity {
	return &httpx.Identity{UserID: uuid.New(), Permissions: perms}
}

func call(t *testing.T, s *Server, id *httpx.Identity, method string, params any) rpcResponse {
	t.Helper()
	body := map[string]any{"jsonrpc": "2.0", "id": 1, "method": method}
	if params != nil {
		body["params"] = params
	}
	raw, err := json.Marshal(body)
	require.NoError(t, err)
	return s.Handle(context.Background(), id, raw)
}

func toolNames(t *testing.T, res rpcResponse) []string {
	t.Helper()
	m, ok := res.Result.(map[string]any)
	require.True(t, ok)
	list, ok := m["tools"].([]map[string]any)
	require.True(t, ok)
	out := []string{}
	for _, tl := range list {
		out = append(out, tl["name"].(string))
	}
	return out
}

func TestInitializeAdvertisesTools(t *testing.T) {
	s, _ := fixture()
	res := call(t, s, who(), "initialize", nil)
	require.Nil(t, res.Error)
	m := res.Result.(map[string]any)
	require.Equal(t, protocolVersion, m["protocolVersion"])
	require.Contains(t, m["capabilities"].(map[string]any), "tools")
}

func TestToolsListIsFilteredByPermission(t *testing.T) {
	// Filtering at list time, not only at call time: a model that is never
	// shown a tool does not try it, so the whole try-then-get-refused round
	// never happens.
	s, _ := fixture()

	require.Equal(t, []string{"open_read"}, toolNames(t, call(t, s, who(), "tools/list", nil)))

	require.Equal(t, []string{"open_read", "needs_leads"},
		toolNames(t, call(t, s, who(tools.PermLeadsView), "tools/list", nil)))

	require.Equal(t, []string{"open_read", "needs_leads", "needs_chat"},
		toolNames(t, call(t, s, who(tools.PermLeadsView, tools.PermChatHandle), "tools/list", nil)))
}

func TestWriteToolsNeverReachMCP(t *testing.T) {
	// An unpermissioned write exists for the site assistant, which holds the
	// session context that makes it safe. An agent has no such context, so it
	// must not see or be able to call it — even as a super admin.
	s, calls := fixture()

	for _, id := range []*httpx.Identity{who(), who("*")} {
		require.NotContains(t, toolNames(t, call(t, s, id, "tools/list", nil)), "open_write")

		res := call(t, s, id, "tools/call", map[string]any{"name": "open_write"})
		m := res.Result.(map[string]any)
		require.Equal(t, true, m["isError"])
	}
	require.Zero(t, *calls, "a write tool must not run from this edge")
}

func TestCallRefusesAToolTheCallerCannotSee(t *testing.T) {
	// The list is a convenience; this is the control.
	s, calls := fixture()
	res := call(t, s, who(), "tools/call", map[string]any{"name": "needs_leads"})
	m := res.Result.(map[string]any)
	require.Equal(t, true, m["isError"])
	require.Zero(t, *calls)
}

func TestCallRunsAPermittedTool(t *testing.T) {
	s, calls := fixture()
	res := call(t, s, who(tools.PermLeadsView), "tools/call",
		map[string]any{"name": "needs_leads", "arguments": map[string]any{}})
	require.Nil(t, res.Error)
	m := res.Result.(map[string]any)
	require.Nil(t, m["isError"])
	require.Equal(t, 1, *calls)
}

func TestWildcardPermissionStillCannotWrite(t *testing.T) {
	// A super admin gets every permissioned tool and still no write.
	s, _ := fixture()
	names := toolNames(t, call(t, s, who("*"), "tools/list", nil))
	require.Contains(t, names, "needs_leads")
	require.Contains(t, names, "needs_chat")
	require.NotContains(t, names, "open_write")
}

func TestMissingArgumentsBecomeAnEmptyObject(t *testing.T) {
	s, calls := fixture()
	res := call(t, s, who(), "tools/call", map[string]any{"name": "open_read"})
	require.Nil(t, res.Error)
	require.Equal(t, 1, *calls)
}

func TestToolFailureIsAResultNotAProtocolError(t *testing.T) {
	// The model should be able to read what went wrong and try something else,
	// which a JSON-RPC error would not let it do.
	s, _ := fixture()
	res := call(t, s, who(), "tools/call", map[string]any{"name": "khong_ton_tai"})
	require.Nil(t, res.Error)
	require.Equal(t, true, res.Result.(map[string]any)["isError"])
}

func TestUnknownMethodAndBadEnvelope(t *testing.T) {
	s, _ := fixture()

	res := call(t, s, who(), "tools/delete_everything", nil)
	require.NotNil(t, res.Error)
	require.Equal(t, codeMethodNotFound, res.Error.Code)

	bad := s.Handle(context.Background(), who(), []byte(`{not json`))
	require.NotNil(t, bad.Error)
	require.Equal(t, codeParse, bad.Error.Code)

	wrongVersion := s.Handle(context.Background(), who(),
		[]byte(`{"jsonrpc":"1.0","id":1,"method":"ping"}`))
	require.NotNil(t, wrongVersion.Error)
	require.Equal(t, codeInvalidRequest, wrongVersion.Error.Code)
}

func TestTokenHashIsNotTheToken(t *testing.T) {
	a, b := hashToken("zkt_mcp_abc"), hashToken("zkt_mcp_abd")
	require.NotEqual(t, a, b)
	require.Len(t, a, 64)
	require.NotContains(t, a, "zkt_mcp_")
}
