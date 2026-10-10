package httpx

import (
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"reflect"
	"strconv"
	"strings"
	"sync"

	"github.com/go-playground/validator/v10"
	"github.com/velt/backend/internal/apperr"
)

// errorEnvelope is the one wire shape for every non-2xx response.
// See docs/ai/error-contract.md.
type errorEnvelope struct {
	Error errorBody `json:"error"`
}

type errorBody struct {
	Code    int            `json:"code"`
	Message string         `json:"message"`
	Details map[string]any `json:"details"`
}

// WriteJSON writes v as JSON with the given status. A nil v writes no body.
func WriteJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	if v == nil {
		w.WriteHeader(status)
		return
	}
	buf, err := json.Marshal(v)
	if err != nil {
		writeEnvelope(w, apperr.Internal())
		return
	}
	w.WriteHeader(status)
	_, _ = w.Write(buf)
}

// WriteError maps any error to the error envelope. *AppError is rendered as-is;
// anything else becomes a 500 (cause never leaked to the body).
func WriteError(w http.ResponseWriter, err error) {
	if ae, ok := apperr.As(err); ok {
		writeEnvelope(w, ae)
		return
	}
	writeEnvelope(w, apperr.Internal())
}

func writeEnvelope(w http.ResponseWriter, ae *apperr.AppError) {
	if ae.Status == http.StatusTooManyRequests {
		if ra, ok := ae.Details["retry_after"].(int); ok {
			w.Header().Set("Retry-After", strconv.Itoa(ra))
		}
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(ae.Status)
	details := ae.Details
	if details == nil {
		details = map[string]any{}
	}
	_ = json.NewEncoder(w).Encode(errorEnvelope{Error: errorBody{
		Code:    ae.Status,
		Message: ae.Key,
		Details: details,
	}})
}

// maxBodyBytes caps request bodies to defend against memory-exhaustion.
const maxBodyBytes = 1 << 20 // 1 MiB

var (
	validate     *validator.Validate
	validateOnce sync.Once
)

func getValidator() *validator.Validate {
	validateOnce.Do(func() {
		validate = validator.New(validator.WithRequiredStructEnabled())
		// Report the JSON field name (not the Go field) in validation errors.
		validate.RegisterTagNameFunc(func(fld reflect.StructField) string {
			name := strings.SplitN(fld.Tag.Get("json"), ",", 2)[0]
			if name == "-" {
				return ""
			}
			return name
		})
	})
	return validate
}

// DecodeAndValidate decodes the JSON request body into dst (rejecting unknown
// fields) and validates it via struct tags. It returns:
//   - 400 bad_request for malformed/unparseable JSON or unknown fields,
//   - 422 validation_error (with per-field keys) for rule violations.
func DecodeAndValidate(r *http.Request, dst any) error {
	r.Body = http.MaxBytesReader(nil, r.Body, maxBodyBytes)
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(dst); err != nil {
		return apperr.BadRequest("bad_request")
	}
	// Reject trailing data after the first JSON value.
	if dec.More() {
		return apperr.BadRequest("bad_request")
	}
	if err := r.Body.(io.Closer).Close(); err != nil {
		_ = err // body close failure is non-fatal here
	}
	return Validate(dst)
}

// Validate runs struct-tag validation and maps failures to 422 per-field keys.
func Validate(dst any) error {
	if err := getValidator().Struct(dst); err != nil {
		var verrs validator.ValidationErrors
		if errors.As(err, &verrs) {
			fields := make(map[string]string, len(verrs))
			for _, fe := range verrs {
				field := fe.Field()
				if field == "" {
					field = fe.StructField()
				}
				fields[field] = validationKey(fe)
			}
			return apperr.Validation(fields)
		}
		return apperr.BadRequest("bad_request")
	}
	return nil
}

// validationKey maps a validator tag to a snake_case translation key.
func validationKey(fe validator.FieldError) string {
	switch fe.Tag() {
	case "required":
		return "required"
	case "email":
		return "invalid_email"
	case "min":
		if fe.Kind() == reflect.String {
			return "too_short"
		}
		return "too_small"
	case "max":
		if fe.Kind() == reflect.String {
			return "too_long"
		}
		return "too_large"
	case "len":
		return "invalid_length"
	case "uuid", "uuid4":
		return "invalid_uuid"
	case "oneof":
		return "invalid_value"
	default:
		return "invalid_value"
	}
}

// logFromContext returns the request-scoped logger if set, else the default.
func logFromContext(r *http.Request) *slog.Logger {
	if cid := CorrelationIDFromContext(r.Context()); cid != "" {
		return slog.With("correlation_id", cid)
	}
	return slog.Default()
}
