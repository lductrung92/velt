// Command reset-db rebuilds the local-dev database from scratch:
//
//  1. drop every table (DROP SCHEMA public CASCADE; CREATE SCHEMA public)
//  2. re-run all migrations
//  3. (with --seed) re-run the seeder (users + super_admin + dev settings)
//
// DESTRUCTIVE — dev only. Refuses to run when APP_ENV=production.
//
// Usage:
//
//	reset-db            # drop + migrate
//	reset-db --seed     # drop + migrate + seed
package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"

	"github.com/velt/backend/internal/config"
	"github.com/velt/backend/internal/platform/crypto"
	"github.com/velt/backend/internal/platform/db"
	"github.com/velt/backend/internal/seed"
	"github.com/velt/backend/migrations"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
}

func run() error {
	doSeed := flag.Bool("seed", false, "re-run the seeder after migrating")
	flag.Parse()

	_ = godotenv.Load()
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	if cfg.IsProd() {
		return fmt.Errorf("refusing to reset-db with APP_ENV=production")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()

	// 1. Drop every table (the whole public schema, incl. goose's version table).
	if err := dropSchema(ctx, cfg.DatabaseURL); err != nil {
		return err
	}
	fmt.Println("dropped schema public (all tables)")

	// 2. Re-run all migrations from scratch.
	if err := db.Migrate(cfg.DatabaseURL, migrations.FS); err != nil {
		return fmt.Errorf("migrate: %w", err)
	}
	fmt.Println("migrations applied")

	if !*doSeed {
		return nil
	}

	// 3. Seed users + super_admin + dev settings.
	pool, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		return fmt.Errorf("connect db: %w", err)
	}
	defer pool.Close()

	sum, err := seed.Users(ctx, pool, seed.Options{Password: "seed-password-123", Count: 20})
	if err != nil {
		return err
	}
	keyBytes, err := crypto.ParseKey(cfg.EncryptionKey)
	if err != nil {
		return err
	}
	aead, err := crypto.NewAEAD(keyBytes)
	if err != nil {
		return err
	}
	if err := seed.Settings(ctx, pool, aead); err != nil {
		return err
	}
	fmt.Printf("seeded: users created=%d, super_admin=%s, settings=storage+mail\n",
		sum.Created, seed.SuperAdminEmail)
	return nil
}

// dropSchema removes the entire public schema and recreates it empty. Uses a
// dedicated short-lived connection (the pool is opened afterwards, post-migrate).
func dropSchema(ctx context.Context, url string) error {
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		return fmt.Errorf("connect db: %w", err)
	}
	defer pool.Close()
	if _, err := pool.Exec(ctx, `DROP SCHEMA public CASCADE; CREATE SCHEMA public;`); err != nil {
		return fmt.Errorf("drop schema: %w", err)
	}
	return nil
}
