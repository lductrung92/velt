package storage

import (
	"context"
	"fmt"
	"io"
	"strings"
	"sync"
)

// SettingsReader is the subset of the settings service the Manager needs to
// resolve the active storage driver + S3 config at runtime.
type SettingsReader interface {
	GetString(ctx context.Context, key string) string
	GetSecret(ctx context.Context, key string) string
}

// Manager is a settings-aware Storage that picks the active driver per the
// `storage.driver` setting on each call — so an admin flipping the driver in
// the Settings screen takes effect immediately, without a restart. The S3
// client is built lazily and cached, rebuilt only when the S3 config changes.
type Manager struct {
	local    *Local
	settings SettingsReader

	mu   sync.Mutex
	s3   *S3
	s3fp string // fingerprint of the cached S3 client's config
}

// NewManager wraps a local driver and reads the driver choice + S3 config from
// settings at runtime.
func NewManager(local *Local, settings SettingsReader) *Manager {
	return &Manager{local: local, settings: settings}
}

func (m *Manager) isS3(ctx context.Context) bool {
	return m.settings.GetString(ctx, "storage.driver") == "s3"
}

func (m *Manager) s3Config(ctx context.Context) S3Config {
	return S3Config{
		Endpoint:  m.settings.GetString(ctx, "storage.s3_endpoint"),
		Region:    m.settings.GetString(ctx, "storage.s3_region"),
		Bucket:    m.settings.GetString(ctx, "storage.s3_bucket"),
		AccessKey: m.settings.GetString(ctx, "storage.s3_access_key"),
		Secret:    m.settings.GetSecret(ctx, "storage.s3_secret"),
	}
}

// active returns the driver for the current request: the cached/rebuilt S3
// driver when storage.driver=s3, else the local driver.
func (m *Manager) active(ctx context.Context) (Storage, error) {
	if !m.isS3(ctx) {
		return m.local, nil
	}
	cfg := m.s3Config(ctx)
	fp := strings.Join([]string{cfg.Endpoint, cfg.Region, cfg.Bucket, cfg.AccessKey, cfg.Secret}, "\x00")
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.s3 == nil || m.s3fp != fp {
		s3, err := NewS3(cfg)
		if err != nil {
			return nil, err
		}
		m.s3, m.s3fp = s3, fp
	}
	return m.s3, nil
}

// Save implements Storage.
func (m *Manager) Save(ctx context.Context, key string, r io.Reader) error {
	st, err := m.active(ctx)
	if err != nil {
		return err
	}
	return st.Save(ctx, key, r)
}

// Open implements Storage.
func (m *Manager) Open(ctx context.Context, key string) (io.ReadCloser, error) {
	st, err := m.active(ctx)
	if err != nil {
		return nil, err
	}
	return st.Open(ctx, key)
}

// Delete implements Storage.
func (m *Manager) Delete(ctx context.Context, key string) error {
	st, err := m.active(ctx)
	if err != nil {
		return err
	}
	return st.Delete(ctx, key)
}

// URL implements Storage. It is computed straight from settings (no client
// build) so it stays robust: a misconfigured S3 (missing endpoint/bucket) falls
// back to the local serving path instead of emitting a broken URL.
func (m *Manager) URL(ctx context.Context, key string) string {
	if validateKey(key) != nil {
		return ""
	}
	if m.isS3(ctx) {
		endpoint := m.settings.GetString(ctx, "storage.s3_endpoint")
		bucket := m.settings.GetString(ctx, "storage.s3_bucket")
		// bucket must be configured for S3 to work (used by the client + the cdn
		// rewrite) but is NOT part of the public URL — see s3PublicURL.
		if endpoint != "" && bucket != "" {
			return s3PublicURL(endpoint, key)
		}
	}
	return "/api/files/" + key
}

// browser returns the active driver as a Browser (both Local and S3 implement
// it). The directory ops below delegate through it.
func (m *Manager) browser(ctx context.Context) (Browser, error) {
	st, err := m.active(ctx)
	if err != nil {
		return nil, err
	}
	b, ok := st.(Browser)
	if !ok {
		return nil, fmt.Errorf("storage: active driver does not support browsing")
	}
	return b, nil
}

// List implements Browser.
func (m *Manager) List(ctx context.Context, prefix string) ([]Entry, error) {
	b, err := m.browser(ctx)
	if err != nil {
		return nil, err
	}
	return b.List(ctx, prefix)
}

// Stat implements Browser.
func (m *Manager) Stat(ctx context.Context, key string) (Entry, error) {
	b, err := m.browser(ctx)
	if err != nil {
		return Entry{}, err
	}
	return b.Stat(ctx, key)
}

// Mkdir implements Browser.
func (m *Manager) Mkdir(ctx context.Context, prefix string) error {
	b, err := m.browser(ctx)
	if err != nil {
		return err
	}
	return b.Mkdir(ctx, prefix)
}

// Copy implements Browser.
func (m *Manager) Copy(ctx context.Context, src, dst string) error {
	b, err := m.browser(ctx)
	if err != nil {
		return err
	}
	return b.Copy(ctx, src, dst)
}

// CopyTree implements Browser.
func (m *Manager) CopyTree(ctx context.Context, srcPrefix, dstPrefix string) error {
	b, err := m.browser(ctx)
	if err != nil {
		return err
	}
	return b.CopyTree(ctx, srcPrefix, dstPrefix)
}

// Move implements Browser.
func (m *Manager) Move(ctx context.Context, src, dst string) error {
	b, err := m.browser(ctx)
	if err != nil {
		return err
	}
	return b.Move(ctx, src, dst)
}

// DeleteTree implements Browser.
func (m *Manager) DeleteTree(ctx context.Context, prefix string) error {
	b, err := m.browser(ctx)
	if err != nil {
		return err
	}
	return b.DeleteTree(ctx, prefix)
}

// Exists implements Browser.
func (m *Manager) Exists(ctx context.Context, key string) (bool, error) {
	b, err := m.browser(ctx)
	if err != nil {
		return false, err
	}
	return b.Exists(ctx, key)
}

var (
	_ Storage = (*Manager)(nil)
	_ Browser = (*Manager)(nil)
)
