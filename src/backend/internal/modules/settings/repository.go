package settings

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// writeKind is the kind of mutation applied to a settings key.
type writeKind int

const (
	opSetValue     writeKind = iota // plaintext JSONB value
	opSetEncrypted                  // AES-GCM ciphertext (secret)
	opDelete                        // remove the row (revert to registry default)
)

// writeOp is one key mutation within a PUT transaction.
type writeOp struct {
	Key       string
	Kind      writeKind
	Value     []byte // JSONB bytes for opSetValue
	Encrypted []byte // ciphertext for opSetEncrypted
}

// Repository is the data-access contract for system_settings.
type Repository interface {
	// LoadAll returns every stored row (keys without a row use registry defaults).
	LoadAll(ctx context.Context) (snapshot, error)
	// Apply executes all ops atomically in one transaction.
	Apply(ctx context.Context, ops []writeOp, updatedBy uuid.UUID) error
}

type pgxRepository struct {
	pool *pgxpool.Pool
}

// NewRepository builds the pgx-backed settings repository.
func NewRepository(pool *pgxpool.Pool) Repository { return &pgxRepository{pool: pool} }

func (r *pgxRepository) LoadAll(ctx context.Context) (snapshot, error) {
	rows, err := r.pool.Query(ctx, `SELECT key, value, value_encrypted FROM system_settings`)
	if err != nil {
		return nil, fmt.Errorf("query settings: %w", err)
	}
	defer rows.Close()

	snap := make(snapshot)
	for rows.Next() {
		var key string
		var value []byte
		var enc []byte
		if err := rows.Scan(&key, &value, &enc); err != nil {
			return nil, fmt.Errorf("scan setting: %w", err)
		}
		snap[key] = storedValue{Value: value, Encrypted: enc}
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate settings: %w", err)
	}
	return snap, nil
}

func (r *pgxRepository) Apply(ctx context.Context, ops []writeOp, updatedBy uuid.UUID) error {
	if len(ops) == 0 {
		return nil
	}
	return pgx.BeginFunc(ctx, r.pool, func(tx pgx.Tx) error {
		for _, op := range ops {
			if err := applyOp(ctx, tx, op, updatedBy); err != nil {
				return err
			}
		}
		return nil
	})
}

func applyOp(ctx context.Context, tx pgx.Tx, op writeOp, updatedBy uuid.UUID) error {
	switch op.Kind {
	case opSetValue:
		_, err := tx.Exec(ctx,
			`INSERT INTO system_settings (key, value, value_encrypted, updated_at, updated_by)
			 VALUES ($1, $2, NULL, now(), $3)
			 ON CONFLICT (key) DO UPDATE
			   SET value = EXCLUDED.value, value_encrypted = NULL, updated_at = now(), updated_by = $3`,
			op.Key, op.Value, updatedBy)
		return wrapOp("set value", op.Key, err)
	case opSetEncrypted:
		_, err := tx.Exec(ctx,
			`INSERT INTO system_settings (key, value, value_encrypted, updated_at, updated_by)
			 VALUES ($1, NULL, $2, now(), $3)
			 ON CONFLICT (key) DO UPDATE
			   SET value_encrypted = EXCLUDED.value_encrypted, value = NULL, updated_at = now(), updated_by = $3`,
			op.Key, op.Encrypted, updatedBy)
		return wrapOp("set encrypted", op.Key, err)
	case opDelete:
		_, err := tx.Exec(ctx, `DELETE FROM system_settings WHERE key = $1`, op.Key)
		return wrapOp("delete", op.Key, err)
	default:
		return fmt.Errorf("unknown write kind for key %s", op.Key)
	}
}

func wrapOp(action, key string, err error) error {
	if err != nil {
		return fmt.Errorf("%s %s: %w", action, key, err)
	}
	return nil
}
