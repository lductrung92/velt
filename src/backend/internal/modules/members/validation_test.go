package members

import (
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/velt/backend/internal/httpx"
)

// Same guard as the catalog's: the console clears an optional field by sending
// "", and go-playground's `omitempty` checks the POINTER rather than the value
// behind it, so a format rule on a *string still fires on the clear sentinel.
// That shipped once here already (the `email` tag), so pin the behaviour.
func TestCreateRequest_AcceptsEmptyStringAsTheClearSentinel(t *testing.T) {
	empty := ""
	req := CreateRequest{
		FullName: "A",
		Slug:     &empty,
		Role:     &empty,
		Bio:      &empty,
		Email:    &empty,
		Zalo:     &empty,
	}
	require.NoError(t, httpx.Validate(&req))
}

func TestUpdateRequest_AcceptsEmptyStringAsTheClearSentinel(t *testing.T) {
	empty := ""
	req := UpdateRequest{
		FullName: &empty,
		Slug:     &empty,
		Role:     &empty,
		Bio:      &empty,
		Email:    &empty,
		Zalo:     &empty,
	}
	require.NoError(t, httpx.Validate(&req))
}

func TestCreateRequest_StillRejectsAMissingName(t *testing.T) {
	require.Error(t, httpx.Validate(&CreateRequest{}))
}
