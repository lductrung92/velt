// Command createadmin provisions a super_admin user out-of-band (there is no
// public signup). Usage:
//
//	createadmin -email a@b.com -name "Root" -password "<min 12 chars>"
//
// It hashes the password with argon2id and assigns the seeded super_admin role
// in a single transaction. Re-running with an existing email fails safely.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"os"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
	"github.com/velt/backend/internal/config"
	"github.com/velt/backend/internal/platform/crypto"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
}

func run() error {
	email := flag.String("email", "", "super admin email")
	name := flag.String("name", "Super Admin", "full name")
	password := flag.String("password", "", "password (min 12 chars)")
	flag.Parse()

	if *email == "" || *password == "" {
		return errors.New("both -email and -password are required")
	}
	if len(*password) < 12 {
		return errors.New("password must be at least 12 characters")
	}

	_ = godotenv.Load()
	cfg, err := config.Load()
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	pool, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		return fmt.Errorf("connect db: %w", err)
	}
	defer pool.Close()

	hash, err := crypto.HashPassword(*password)
	if err != nil {
		return fmt.Errorf("hash password: %w", err)
	}

	err = pgx.BeginFunc(ctx, pool, func(tx pgx.Tx) error {
		var roleID string
		if err := tx.QueryRow(ctx, `SELECT id FROM roles WHERE code = 'super_admin'`).Scan(&roleID); err != nil {
			return fmt.Errorf("find super_admin role (run migrations first): %w", err)
		}
		var userID string
		err := tx.QueryRow(ctx,
			`INSERT INTO users (email, password_hash, full_name, status, email_verified_at)
			 VALUES ($1, $2, $3, 'active', now())
			 RETURNING id`, *email, hash, *name).Scan(&userID)
		if err != nil {
			return fmt.Errorf("insert user (email may already exist): %w", err)
		}
		if _, err := tx.Exec(ctx,
			`INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)`, userID, roleID); err != nil {
			return fmt.Errorf("assign role: %w", err)
		}
		fmt.Printf("created super_admin user %s (%s)\n", userID, *email)
		return nil
	})
	return err
}
