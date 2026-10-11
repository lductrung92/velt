# API: Products & Members

Hợp đồng HTTP cho [domain products](../domains/products/README.md) và
[domain members](../domains/members/README.md).

---

## 1. Quy ước chung

Giống hệt phần còn lại của API, không phát minh gì mới.

**Lỗi** — mọi phản hồi non-2xx dùng một shape duy nhất (`internal/httpx/respond.go`):

```json
{ "error": { "code": 422, "message": "validation_failed", "details": { "name": "required" } } }
```

Dựng bằng `apperr.Validation(fields)`, `apperr.NotFound(key)`, `apperr.Conflict(key)`,
`apperr.Forbidden(...)`, `apperr.Internal()`. Handler chỉ gọi `httpx.WriteError(w, err)`.

**Phân trang** — envelope giống `cms_articles`:

```json
{ "items": [...], "total": 42, "page": 1, "page_size": 20 }
```

`page` bắt đầu từ 1. `page_size` mặc định 20, trần 100.

**Xác thực** — route admin nằm sau `httpx.Authenticator(tokens)` và kiểm quyền qua
`base.Require(ctx, id, perm)`. Route public không auth.

**Ảnh** — mọi phản hồi trả **URL đã dựng sẵn** (`storage.Manager.URL`), không trả
`*_path` thô. Client không bao giờ cần biết key storage.

---

## 2. Products — admin

Mount dưới `/api/products`, đã qua auth.

| Method | Path | Quyền | Ghi chú |
|---|---|---|---|
| GET | `/api/products` | `products.view` | Danh sách, có lọc + phân trang |
| POST | `/api/products` | `products.create` | |
| GET | `/api/products/{id}` | `products.view` | Chi tiết đầy đủ |
| PATCH | `/api/products/{id}` | `products.edit` | Cập nhật một phần |
| DELETE | `/api/products/{id}` | `products.delete` | Xoá cứng + purge media |
| POST | `/api/products/{id}/publish` | `products.publish` | Ghi `published_snapshot` |
| POST | `/api/products/{id}/unpublish` | `products.publish` | Về `draft`, giữ snapshot |
| POST | `/api/products/{id}/archive` | `products.publish` | Gỡ khỏi site, giữ bản ghi |
| PUT | `/api/products/{id}/categories` | `products.edit` | Thay toàn bộ danh sách |
| PUT | `/api/products/{id}/members` | `products.edit` | Thay toàn bộ, kèm role + thứ tự |
| POST | `/api/products/{id}/media` | `products.edit` | Upload ảnh gallery (multipart) |
| POST | `/api/products/{id}/media/video` | `products.edit` | Thêm mục video bằng URL |
| PATCH | `/api/products/{id}/media/{mediaId}` | `products.edit` | Sửa caption |
| DELETE | `/api/products/{id}/media/{mediaId}` | `products.edit` | Xoá mục + file |
| PUT | `/api/products/{id}/media/order` | `products.edit` | Sắp xếp lại |
| POST | `/api/products/{id}/upload` | `products.edit` | Ảnh bìa / OG / inline (`purpose`) |

### GET `/api/products`

Query: `q`, `category` (slug), `lifecycle`, `status`, `platform`, `audience`,
`featured` (bool), `sort` (`-updated_at` mặc định, `name`, `-released_at`, `sort_order`),
`page`, `page_size`.

```json
{
  "items": [{
    "id": "…", "slug": "bang-cong-viec", "name": "Bảng công việc",
    "summary": "Không gian sắp xếp công việc của nhóm.",
    "cover_url": "/api/files/products/…/cover-….webp",
    "status": "published", "lifecycle": "launched",
    "is_featured": true, "version": "1.4.2", "released_at": "2026-03-01",
    "categories": [{ "id": "…", "slug": "cong-tac", "name": "Cộng tác" }],
    "member_count": 3,
    "updated_at": "2026-10-10T08:00:00Z"
  }],
  "total": 1, "page": 1, "page_size": 20
}
```

