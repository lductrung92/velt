package localize

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

type fakeBundler struct {
	values map[uuid.UUID]map[string]map[string]any
	err    error
	calls  int
}

func (f *fakeBundler) Bundle(
	_ context.Context, _ string, ids []uuid.UUID, _ []string,
) (map[uuid.UUID]map[string]map[string]any, error) {
	f.calls++
	if f.err != nil {
		return nil, f.err
	}
	out := map[uuid.UUID]map[string]map[string]any{}
	for _, id := range ids {
		if v, ok := f.values[id]; ok {
			out[id] = v
		}
	}
	return out, nil
}

func TestFields_ReturnsTheLocaleThatWasAskedFor(t *testing.T) {
	id := uuid.New()
	b := &fakeBundler{values: map[uuid.UUID]map[string]map[string]any{
		id: {"en": {"title": "Release notes"}},
	}}
	got := Fields(context.Background(), b, "article", "en", []uuid.UUID{id})
	require.Equal(t, "Release notes", got[id]["title"])
}

func TestFields_SaysNothingWhenThereIsNothingToSay(t *testing.T) {
	id := uuid.New()
	b := &fakeBundler{values: map[uuid.UUID]map[string]map[string]any{
		id: {"en": {"title": "Release notes"}},
	}}
	// The source language is the row itself; asking for it would be a query
	// whose answer is thrown away.
	require.Nil(t, Fields(context.Background(), b, "article", "vi", []uuid.UUID{id}))
	require.Nil(t, Fields(context.Background(), b, "article", "", []uuid.UUID{id}))
	require.Nil(t, Fields(context.Background(), b, "article", "en", nil))
	require.Nil(t, Fields(context.Background(), nil, "article", "en", []uuid.UUID{id}))
	require.Equal(t, 0, b.calls, "none of those should reach the store")
}

// A list that cannot read the translation store still answers — in Vietnamese.
func TestFields_AFailedReadIsNotAFailedList(t *testing.T) {
	id := uuid.New()
	b := &fakeBundler{err: errors.New("boom")}
	require.Nil(t, Fields(context.Background(), b, "article", "en", []uuid.UUID{id}))
}

func TestStr_FallsBackToTheRow(t *testing.T) {
	values := map[string]any{"title": "Release notes", "excerpt": "", "n": 3}
	require.Equal(t, "Release notes", Str(values, "title", "Ghi chú phát hành"))
	// Left blank in the form means "not done yet", not "show nothing".
	require.Equal(t, "Ghi chú", Str(values, "excerpt", "Ghi chú"))
	require.Equal(t, "Ghi chú", Str(values, "missing", "Ghi chú"))
	// A space is not a translation. The store keeps what was typed, so without
	// this a translator who hits the spacebar blanks a title in the list.
	require.Equal(t, "Ghi chú", Str(map[string]any{"title": "   "}, "title", "Ghi chú"))
	// ...but a real value keeps its own spacing.
	require.Equal(t, " Release notes ", Str(map[string]any{"title": " Release notes "}, "title", "x"))
	require.Equal(t, "Ghi chú", Str(values, "n", "Ghi chú"))
	require.Equal(t, "Ghi chú", Str(nil, "title", "Ghi chú"))
}

func TestStrPtr_TakesTheTranslationEvenWhenTheRowIsEmpty(t *testing.T) {
	vi := "Tóm tắt"
	require.Equal(t, "Summary", *StrPtr(map[string]any{"summary": "Summary"}, "summary", &vi))
	require.Equal(t, "Summary", *StrPtr(map[string]any{"summary": "Summary"}, "summary", nil))
	require.Equal(t, &vi, StrPtr(map[string]any{}, "summary", &vi))
	require.Equal(t, &vi, StrPtr(map[string]any{"summary": "  "}, "summary", &vi))
	require.Nil(t, StrPtr(nil, "summary", nil))
}
