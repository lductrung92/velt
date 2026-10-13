package httpx

import (
	"context"

	"github.com/google/uuid"
)

// Identity is the authenticated caller derived from a verified access token.
// It is the ONLY source of caller identity in the service layer — never trust
// a client-supplied user_id/role/permission.
type Identity struct {
	UserID      uuid.UUID
	Roles       []string
	Permissions []string
}

// Has reports whether the identity holds the given permission. The wildcard
// "*" (super_admin) grants everything.
func (i *Identity) Has(perm string) bool {
	for _, p := range i.Permissions {
		if p == "*" || p == perm {
			return true
		}
	}
	return false
}

type identityCtxKey struct{}

// WithIdentity stores the identity in the context (used by the auth middleware).
func WithIdentity(ctx context.Context, id *Identity) context.Context {
	return context.WithValue(ctx, identityCtxKey{}, id)
}

// IdentityFromContext returns the authenticated identity, or (nil, false) if
// the request was not authenticated.
func IdentityFromContext(ctx context.Context) (*Identity, bool) {
	id, ok := ctx.Value(identityCtxKey{}).(*Identity)
	return id, ok && id != nil
}

// CustomerIdentity is the authenticated customer derived from a verified
// customer access token (aud=velt-customer). Customers have no roles or
// permissions — product access is gated by subscription entitlement, not
// identity. It is the ONLY source of the caller's customer_id; never trust a
// client-supplied id (no IDOR).
type CustomerIdentity struct {
	CustomerID uuid.UUID
}

type customerIdentityCtxKey struct{}

// WithCustomerIdentity stores the customer identity in the context (used by the
// customer auth middleware).
func WithCustomerIdentity(ctx context.Context, id *CustomerIdentity) context.Context {
	return context.WithValue(ctx, customerIdentityCtxKey{}, id)
}

// CustomerIdentityFromContext returns the authenticated customer identity, or
// (nil, false) if the request was not authenticated as a customer.
func CustomerIdentityFromContext(ctx context.Context) (*CustomerIdentity, bool) {
	id, ok := ctx.Value(customerIdentityCtxKey{}).(*CustomerIdentity)
	return id, ok && id != nil
}

type correlationCtxKey struct{}

// WithCorrelationID stores the per-request correlation id in the context.
func WithCorrelationID(ctx context.Context, id string) context.Context {
	return context.WithValue(ctx, correlationCtxKey{}, id)
}

// CorrelationIDFromContext returns the request correlation id, or "" if absent.
func CorrelationIDFromContext(ctx context.Context) string {
	id, _ := ctx.Value(correlationCtxKey{}).(string)
	return id
}

type clientIPCtxKey struct{}

// WithClientIP stores the caller's address in the context. Services that record
// an action are far from the request, but "signed in from where" is one of the
// few things an activity log is read for, so the address has to travel.
func WithClientIP(ctx context.Context, ip string) context.Context {
	return context.WithValue(ctx, clientIPCtxKey{}, ip)
}

// ClientIPFromContext returns the caller's address, or "" when the context did
// not come from a request.
func ClientIPFromContext(ctx context.Context) string {
	ip, _ := ctx.Value(clientIPCtxKey{}).(string)
	return ip
}
