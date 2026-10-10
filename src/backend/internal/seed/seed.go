// Package seed holds the shared dev-bootstrap logic used by both cmd/seeder and
// cmd/reset-db: deterministic test users (+ a real super_admin) and the canonical
// dev operational settings (storage = SeaweedFS/S3, mail = Mailpit).
//
// Settings are written straight to system_settings (secrets encrypted with the
// same AEAD the API uses) so a fresh DB comes up working without manual config.
package seed

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/velt/backend/internal/platform/crypto"
)

// SeedDomain scopes disposable seed accounts so Reset can target them safely.
const SeedDomain = "seed.local"

// Bootstrap super_admin (a real account, NOT under SeedDomain → survives Reset).
// Dev-only convenience creds; created idempotently (ON CONFLICT DO NOTHING) so a
// later password change in the UI is never overwritten by a re-run.
const (
	SuperAdminEmail    = "trungld@velt.com"
	SuperAdminPassword = "Password@123!"
)

// Options controls user seeding.
type Options struct {
	Password string // password for the disposable @seed.local fixtures
	Count    int    // number of bulk editor users to generate
	Reset    bool   // delete prior @seed.local users before seeding
}

// Summary reports what user seeding did (super_admin + settings are not counted).
type Summary struct {
	Created       int
	Skipped       int
	Deleted       int
	RolesAssigned int
}

// seedUser is one account to create (role + status variety for realistic data).
type seedUser struct {
	email         string
	fullName      string
	roleCode      string
	status        string
	emailVerified bool
	bruteLocked   bool // active but locked_until in the future (brute-force lockout)
}

// Users applies the user seed set (super_admin + fixtures + bulk) in one tx.
func Users(ctx context.Context, pool *pgxpool.Pool, opts Options) (Summary, error) {
	var sum Summary
	hash, err := crypto.HashPassword(opts.Password)
	if err != nil {
		return sum, fmt.Errorf("hash password: %w", err)
	}
	roleIDs, err := loadRoleIDs(ctx, pool)
	if err != nil {
		return sum, err
	}
	users := buildSeedUsers(opts.Count)

	err = pgx.BeginFunc(ctx, pool, func(tx pgx.Tx) error {
		if opts.Reset {
			tag, err := tx.Exec(ctx, `DELETE FROM users WHERE email LIKE '%@' || $1`, SeedDomain)
			if err != nil {
				return fmt.Errorf("reset seed users: %w", err)
			}
			sum.Deleted = int(tag.RowsAffected())
		}
		// Bootstrap the real super_admin (separate from the disposable
		// @seed.local fixtures: Reset never deletes it, not counted in summary).
		if err := bootstrapSuperAdmin(ctx, tx, roleIDs); err != nil {
			return err
		}
		for _, u := range users {
			roleID, ok := roleIDs[u.roleCode]
			if !ok {
				return fmt.Errorf("role %q not found (run migrations first)", u.roleCode)
			}
			id, created, err := upsertUser(ctx, tx, u, hash)
			if err != nil {
				return err
			}
			if created {
				sum.Created++
			} else {
				sum.Skipped++
			}
			assigned, err := assignRole(ctx, tx, id, roleID)
			if err != nil {
				return err
			}
			sum.RolesAssigned += assigned
		}
		return nil
	})
	return sum, err
}

// devSettings is the canonical local-dev operational config. Non-secret values
// are stored as JSON in system_settings.value; secrets are encrypted into
// value_encrypted. Values mirror scripts/.env + the SeaweedFS provisioning
// (bucket/identity = velt) and Mailpit (127.0.0.1:1025).
var devSettings = struct {
	plain   map[string]any
	secrets map[string]string
}{
	plain: map[string]any{
		"storage.driver":        "s3",
		"storage.s3_bucket":     "velt",
		"storage.s3_region":     "us-east-1",
		"storage.s3_endpoint":   "https://cdn.velt.local.vn",
		"storage.s3_access_key": "velt",
		"mail.smtp_host":        "127.0.0.1",
		"mail.smtp_port":        1025,
		"mail.from_address":     "no-reply@velt.local.vn",
	},
	secrets: map[string]string{
		"storage.s3_secret": "change-me-dev-only-s3-secret",
	},
}

// Settings writes the canonical dev settings (idempotent, upsert) so a fresh DB
// works out of the box. Overwrites existing values to keep dev reproducible.
func Settings(ctx context.Context, pool *pgxpool.Pool, aead *crypto.AEAD) error {
	return pgx.BeginFunc(ctx, pool, func(tx pgx.Tx) error {
		for k, v := range devSettings.plain {
			b, err := json.Marshal(v)
			if err != nil {
				return fmt.Errorf("marshal %s: %w", k, err)
			}
			if _, err := tx.Exec(ctx,
				`INSERT INTO system_settings (key, value) VALUES ($1, $2::jsonb)
				 ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, value_encrypted = NULL, updated_at = now()`,
				k, string(b)); err != nil {
				return fmt.Errorf("set %s: %w", k, err)
			}
		}
		for k, plaintext := range devSettings.secrets {
			enc, err := aead.Encrypt([]byte(plaintext))
			if err != nil {
				return fmt.Errorf("encrypt %s: %w", k, err)
			}
			if _, err := tx.Exec(ctx,
				`INSERT INTO system_settings (key, value_encrypted) VALUES ($1, $2)
				 ON CONFLICT (key) DO UPDATE SET value_encrypted = EXCLUDED.value_encrypted, value = NULL, updated_at = now()`,
				k, enc); err != nil {
				return fmt.Errorf("set secret %s: %w", k, err)
			}
		}
		return nil
	})
}

