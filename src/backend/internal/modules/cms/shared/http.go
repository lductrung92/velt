package shared

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/velt/backend/internal/apperr"
	"github.com/velt/backend/internal/httpx"
)

// Identity extracts the authenticated identity, writing a 401 and returning
// ok=false when absent.
func Identity(w http.ResponseWriter, r *http.Request) (*httpx.Identity, bool) {
	id, ok := httpx.IdentityFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, apperr.Unauthorized("unauthorized"))
		return nil, false
	}
	return id, true
}

// ParamUUID parses a path param; an invalid id is treated as not-found.
func ParamUUID(r *http.Request, name string) (uuid.UUID, bool) {
	id, err := uuid.Parse(chi.URLParam(r, name))
	return id, err == nil
}

// QueryInt reads an integer query param, returning def when absent or unparseable.
func QueryInt(r *http.Request, name string, def int) int {
	if n, err := strconv.Atoi(r.URL.Query().Get(name)); err == nil {
		return n
	}
	return def
}

// QueryUUID reads an optional UUID query param; absent or unparseable → nil.
func QueryUUID(r *http.Request, name string) *uuid.UUID {
	v := r.URL.Query().Get(name)
	if v == "" {
		return nil
	}
	id, err := uuid.Parse(v)
	if err != nil {
		return nil
	}
	return &id
}
