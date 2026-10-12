package httpx

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

// Streaming endpoints (SSE) assert http.Flusher on the ResponseWriter they are
// handed. The logging wrapper sits in between, and embedding an interface
// promotes only that interface's methods — so without an explicit Flush the
// assertion fails and every stream 500s before it starts.
func TestStatusWriterStaysFlushable(t *testing.T) {
	rec := httptest.NewRecorder()
	w := &statusWriter{ResponseWriter: rec}

	f, ok := interface{}(w).(http.Flusher)
	require.True(t, ok, "statusWriter must still satisfy http.Flusher")

	_, _ = w.Write([]byte("data: hi\n\n"))
	f.Flush()
	require.True(t, rec.Flushed)
	require.Equal(t, http.StatusOK, w.status)
}

func TestStatusWriterFlushIsSafeOnANonFlushableWriter(t *testing.T) {
	// Not every writer flushes; the wrapper must not panic when one does not.
	w := &statusWriter{ResponseWriter: nonFlusher{httptest.NewRecorder()}}
	require.NotPanics(t, func() { w.Flush() })
}

type nonFlusher struct{ *httptest.ResponseRecorder }

func (n nonFlusher) Header() http.Header         { return n.ResponseRecorder.Header() }
func (n nonFlusher) Write(b []byte) (int, error) { return n.ResponseRecorder.Write(b) }
func (n nonFlusher) WriteHeader(c int)           { n.ResponseRecorder.WriteHeader(c) }

// An SSE handler clears the server's WriteTimeout through
// http.ResponseController, which walks the writer chain via Unwrap. Without that
// method the controller cannot reach the connection, the deadline stands, and
// every stream is cut mid-answer once WriteTimeout elapses — the kind of failure
// that only shows up once a real model is slow enough to notice.
func TestStatusWriterLetsAStreamClearItsWriteDeadline(t *testing.T) {
	dw := &deadlineWriter{ResponseRecorder: httptest.NewRecorder()}
	w := &statusWriter{ResponseWriter: dw}

	err := http.NewResponseController(w).SetWriteDeadline(time.Time{})
	require.NoError(t, err)
	require.True(t, dw.called, "the controller must reach the real writer")
	require.True(t, dw.deadline.IsZero())
}

type deadlineWriter struct {
	*httptest.ResponseRecorder
	called   bool
	deadline time.Time
}

func (d *deadlineWriter) SetWriteDeadline(t time.Time) error {
	d.called, d.deadline = true, t
	return nil
}
