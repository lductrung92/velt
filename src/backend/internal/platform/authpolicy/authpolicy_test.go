package authpolicy

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestValidatePassword(t *testing.T) {
	cases := []struct {
		pw      string
		wantKey string
		wantOK  bool
	}{
		{"abcdefghijkl", "", true},
		{"short", "too_short", false},
		{"password1234", "", true},
		{"letmein12345", "too_common", false},
		{strings.ToUpper("letmein12345"), "too_common", false}, // case-insensitive
	}
	for _, c := range cases {
		key, ok := ValidatePassword(c.pw)
		require.Equal(t, c.wantOK, ok, c.pw)
		require.Equal(t, c.wantKey, key, c.pw)
	}
}
