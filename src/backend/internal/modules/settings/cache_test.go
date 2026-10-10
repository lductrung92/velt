package settings

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestNoopCache_AlwaysMisses(t *testing.T) {
	var c Cache = NoopCache{}
	c.Set(context.Background(), snapshot{"k": {Value: json.RawMessage(`1`)}})
	_, ok := c.Get(context.Background())
	require.False(t, ok)
	c.Invalidate(context.Background()) // must not panic
}

func TestSnapshot_JSONRoundTrip(t *testing.T) {
	// The cache serializes the snapshot; ensure plaintext + encrypted survive.
	orig := snapshot{
		"app.name":           {Value: json.RawMessage(`"velt"`)},
		"mail.smtp_password": {Encrypted: []byte{0x01, 0x02, 0x03}},
	}
	b, err := json.Marshal(orig)
	require.NoError(t, err)

	var back snapshot
	require.NoError(t, json.Unmarshal(b, &back))
	require.JSONEq(t, `"velt"`, string(back["app.name"].Value))
	require.Equal(t, []byte{0x01, 0x02, 0x03}, back["mail.smtp_password"].Encrypted)
}
