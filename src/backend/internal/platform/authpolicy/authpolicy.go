// Package authpolicy holds the shared password policy (minimum length +
// deny-list) enforced identically across every identity surface: staff auth,
// staff account self-service, and customer auth. It lives in platform so each
// module depends on it rather than on a sibling feature package.
package authpolicy

import "strings"

// MinPasswordLen follows NIST guidance: length over complexity.
const MinPasswordLen = 12

// commonPasswords is a small deny-list of the most-abused passwords. A larger
// list can be loaded later; this blocks the obvious ones.
var commonPasswords = map[string]struct{}{
	"password":      {},
	"password1":     {},
	"password123":   {},
	"123456789012":  {},
	"qwerty123456":  {},
	"111111111111":  {},
	"administrator": {},
	"letmein12345":  {},
	"iloveyou1234":  {},
	"welcome12345":  {},
}

// ValidatePassword enforces the password policy (min length, deny-list). It
// returns a field error key ("too_short"|"too_common") and ok=false on
// violation.
func ValidatePassword(pw string) (string, bool) {
	if len(pw) < MinPasswordLen {
		return "too_short", false
	}
	if _, bad := commonPasswords[strings.ToLower(pw)]; bad {
		return "too_common", false
	}
	return "", true
}