### POST / PATCH `/api/products`

Chỉ `name` là bắt buộc. `slug` rỗng → sinh từ `name`.

```json
{
  "name": "Bảng công việc",
  "slug": "bang-cong-viec",
  "summary": "…",
  "body_html": "<p>…</p>",
  "body_json": { "type": "doc", "content": [] },
  "cover_path": "products/…/cover-….webp",
  "lifecycle": "launched",
  "version": "1.4.2",
  "released_at": "2026-03-01",
  "audience": ["team", "business"],
  "platforms": ["web", "ios"],
  "tech_stack": ["React", "Go"],
  "highlights": ["Đồng bộ thời gian thực", "Phân quyền theo nhóm"],
  "is_featured": true,
  "sort_order": 0,
  "product_url": "https://…",
  "demo_url": "https://…",
  "demo_access": "Không cần đăng nhập",
  "demo_instructions": ["Chọn dữ liệu mẫu", "Thử kéo thả thẻ"],
  "seo": { "title": "…", "description": "…", "keywords": "…",
           "canonical_url": "…", "noindex": false, "nofollow": false,
           "og_title": "…", "og_description": "…", "og_path": "…" }
}
```

Lỗi xác thực (`422`, `details`):

| Khoá | Giá trị | Khi nào |
|---|---|---|
| `name` | `required` | Rỗng |
| `slug` | `taken` | Trùng sản phẩm khác |
| `slug` | `invalid` | Sau khi slugify ra chuỗi rỗng |
| `lifecycle` | `invalid` | Ngoài `idea\|building\|launched` |
| `cover_path` | `forbidden` | Không nằm dưới `products/{id}/` (`OwnsMedia` chặn) |
| `released_at` | `invalid` | Không phải `YYYY-MM-DD` |

`status` **không** sửa qua PATCH — chỉ đổi bằng `/publish`, `/unpublish`, `/archive`,
để quyền xuất bản tách khỏi quyền sửa.

### PUT `/api/products/{id}/members`

Thay toàn bộ danh sách; thứ tự trong mảng chính là `sort_order`.

```json
{ "members": [
  { "member_id": "…", "role": "Backend" },
  { "member_id": "…", "role": "Thiết kế" }
] }
```

`member_id` không tồn tại → `422` với `details.members.<index> = "not_found"`.
Trùng `member_id` trong một request → `422` `details.members = "duplicate"`.

### PUT `/api/products/{id}/categories`

```json
{ "category_ids": ["…", "…"] }
```

Mảng rỗng là hợp lệ (sản phẩm chưa phân loại).

### POST `/api/products/{id}/media` — ảnh gallery

`multipart/form-data`, field `file`. Trần kích thước đọc từ settings registry giống
`UploadArticleMedia`. Chỉ nhận PNG/JPEG/WebP/GIF, nhận diện bằng **magic bytes** chứ
không tin `Content-Type` (xem `sniffImageExt` trong `cms/articles/media.go`).

```json
{ "id": "…", "kind": "image",
  "url": "/api/files/products/…/gallery-….webp",
  "caption": null, "sort_order": 3 }
```

### POST `/api/products/{id}/media/video`

```json
{ "video_url": "https://www.youtube.com/watch?v=…", "caption": "Demo 2 phút" }
```

`video_url` phải thuộc allowlist host (YouTube, Vimeo) — nó sẽ đi vào `<iframe src>`
trên site public. Ngoài allowlist → `422` `details.video_url = "unsupported_host"`.

---

## 3. Product categories — admin

| Method | Path | Quyền |
|---|---|---|
| GET | `/api/product-categories` | `products.view` |
| POST | `/api/product-categories` | `products.category.manage` |
| PATCH | `/api/product-categories/{id}` | `products.category.manage` |
| DELETE | `/api/product-categories/{id}` | `products.category.manage` |
| PUT | `/api/product-categories/order` | `products.category.manage` |

