package storage

import (
	"context"
	"fmt"
	"io"
	"mime"
	"net/url"
	"path"
	"strings"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

// S3Config is the connection config for an S3-compatible backend (SeaweedFS S3
// gateway in this project). Assembled from the settings registry.
type S3Config struct {
	Endpoint  string // base URL, e.g. http://127.0.0.1:8333 or https://cdn.example.com
	Region    string
	Bucket    string
	AccessKey string
	Secret    string
}

// S3 is an S3-compatible Storage driver (minio-go). Public object URLs are
// path-style (<endpoint>/<bucket>/<key>) — SeaweedFS serves path-style and the
// bucket must be public-read (or fronted by the cdn vhost) for the URL to load.
type S3 struct {
	client *minio.Client
	cfg    S3Config
}

// NewS3 builds the driver. The minio client is created eagerly but does not
// connect until the first operation, so an unreachable endpoint surfaces on
// Save/Open/Delete, not here.
func NewS3(cfg S3Config) (*S3, error) {
	if cfg.Endpoint == "" || cfg.Bucket == "" {
		return nil, fmt.Errorf("s3: endpoint and bucket are required")
	}
	u, err := url.Parse(cfg.Endpoint)
	if err != nil || u.Host == "" {
		return nil, fmt.Errorf("s3: invalid endpoint %q", cfg.Endpoint)
	}
	client, err := minio.New(u.Host, &minio.Options{
		Creds:  credentials.NewStaticV4(cfg.AccessKey, cfg.Secret, ""),
		Secure: u.Scheme == "https",
		Region: cfg.Region,
	})
	if err != nil {
		return nil, fmt.Errorf("s3: client: %w", err)
	}
	return &S3{client: client, cfg: cfg}, nil
}

// Save implements Storage. Object size is unknown from the reader, so -1 lets
// minio stream via multipart. Content-Type is derived from the key extension.
func (s *S3) Save(ctx context.Context, key string, r io.Reader) error {
	if err := validateKey(key); err != nil {
		return err
	}
	_, err := s.client.PutObject(ctx, s.cfg.Bucket, key, r, -1, minio.PutObjectOptions{
		ContentType: contentTypeFor(key),
	})
	if err != nil {
		return fmt.Errorf("s3: put %q: %w", key, err)
	}
	return nil
}

// Open implements Storage.
func (s *S3) Open(ctx context.Context, key string) (io.ReadCloser, error) {
	if err := validateKey(key); err != nil {
		return nil, err
	}
	obj, err := s.client.GetObject(ctx, s.cfg.Bucket, key, minio.GetObjectOptions{})
	if err != nil {
		return nil, fmt.Errorf("s3: get %q: %w", key, err)
	}
	return obj, nil
}

// Delete implements Storage (no error if the object is already absent).
func (s *S3) Delete(ctx context.Context, key string) error {
	if err := validateKey(key); err != nil {
		return err
	}
	if err := s.client.RemoveObject(ctx, s.cfg.Bucket, key, minio.RemoveObjectOptions{}); err != nil {
		return fmt.Errorf("s3: delete %q: %w", key, err)
	}
	return nil
}

// URL implements Storage — public object URL.
func (s *S3) URL(_ context.Context, key string) string {
	if validateKey(key) != nil {
		return ""
	}
	return s3PublicURL(s.cfg.Endpoint, key)
}

// s3PublicURL builds the public object URL <endpoint>/<key> — NO bucket segment.
// The bucket is implicit in the public endpoint (the cdn vhost rewrites the short
// path back to path-style <bucket>/<key> before proxying to SeaweedFS), so public
// URLs stay clean, e.g. https://cdn.example.com/customers/{id}/avatar.png.
func s3PublicURL(endpoint, key string) string {
	return strings.TrimRight(endpoint, "/") + "/" + strings.TrimLeft(key, "/")
}

// contentTypeFor maps a key's extension to a MIME type, defaulting to a generic
// binary type so browsers download rather than mis-render unknown files.
func contentTypeFor(key string) string {
	if ct := mime.TypeByExtension(path.Ext(key)); ct != "" {
		return ct
	}
	return "application/octet-stream"
}

// ---- Browser (directory ops) ----

// List implements Browser — one level under prefix (delimiter "/"): folders
// (CommonPrefixes / zero-byte markers, key ends "/") + files. Skips the prefix
// marker itself. Verified against SeaweedFS S3.
func (s *S3) List(ctx context.Context, prefix string) ([]Entry, error) {
	norm := dirPrefix(prefix)
	if norm == "" {
		return nil, ErrInvalidPath
	}
	if err := validateKey(strings.TrimSuffix(norm, "/")); err != nil {
		return nil, err
	}
	var out []Entry
	for obj := range s.client.ListObjects(ctx, s.cfg.Bucket, minio.ListObjectsOptions{Prefix: norm, Recursive: false}) {
		if obj.Err != nil {
			return nil, fmt.Errorf("s3: list %q: %w", norm, obj.Err)
		}
		if obj.Key == norm {
			continue // the folder's own marker
		}
		isDir := strings.HasSuffix(obj.Key, "/")
		e := Entry{Name: lastSegment(obj.Key), Path: strings.TrimSuffix(obj.Key, "/"), IsDir: isDir, ModTime: obj.LastModified}
		if !isDir {
			e.Size = obj.Size
		}
		out = append(out, e)
	}
	return out, nil
}

// Stat implements Browser — FILE only (S3 has no folder object; dir properties
// are derived from List by the service).
func (s *S3) Stat(ctx context.Context, key string) (Entry, error) {
	if err := validateKey(key); err != nil {
		return Entry{}, err
	}
	oi, err := s.client.StatObject(ctx, s.cfg.Bucket, strings.TrimSuffix(key, "/"), minio.StatObjectOptions{})
	if err != nil {
		return Entry{}, fmt.Errorf("s3: stat %q: %w", key, err)
	}
	return Entry{Name: lastSegment(key), Path: strings.Trim(key, "/"), Size: oi.Size, ModTime: oi.LastModified}, nil
}

// Mkdir implements Browser — writes a zero-byte marker "<prefix>/". Empty folders
// may not persist once their last file is removed (S3 has no real directories).
func (s *S3) Mkdir(ctx context.Context, prefix string) error {
	norm := dirPrefix(prefix)
	if norm == "" {
		return ErrInvalidPath
	}
	if err := validateKey(strings.TrimSuffix(norm, "/")); err != nil {
		return err
	}
	_, err := s.client.PutObject(ctx, s.cfg.Bucket, norm, strings.NewReader(""), 0, minio.PutObjectOptions{})
	if err != nil {
		return fmt.Errorf("s3: mkdir %q: %w", norm, err)
	}
	return nil
}

// Copy implements Browser (single file).
func (s *S3) Copy(ctx context.Context, src, dst string) error {
	if err := validateKey(src); err != nil {
		return err
	}
	if err := validateKey(dst); err != nil {
		return err
	}
	_, err := s.client.CopyObject(ctx,
		minio.CopyDestOptions{Bucket: s.cfg.Bucket, Object: dst},
		minio.CopySrcOptions{Bucket: s.cfg.Bucket, Object: src})
	if err != nil {
		return fmt.Errorf("s3: copy %q->%q: %w", src, dst, err)
	}
	return nil
}

// CopyTree implements Browser — recursive copy of a subtree.
func (s *S3) CopyTree(ctx context.Context, srcPrefix, dstPrefix string) error {
	src, dst := dirPrefix(srcPrefix), dirPrefix(dstPrefix)
	if src == "" || dst == "" {
		return ErrInvalidPath
	}
	if err := validateKey(strings.TrimSuffix(src, "/")); err != nil {
		return err
	}
	if err := validateKey(strings.TrimSuffix(dst, "/")); err != nil {
		return err
	}
	for obj := range s.client.ListObjects(ctx, s.cfg.Bucket, minio.ListObjectsOptions{Prefix: src, Recursive: true}) {
		if obj.Err != nil {
			return fmt.Errorf("s3: copytree list: %w", obj.Err)
		}
		dstKey := dst + strings.TrimPrefix(obj.Key, src)
		if _, err := s.client.CopyObject(ctx,
			minio.CopyDestOptions{Bucket: s.cfg.Bucket, Object: dstKey},
			minio.CopySrcOptions{Bucket: s.cfg.Bucket, Object: obj.Key}); err != nil {
			return fmt.Errorf("s3: copytree copy %q: %w", obj.Key, err)
		}
	}
	return nil
}

// Move implements Browser (file or dir) = copy + delete (S3 has no rename).
func (s *S3) Move(ctx context.Context, src, dst string) error {
	if ok, _ := s.Exists(ctx, src); ok { // a file
		if err := s.Copy(ctx, src, dst); err != nil {
			return err
		}
		return s.Delete(ctx, src)
	}
	if err := s.CopyTree(ctx, src, dst); err != nil { // a directory
		return err
	}
	return s.DeleteTree(ctx, src)
}

// DeleteTree implements Browser — recursive delete of a directory prefix (files
// use Storage.Delete). Batch RemoveObjects.
func (s *S3) DeleteTree(ctx context.Context, prefix string) error {
	norm := dirPrefix(prefix)
	if norm == "" {
		return ErrInvalidPath
	}
	if err := validateKey(strings.TrimSuffix(norm, "/")); err != nil {
		return err
	}
	// Cancel on any early return so the lister stops and the feeder goroutine
	// unblocks (it would otherwise leak, blocked sending into objCh).
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()

	objCh := make(chan minio.ObjectInfo)
	var listErr error
	go func() {
		defer close(objCh)
		for obj := range s.client.ListObjects(ctx, s.cfg.Bucket, minio.ListObjectsOptions{Prefix: norm, Recursive: true}) {
			if obj.Err != nil {
				// A listing failure mid-stream must NOT be silently dropped —
				// that would report a partial delete as success. Stop + surface it.
				listErr = obj.Err
				return
			}
			select {
			case objCh <- obj:
			case <-ctx.Done():
				return
			}
		}
	}()
	for e := range s.client.RemoveObjects(ctx, s.cfg.Bucket, objCh, minio.RemoveObjectsOptions{}) {
		if e.Err != nil {
			return fmt.Errorf("s3: deltree remove %q: %w", e.ObjectName, e.Err)
		}
	}
	if listErr != nil {
		return fmt.Errorf("s3: deltree list %q: %w", norm, listErr)
	}
	return nil
}

// Exists implements Browser (file).
func (s *S3) Exists(ctx context.Context, key string) (bool, error) {
	if err := validateKey(key); err != nil {
		return false, err
	}
	_, err := s.client.StatObject(ctx, s.cfg.Bucket, strings.TrimSuffix(key, "/"), minio.StatObjectOptions{})
	if err == nil {
		return true, nil
	}
	resp := minio.ToErrorResponse(err)
	if resp.StatusCode == 404 || resp.Code == "NoSuchKey" {
		return false, nil
	}
	return false, fmt.Errorf("s3: exists %q: %w", key, err)
}

var (
	_ Storage = (*S3)(nil)
	_ Browser = (*S3)(nil)
)
