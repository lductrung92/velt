// Command seeder populates the database with deterministic dev data: test users
// (admin-users screen, pagination, status filters), a real super_admin, and the
// canonical dev operational settings (storage = SeaweedFS/S3, mail = Mailpit).
// Idempotent (ON CONFLICT). Seed logic lives in internal/seed (shared with
// cmd/reset-db).
//
// Usage:
//
//	seeder                 # super_admin + 6 fixtures + 20 bulk editors + settings + CMS content
//	seeder -count 100      # more bulk users
//	seeder -reset          # delete prior @seed.local users + seed-* CMS rows first, then reseed
//	seeder -tags 100 -categories 5 -articles 25   # CMS content volume (defaults shown)
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"os"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"

	"github.com/velt/backend/internal/config"
	"github.com/velt/backend/internal/platform/crypto"
	"github.com/velt/backend/internal/seed"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
}

func run() error {
	var opts seed.Options
	var cms seed.CMSOptions
	flag.StringVar(&opts.Password, "password", "seed-password-123", "password for the @seed.local fixtures")
	flag.IntVar(&opts.Count, "count", 20, "number of bulk editor users to generate")
	flag.BoolVar(&opts.Reset, "reset", false, "delete previously seeded users (@"+seed.SeedDomain+") + seed-* CMS rows before seeding")
	flag.IntVar(&cms.Tags, "tags", 100, "number of CMS tags to seed (capped at the curated catalogue)")
	flag.IntVar(&cms.Categories, "categories", 5, "number of CMS categories to seed (capped at the curated catalogue)")
	flag.IntVar(&cms.Articles, "articles", 25, "number of CMS articles to seed (all workflow statuses)")
	flag.Parse()

	if opts.Count < 0 {
		return errors.New("-count must be >= 0")
	}
	if cms.Tags < 0 || cms.Categories < 0 || cms.Articles < 0 {
		return errors.New("-tags / -categories / -articles must be >= 0")
	}
	cms.Reset = opts.Reset

	_ = godotenv.Load()
	cfg, err := config.Load()
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	pool, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		return fmt.Errorf("connect db: %w", err)
	}
	defer pool.Close()

	sum, err := seed.Users(ctx, pool, opts)
	if err != nil {
		return err
	}

	aead, err := newAEAD(cfg.EncryptionKey)
	if err != nil {
		return err
	}
	if err := seed.Settings(ctx, pool, aead); err != nil {
		return err
	}

	cmsSum, err := seed.CMS(ctx, pool, cms)
	if err != nil {
		return err
	}

	fmt.Printf("seed complete: created=%d skipped=%d deleted=%d roles_assigned=%d (domain=@%s, password=%q)\n",
		sum.Created, sum.Skipped, sum.Deleted, sum.RolesAssigned, seed.SeedDomain, opts.Password)
	fmt.Printf("super_admin: %s / %s\n", seed.SuperAdminEmail, seed.SuperAdminPassword)
	fmt.Println("settings seeded: storage=s3 (SeaweedFS), mail=Mailpit")
	fmt.Printf("cms seeded: tags=%d categories=%d articles=%d article_tags=%d skipped=%d deleted=%d\n",
		cmsSum.Tags, cmsSum.Categories, cmsSum.Articles, cmsSum.ArticleTags, cmsSum.Skipped, cmsSum.Deleted)
	return nil
}

func newAEAD(key string) (*crypto.AEAD, error) {
	keyBytes, err := crypto.ParseKey(key)
	if err != nil {
		return nil, err
	}
	return crypto.NewAEAD(keyBytes)
}