GET trả phẳng, kèm số sản phẩm đang dùng:

```json
{ "items": [
  { "id": "…", "slug": "cong-tac", "name": "Cộng tác",
    "description": null, "sort_order": 0, "product_count": 4 }
] }
```

Xoá danh mục **không** chặn khi còn sản phẩm — liên kết tự cascade. Console hiển thị
`product_count` trong hộp xác nhận để người dùng biết hậu quả.

---

## 4. Members — admin

| Method | Path | Quyền |
|---|---|---|
| GET | `/api/members` | `members.view` |
| POST | `/api/members` | `members.manage` |
| GET | `/api/members/{id}` | `members.view` |
| PATCH | `/api/members/{id}` | `members.manage` |
| DELETE | `/api/members/{id}` | `members.manage` |
| POST | `/api/members/{id}/avatar` | `members.manage` |
| PUT | `/api/members/order` | `members.manage` |

```json
{
  "full_name": "Nguyễn Văn A",
  "slug": "nguyen-van-a",
  "role": "Backend Engineer",
  "bio": "…",
  "email": "a@velt.vn",
  "zalo": "https://zalo.me/…",
  "links": [{ "label": "GitHub", "url": "https://github.com/…" }],
  "skills": ["Go", "Postgres"],
  "is_active": true
}
```

`full_name` bắt buộc. `links[].url` phải là `http`/`https` tuyệt đối →
`details.links.<index>.url = "invalid"`.

GET `/api/members/{id}` kèm sản phẩm người đó tham gia:

```json
{ "id": "…", "full_name": "…", "avatar_url": "…",
  "products": [{ "id": "…", "name": "Bảng công việc", "role": "Backend" }] }
```

---

## 5. Public — không auth

Chỉ trả nội dung đã xuất bản, đọc từ `published_snapshot`.

| Method | Path |
|---|---|
| GET | `/api/public/products` |
| GET | `/api/public/products/{slug}` |
| GET | `/api/public/product-categories` |
| GET | `/api/public/members` |
| GET | `/api/public/members/{slug}` |

### GET `/api/public/products`

Query: `q`, `category` (slug), `lifecycle`, `audience`, `platform`, `featured`,
`sort` (`featured` mặc định, `name`, `newest`), `page`, `page_size`.

Chỉ trả `status = 'published'`. **Không** có tham số `status` — client không được phép
hỏi bản nháp.

```json
{
  "items": [{
    "slug": "bang-cong-viec", "name": "Bảng công việc", "summary": "…",
    "cover_url": "…", "lifecycle": "launched", "is_featured": true,
    "audience": ["team"], "platforms": ["web"],
    "categories": [{ "slug": "cong-tac", "name": "Cộng tác" }]
  }],
  "total": 1, "page": 1, "page_size": 20
}
```

### GET `/api/public/products/{slug}`

Chi tiết đầy đủ từ snapshot: `body_html`, `gallery[]`, `members[]` (kèm `role`,
`avatar_url`, `slug`), khối demo, khối SEO, `tech_stack`, `highlights`, `version`,
`released_at`.

Không tồn tại hoặc chưa xuất bản → `404` `{ "error": { "code": 404, "message": "not_found" } }`.
Hai trường hợp trả giống nhau: không tiết lộ sự tồn tại của bản nháp.

### Cache

Đặt `ETag` + `Cache-Control: public, max-age=60` như `/api/public/settings`.
Khi xuất bản/gỡ xuất bản, gọi `base.Revalidate(ctx, "product:<slug>", "products:list")`
để site chủ động xoá cache ISR — đúng cơ chế `cms/pages` đang dùng.

---

## 6. Rate limit

Các route public dùng chung limiter (`platform/ratelimit`) như
`/api/public/settings` và newsletter. Route admin không giới hạn thêm ngoài
limiter toàn cục.
