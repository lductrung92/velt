// Command backfill-files gives every asset already on disk a row in the `files`
// table, so content written before flat URLs existed can be migrated later.
//
// It does NOT rewrite any stored HTML. A published body_html keeps pointing at
// /api/files/<storage key>, which keeps serving; what this command adds is a
// second, flat identity for the same bytes, so a later pass has something to
// rewrite those URLs TO.
//
// Safe to re-run: `files.storage_key` is unique and a key that already has a row
// is skipped, so the command converges rather than minting a second slug nobody
// would ever delete.
//
// Usage:
//
//	backfill-files            # mint rows for everything under STORAGE_LOCAL_ROOT
//	backfill-files --dry-run  # report what it would mint, write nothing
package main

import (
	"context"
	"flag"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"

	"github.com/velt/backend/internal/config"
	"github.com/velt/backend/internal/platform/media"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
}

func run() error {
	dryRun := flag.Bool("dry-run", false, "report what would be minted, write nothing")
	flag.Parse()

	_ = godotenv.Load()
	cfg, err := config.Load()
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
	defer cancel()

	pool, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		return fmt.Errorf("connect: %w", err)
	}
	defer pool.Close()

	// The URLs are only echoed to stdout here; what is persisted is the slug.
	store := media.NewStore(pool, media.URLs{
		FilesBase: cfg.MediaFilesBaseURL,
		ImageBase: cfg.MediaImageBaseURL,
	}, nil)

	root := cfg.StorageLocalRoot
	var minted, skipped int
	err = filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return err
		}
		rel, err := filepath.Rel(root, path)
		if err != nil {
			return err
		}
		key := filepath.ToSlash(rel)
		kind, ownerID := owner(key)
		if kind == "" {
			skipped++
			return nil // not an asset this table describes
		}
		if *dryRun {
			fmt.Printf("would mint %-12s %s\n", kind, key)
			minted++
			return nil
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return fmt.Errorf("read %s: %w", key, err)
		}
		asset, err := store.Mint(ctx, media.MintInput{
			Key: key, Base: slugBase(key), Data: data, OwnerKind: kind, OwnerID: ownerID,
		})
		if err != nil {
			return fmt.Errorf("mint %s: %w", key, err)
		}
		minted++
		fmt.Printf("%-12s %s -> %s\n", kind, key, asset.URL)
		return nil
	})
	if err != nil {
		return err
	}
	fmt.Printf("done: %d minted, %d skipped\n", minted, skipped)
	return nil
}

// owner maps a storage key back to the module that wrote it. Every upload path
// builds its key as "<entity>/<owner uuid>/<name>", so the key carries its own
// provenance; a key shaped any other way is skipped rather than guessed at.
func owner(key string) (kind string, id *uuid.UUID) {
	parts := strings.Split(key, "/")
	if len(parts) < 3 {
		return "", nil
	}
	switch {
	case parts[0] == "users":
		kind = "user"
	case parts[0] == "members":
		kind = "member"
	case parts[0] == "products":
		kind = "product"
	case parts[0] == "cms" && parts[1] == "articles":
		kind, parts = "article", parts[1:]
	case parts[0] == "cms" && parts[1] == "landing":
		kind, parts = "landing", parts[1:]
	default:
		return "", nil
	}
	if len(parts) < 3 {
		return "", nil
	}
	parsed, err := uuid.Parse(parts[1])
	if err != nil {
		return "", nil
	}
	return kind, &parsed
}

// slugBase is the readable half of the minted slug. Upload keys are
// "<purpose>-<uuid>.<ext>", so the first segment is the purpose; a landing's
// media is named by uuid alone, which leaves nothing readable to take.
func slugBase(key string) string {
	name := filepath.Base(key)
	name = strings.TrimSuffix(name, filepath.Ext(name))
	first, _, _ := strings.Cut(name, "-")
	if _, err := uuid.Parse(name); err == nil || first == "" {
		return "media"
	}
	return first
}
