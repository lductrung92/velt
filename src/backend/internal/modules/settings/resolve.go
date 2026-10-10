package settings

import (
	"context"
	"encoding/json"
)

// loadSnapshot returns the settings snapshot, read-through the cache.
func (s *Service) loadSnapshot(ctx context.Context) (snapshot, error) {
	if snap, ok := s.cache.Get(ctx); ok {
		return snap, nil
	}
	snap, err := s.repo.LoadAll(ctx)
	if err != nil {
		return nil, err
	}
	s.cache.Set(ctx, snap)
	return snap, nil
}

// effectiveValue returns the resolved value of a non-secret key: the stored
// value if present, otherwise the registry default. Secrets have no plain value.
func (s *Service) effectiveValue(def SettingDef, snap snapshot) any {
	if def.IsSecret {
		return nil
	}
	if row, ok := snap[def.Key]; ok && len(row.Value) > 0 {
		var v any
		if json.Unmarshal(row.Value, &v) == nil {
			return v
		}
	}
	return def.Default
}

// buildView builds the grouped GET/PUT response (secrets masked to is_set).
func (s *Service) buildView(snap snapshot) GroupedView {
	view := GroupedView{}
	for _, key := range s.registry.Keys() {
		def, _ := s.registry.Get(key)
		entry := map[string]any{"key": def.Key, "type": string(def.Type)}
		if def.IsPublic {
			entry["is_public"] = true
		}
		if def.Type == TypeEnum {
			entry["allowed_values"] = def.AllowedValues
		}
		if def.Format != "" {
			entry["format"] = def.Format
		}
		if def.IsSecret {
			row, ok := snap[def.Key]
			entry["is_set"] = ok && len(row.Encrypted) > 0
		} else {
			entry["value"] = s.effectiveValue(def, snap)
		}
		view[def.Group] = append(view[def.Group], entry)
	}
	return view
}

func (s *Service) getString(snap snapshot, key string) string {
	def, ok := s.registry.Get(key)
	if !ok {
		return ""
	}
	if v, ok := s.effectiveValue(def, snap).(string); ok {
		return v
	}
	return ""
}

func (s *Service) getInt(snap snapshot, key string) int {
	def, ok := s.registry.Get(key)
	if !ok {
		return 0
	}
	switch v := s.effectiveValue(def, snap).(type) {
	case float64:
		return int(v)
	case int:
		return v
	default:
		return 0
	}
}

// getSecret decrypts a stored secret in RAM. Returns "" if unset; logs (without
// the value) if decryption fails.
func (s *Service) getSecret(ctx context.Context, snap snapshot, key string) string {
	row, ok := snap[key]
	if !ok || len(row.Encrypted) == 0 {
		return ""
	}
	plain, err := s.aead.Decrypt(row.Encrypted)
	if err != nil {
		s.sec(ctx).Error("settings: decrypt secret failed", "setting_key", key, "err", err)
		return ""
	}
	return string(plain)
}

// --- Exported read-through getters for hot-path consumers (e.g. storage driver). ---

// GetString returns a string/enum setting (effective value), or "" on miss.
func (s *Service) GetString(ctx context.Context, key string) string {
	snap, err := s.loadSnapshot(ctx)
	if err != nil {
		return ""
	}
	return s.getString(snap, key)
}

// GetInt returns an int setting (effective value), or 0 on miss.
func (s *Service) GetInt(ctx context.Context, key string) int {
	snap, err := s.loadSnapshot(ctx)
	if err != nil {
		return 0
	}
	return s.getInt(snap, key)
}

// GetBool returns a bool setting (effective value), or false on miss.
func (s *Service) GetBool(ctx context.Context, key string) bool {
	snap, err := s.loadSnapshot(ctx)
	if err != nil {
		return false
	}
	def, ok := s.registry.Get(key)
	if !ok {
		return false
	}
	b, _ := s.effectiveValue(def, snap).(bool)
	return b
}

// GetSecret returns a decrypted secret setting (in RAM), or "" if unset.
func (s *Service) GetSecret(ctx context.Context, key string) string {
	snap, err := s.loadSnapshot(ctx)
	if err != nil {
		return ""
	}
	return s.getSecret(ctx, snap, key)
}
