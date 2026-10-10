// Package migrations embeds the goose SQL migration files so they can be run
// from the application binary (no external goose CLI required at deploy time).
package migrations

import "embed"

// FS holds all *.sql migration files in this directory.
//
//go:embed *.sql
var FS embed.FS
