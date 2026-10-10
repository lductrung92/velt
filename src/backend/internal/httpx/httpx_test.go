package httpx

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"github.com/velt/backend/internal/apperr"
)

type sample struct {
	Email string `json:"email" validate:"required,email"`
	Name  string `json:"name" validate:"required,max=3"`
}

func decodeReq(body string) (*http.Request, *sample) {
	r := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(body))
	return r, &sample{}
}

func TestDecodeAndValidate_Valid(t *testing.T) {
	r, dst := decodeReq(`{"email":"a@b.com","name":"ab"}`)
	require.NoError(t, DecodeAndValidate(r, dst))
	require.Equal(t, "a@b.com", dst.Email)
}

func TestDecodeAndValidate_BadJSON(t *testing.T) {
	r, dst := decodeReq(`{not json`)
	err := DecodeAndValidate(r, dst)
	ae, ok := apperr.As(err)
	require.True(t, ok)
	require.Equal(t, http.StatusBadRequest, ae.Status)
	require.Equal(t, "bad_request", ae.Key)
}

func TestDecodeAndValidate_UnknownField(t *testing.T) {
	r, dst := decodeReq(`{"email":"a@b.com","name":"ab","extra":1}`)
	err := DecodeAndValidate(r, dst)
	ae, ok := apperr.As(err)
	require.True(t, ok)
	require.Equal(t, http.StatusBadRequest, ae.Status)
}

func TestDecodeAndValidate_FieldErrors(t *testing.T) {
	r, dst := decodeReq(`{"email":"not-an-email","name":"toolong"}`)
	err := DecodeAndValidate(r, dst)
	ae, ok := apperr.As(err)
	require.True(t, ok)
	require.Equal(t, http.StatusUnprocessableEntity, ae.Status)
	require.Equal(t, "validation_error", ae.Key)

	fields, _ := ae.Details["fields"].(map[string]any)
	require.Equal(t, "invalid_email", fields["email"])
	require.Equal(t, "too_long", fields["name"])
}

func TestWriteError_Envelope(t *testing.T) {
	rec := httptest.NewRecorder()
	WriteError(rec, apperr.NotFound("not_found"))

	require.Equal(t, http.StatusNotFound, rec.Code)
	var body struct {
		Error struct {
			Code    int            `json:"code"`
			Message string         `json:"message"`
			Details map[string]any `json:"details"`
		} `json:"error"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	require.Equal(t, 404, body.Error.Code)
	require.Equal(t, "not_found", body.Error.Message)
	require.NotNil(t, body.Error.Details)
}

func TestWriteError_RateLimitedRetryAfter(t *testing.T) {
	rec := httptest.NewRecorder()
	WriteError(rec, apperr.RateLimited(42))
	require.Equal(t, http.StatusTooManyRequests, rec.Code)
	require.Equal(t, "42", rec.Header().Get("Retry-After"))
}

func TestWriteError_UnknownErrorIsInternal(t *testing.T) {
	rec := httptest.NewRecorder()
	WriteError(rec, errPlain("boom"))
	require.Equal(t, http.StatusInternalServerError, rec.Code)
	require.NotContains(t, rec.Body.String(), "boom", "raw cause must never leak")
}

type errPlain string

func (e errPlain) Error() string { return string(e) }

func TestIdentity_Has(t *testing.T) {
	id := &Identity{Permissions: []string{"users.read"}}
	require.True(t, id.Has("users.read"))
	require.False(t, id.Has("users.delete"))

	super := &Identity{Permissions: []string{"*"}}
	require.True(t, super.Has("anything.at.all"))
}

type fakeParser struct {
	uid   uuid.UUID
	roles []string
	perms []string
	err   error
}

func (p fakeParser) ParseAccess(string) (uuid.UUID, []string, []string, error) {
	return p.uid, p.roles, p.perms, p.err
}

func TestAuthenticator_ValidToken(t *testing.T) {
	uid := uuid.New()
	mw := Authenticator(fakeParser{uid: uid, perms: []string{"x"}})
	var got *Identity
	h := mw(http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) {
		id, _ := IdentityFromContext(r.Context())
		got = id
	}))
	r := httptest.NewRequest(http.MethodGet, "/", nil)
	r.Header.Set("Authorization", "Bearer good-token")
	h.ServeHTTP(httptest.NewRecorder(), r)
	require.NotNil(t, got)
	require.Equal(t, uid, got.UserID)
}

func TestAuthenticator_MissingToken(t *testing.T) {
	mw := Authenticator(fakeParser{})
	h := mw(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { t.Fatal("must not reach handler") }))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/", nil))
	require.Equal(t, http.StatusUnauthorized, rec.Code)
}

func TestAuthenticator_InvalidToken(t *testing.T) {
	mw := Authenticator(fakeParser{err: errPlain("bad")})
	h := mw(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { t.Fatal("must not reach handler") }))
	rec := httptest.NewRecorder()
	r := httptest.NewRequest(http.MethodGet, "/", nil)
	r.Header.Set("Authorization", "Bearer bad")
	h.ServeHTTP(rec, r)
	require.Equal(t, http.StatusUnauthorized, rec.Code)
}
