package cmstest

import (
	"bytes"
	"context"
	"errors"
	"io"
	"path"
	"strings"
	"sync"

	"github.com/velt/backend/internal/platform/storage"
)

// FakeStore is an in-memory storage.Storage: records Save'd bytes (so media tests
// can assert what was written) and turns a key into a deterministic URL.
type FakeStore struct {
	mu    sync.Mutex
	Saved map[string][]byte
}

// NewFakeStore builds an empty in-memory store.
func NewFakeStore() *FakeStore { return &FakeStore{Saved: map[string][]byte{}} }

// Save records the bytes under key.
func (s *FakeStore) Save(_ context.Context, key string, r io.Reader) error {
	b, err := io.ReadAll(r)
	if err != nil {
		return err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.Saved[key] = b
	return nil
}

// Open returns a reader over previously Save'd bytes.
func (s *FakeStore) Open(_ context.Context, key string) (io.ReadCloser, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	b, ok := s.Saved[key]
	if !ok {
		return nil, errors.New("not found")
	}
	return io.NopCloser(bytes.NewReader(b)), nil
}

// Delete drops the key.
func (s *FakeStore) Delete(_ context.Context, key string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.Saved, key)
	return nil
}

// URL returns a deterministic CDN URL for key.
func (*FakeStore) URL(_ context.Context, key string) string { return "https://cdn.test/" + key }

// List returns every stored object under prefix (satisfies the lister capability
// media-GC uses to reconcile an entity's folder against its live references).
func (s *FakeStore) List(_ context.Context, prefix string) ([]storage.Entry, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]storage.Entry, 0)
	for k := range s.Saved {
		if strings.HasPrefix(k, prefix) {
			out = append(out, storage.Entry{Name: path.Base(k), Path: k})
		}
	}
	return out, nil
}

// DeleteTree drops every key under prefix — mirrors the production storage
// Manager's recursive delete so media-GC tests can assert a whole folder is
// reclaimed (satisfies the optional treeDeleter capability used by
// shared.PurgeMediaTree).
func (s *FakeStore) DeleteTree(_ context.Context, prefix string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for k := range s.Saved {
		if strings.HasPrefix(k, prefix) {
			delete(s.Saved, k)
		}
	}
	return nil
}
