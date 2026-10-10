package pages

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestExtractInlineWidgets(t *testing.T) {
	body := json.RawMessage(`{
		"type":"doc",
		"content":[
			{"type":"paragraph","content":[{"type":"text","text":"hi"}]},
			{"type":"widget","attrs":{"wid":"w1","wtype":"games_list","config":{"limit":6}}},
			{"type":"blockquote","content":[
				{"type":"widget","attrs":{"wid":"w2","wtype":"cta_banner","config":{"label":"Go","href":"https://x.test"}}}
			]}
		]
	}`)
	got := extractInlineWidgets(body)
	require.Len(t, got, 2)
	require.Equal(t, "w1", got[0].Wid)
	require.Equal(t, "games_list", got[0].Type)
	require.Equal(t, "w2", got[1].Wid)
	require.Equal(t, "cta_banner", got[1].Type)
}

func TestExtractInlineWidgets_DropsInvalid(t *testing.T) {
	body := json.RawMessage(`{
		"type":"doc",
		"content":[
			{"type":"widget","attrs":{"wid":"","wtype":"games_list","config":{}}},
			{"type":"widget","attrs":{"wid":"w2","wtype":"unknown_type","config":{}}},
			{"type":"widget","attrs":{"wid":"w3","wtype":"games_list","config":{"limit":6}}},
			{"type":"widget","attrs":{"wid":"w3","wtype":"games_list","config":{"limit":12}}}
		]
	}`)
	got := extractInlineWidgets(body)
	require.Len(t, got, 1, "empty wid, unknown type, and duplicate wid are dropped")
	require.Equal(t, "w3", got[0].Wid)
}

func TestExtractInlineWidgets_EmptyOrInvalidJSON(t *testing.T) {
	require.Nil(t, extractInlineWidgets(nil))
	require.Nil(t, extractInlineWidgets(json.RawMessage(`not json`)))
	require.Nil(t, extractInlineWidgets(json.RawMessage(`{"type":"doc"}`)))
}
