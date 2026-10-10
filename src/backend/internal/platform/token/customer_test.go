package token

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func fixedNow(t time.Time) func() time.Time { return func() time.Time { return t } }

func TestCustomerAccess_RoundTrip(t *testing.T) {
	now := time.Date(2026, 6, 16, 12, 0, 0, 0, time.UTC)
	m := NewCustomerManager("customer-secret", 15*time.Minute, fixedNow(now))
	id := uuid.New()

	tok, err := m.NewCustomerAccess(id)
	require.NoError(t, err)

	got, err := m.ParseCustomerAccess(tok)
	require.NoError(t, err)
	require.Equal(t, id, got)
}

func TestCustomerAccess_Expired(t *testing.T) {
	issued := time.Date(2026, 6, 16, 12, 0, 0, 0, time.UTC)
	m := NewCustomerManager("customer-secret", 15*time.Minute, fixedNow(issued))
	tok, err := m.NewCustomerAccess(uuid.New())
	require.NoError(t, err)

	expired := NewCustomerManager("customer-secret", 15*time.Minute, fixedNow(issued.Add(16*time.Minute)))
	_, err = expired.ParseCustomerAccess(tok)
	require.ErrorIs(t, err, ErrInvalidToken)
}

// Cross-rejection is the core of the staff/customer identity split: a staff
// access token must NOT validate as a customer token, and vice versa — enforced
// by both a separate signing secret and a distinct audience.
func TestCustomerAccess_RejectsStaffToken(t *testing.T) {
	now := time.Date(2026, 6, 16, 12, 0, 0, 0, time.UTC)
	staff := NewManager("staff-secret", 15*time.Minute, 5*time.Minute, fixedNow(now))
	cust := NewCustomerManager("customer-secret", 15*time.Minute, fixedNow(now))

	staffTok, err := staff.NewAccess(uuid.New(), []string{"admin"}, []string{"*"})
	require.NoError(t, err)
	_, err = cust.ParseCustomerAccess(staffTok)
	require.ErrorIs(t, err, ErrInvalidToken)
}

func TestStaffAccess_RejectsCustomerToken(t *testing.T) {
	now := time.Date(2026, 6, 16, 12, 0, 0, 0, time.UTC)
	staff := NewManager("staff-secret", 15*time.Minute, 5*time.Minute, fixedNow(now))
	cust := NewCustomerManager("customer-secret", 15*time.Minute, fixedNow(now))

	custTok, err := cust.NewCustomerAccess(uuid.New())
	require.NoError(t, err)
	_, _, _, err = staff.ParseAccess(custTok)
	require.ErrorIs(t, err, ErrInvalidToken)
}