// bootstrapSuperAdmin upserts the real super_admin account (idempotent) and
// assigns the super_admin role. Kept out of the counted seed set so the
// disposable-fixture summary + Reset semantics stay unchanged.
func bootstrapSuperAdmin(ctx context.Context, tx pgx.Tx, roleIDs map[string]uuid.UUID) error {
	roleID, ok := roleIDs["super_admin"]
	if !ok {
		return fmt.Errorf("role \"super_admin\" not found (run migrations first)")
	}
	hash, err := crypto.HashPassword(SuperAdminPassword)
	if err != nil {
		return fmt.Errorf("hash super_admin password: %w", err)
	}
	u := seedUser{
		email: SuperAdminEmail, fullName: "Trung LD", roleCode: "super_admin",
		status: "active", emailVerified: true,
	}
	id, _, err := upsertUser(ctx, tx, u, hash)
	if err != nil {
		return err
	}
	_, err = assignRole(ctx, tx, id, roleID)
	return err
}

// buildSeedUsers returns the deterministic seed set: named fixtures covering
// every role/status, plus count bulk editor users.
func buildSeedUsers(count int) []seedUser {
	users := []seedUser{
		{email: "admin@" + SeedDomain, fullName: "Seed Admin", roleCode: "admin", status: "active", emailVerified: true},
		{email: "editor@" + SeedDomain, fullName: "Seed Editor", roleCode: "editor", status: "active", emailVerified: true},
		{email: "disabled@" + SeedDomain, fullName: "Seed Disabled", roleCode: "editor", status: "disabled", emailVerified: true},
		{email: "suspended@" + SeedDomain, fullName: "Seed Suspended", roleCode: "editor", status: "locked", emailVerified: true},
		{email: "lockedout@" + SeedDomain, fullName: "Seed LockedOut", roleCode: "editor", status: "active", emailVerified: true, bruteLocked: true},
		{email: "unverified@" + SeedDomain, fullName: "Seed Unverified", roleCode: "editor", status: "active", emailVerified: false},
	}
	for i := 1; i <= count; i++ {
		status := "active"
		if i%10 == 0 {
			status = "disabled"
		}
		users = append(users, seedUser{
			email:         fmt.Sprintf("user%03d@%s", i, SeedDomain),
			fullName:      fmt.Sprintf("Seed User %03d", i),
			roleCode:      "editor",
			status:        status,
			emailVerified: i%5 != 0, // every 5th left unverified
		})
	}
	return users
}

func loadRoleIDs(ctx context.Context, pool *pgxpool.Pool) (map[string]uuid.UUID, error) {
	rows, err := pool.Query(ctx, `SELECT code, id FROM roles`)
	if err != nil {
		return nil, fmt.Errorf("load roles: %w", err)
	}
	defer rows.Close()
	out := make(map[string]uuid.UUID)
	for rows.Next() {
		var code string
		var id uuid.UUID
		if err := rows.Scan(&code, &id); err != nil {
			return nil, fmt.Errorf("scan role: %w", err)
		}
		out[code] = id
	}
	return out, rows.Err()
}

// upsertUser inserts the user, or returns the existing id if the email is taken.
// The bool reports whether a new row was created.
func upsertUser(ctx context.Context, tx pgx.Tx, u seedUser, passwordHash string) (uuid.UUID, bool, error) {
	now := time.Now()
	var verifiedAt, lockedUntil *time.Time
	failed := 0
	if u.emailVerified {
		verifiedAt = &now
	}
	if u.bruteLocked {
		l := now.Add(30 * time.Minute)
		lockedUntil = &l
		failed = 5
	}

	var id uuid.UUID
	err := tx.QueryRow(ctx,
		`INSERT INTO users (email, password_hash, full_name, status, email_verified_at, failed_login_count, locked_until)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)
		 ON CONFLICT (email) DO NOTHING
		 RETURNING id`,
		u.email, passwordHash, u.fullName, u.status, verifiedAt, failed, lockedUntil).Scan(&id)
	if err == nil {
		return id, true, nil
	}
	if errors.Is(err, pgx.ErrNoRows) {
		if e := tx.QueryRow(ctx, `SELECT id FROM users WHERE email = $1`, u.email).Scan(&id); e != nil {
			return uuid.Nil, false, fmt.Errorf("lookup existing %s: %w", u.email, e)
		}
		return id, false, nil
	}
	return uuid.Nil, false, fmt.Errorf("insert %s: %w", u.email, err)
}

func assignRole(ctx context.Context, tx pgx.Tx, userID, roleID uuid.UUID) (int, error) {
	tag, err := tx.Exec(ctx,
		`INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
		userID, roleID)
	if err != nil {
		return 0, fmt.Errorf("assign role: %w", err)
	}
	return int(tag.RowsAffected()), nil
}
