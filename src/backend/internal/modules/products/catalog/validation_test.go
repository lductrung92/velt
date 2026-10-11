package catalog

import (
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/velt/backend/internal/httpx"
)

// The console clears an optional field by sending "" — never by omitting it or
// sending null. go-playground's `omitempty` checks the POINTER, not the value
// behind it, so a non-nil *string holding "" is "present" and any format rule
// (len, email, url, oneof, …) still fires. That has already shipped one bug per
// module; this test runs the real validator over a request where every optional
// string is the clear sentinel, so a tag that misbehaves fails here instead of
// at the first save in the browser.
func TestCreateRequest_AcceptsEmptyStringAsTheClearSentinel(t *testing.T) {
	empty := ""
	req := CreateRequest{
		Name:       "A",
		Slug:       &empty,
		Summary:    &empty,
		BodyHTML:   &empty,
		Lifecycle:  &empty,
		Version:    &empty,
		ReleasedAt: &empty,
		ProductURL: &empty,
		DemoURL:    &empty,
		DemoAccess: &empty,
		SEO: &SEO{
			Title: &empty, Description: &empty, Keywords: &empty,
			Canonical: &empty, OGTitle: &empty, OGDesc: &empty, OGPath: &empty,
		},
	}
	require.NoError(t, httpx.Validate(&req))
}

func TestUpdateRequest_AcceptsEmptyStringAsTheClearSentinel(t *testing.T) {
	empty := ""
	req := UpdateRequest{
		Name:       &empty,
		Slug:       &empty,
		Summary:    &empty,
		BodyHTML:   &empty,
		Lifecycle:  &empty,
		Version:    &empty,
		ReleasedAt: &empty,
		ProductURL: &empty,
		DemoURL:    &empty,
		DemoAccess: &empty,
		SEO: &SEO{
			Title: &empty, Description: &empty, Keywords: &empty,
			Canonical: &empty, OGTitle: &empty, OGDesc: &empty, OGPath: &empty,
		},
	}
	require.NoError(t, httpx.Validate(&req))
}

// The console also sends empty slices rather than omitting them.
func TestCreateRequest_AcceptsEmptySlices(t *testing.T) {
	req := CreateRequest{
		Name:             "A",
		Audience:         []string{},
		Platforms:        []string{},
		TechStack:        []string{},
		Highlights:       []string{},
		DemoInstructions: []string{},
	}
	require.NoError(t, httpx.Validate(&req))
}

// A genuinely bad value must still be rejected — the point is to stop the tag
// misfiring on "", not to stop it working.
func TestCreateRequest_StillRejectsAMissingName(t *testing.T) {
	require.Error(t, httpx.Validate(&CreateRequest{}))
}

func TestCreateRequest_StillRejectsAnOverlongName(t *testing.T) {
	long := make([]byte, 201)
	for i := range long {
		long[i] = 'a'
	}
	require.Error(t, httpx.Validate(&CreateRequest{Name: string(long)}))
}
