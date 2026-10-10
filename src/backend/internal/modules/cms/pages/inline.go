package pages

import (
	"encoding/json"

	"github.com/velt/backend/internal/modules/cms/widgets"
)

// extractInlineWidgets walks a Tiptap body_json document and collects every
// inline `widget` node into snapshot form. Each node carries attrs
// {wid, wtype, config}; the config is run through the same per-type sanitizer
// as page blocks, and nodes with an unknown type, missing wid, or rejected
// config are dropped (they never reach the public read path). The returned
// order matches document order, but the public web matches by wid, not index.
func extractInlineWidgets(bodyJSON json.RawMessage) []inlineWidgetSnap {
	if len(bodyJSON) == 0 {
		return nil
	}
	var doc map[string]any
	if err := json.Unmarshal(bodyJSON, &doc); err != nil {
		return nil
	}
	var out []inlineWidgetSnap
	seen := map[string]bool{}
	var walk func(node map[string]any)
	walk = func(node map[string]any) {
		if t, _ := node["type"].(string); t == "widget" {
			if snap, ok := inlineWidgetFromNode(node); ok && !seen[snap.Wid] {
				seen[snap.Wid] = true
				out = append(out, snap)
			}
		}
		if content, ok := node["content"].([]any); ok {
			for _, c := range content {
				if child, ok := c.(map[string]any); ok {
					walk(child)
				}
			}
		}
	}
	walk(doc)
	return out
}

// inlineWidgetFromNode validates a single `widget` node's attrs and returns its
// snapshot. ok is false when the node is malformed or its config is rejected.
func inlineWidgetFromNode(node map[string]any) (inlineWidgetSnap, bool) {
	attrs, _ := node["attrs"].(map[string]any)
	wid, _ := attrs["wid"].(string)
	wtype, _ := attrs["wtype"].(string)
	if wid == "" || wtype == "" {
		return inlineWidgetSnap{}, false
	}
	rawCfg, err := json.Marshal(attrs["config"])
	if err != nil {
		return inlineWidgetSnap{}, false
	}
	clean, err := widgets.SanitizeConfig(wtype, rawCfg)
	if err != nil {
		return inlineWidgetSnap{}, false
	}
	return inlineWidgetSnap{Wid: wid, Type: wtype, Config: clean}, true
}
