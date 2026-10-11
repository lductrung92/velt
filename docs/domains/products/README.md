# Domain: Products

Thiết kế module sản phẩm cho VELT. Đọc file này trước khi viết migration hoặc code.

- Hợp đồng HTTP: [docs/apis/products-api.md](../../apis/products-api.md)
- Màn hình console: [docs/screens/products/workflows.md](../../screens/products/workflows.md)
- Hồ sơ đội ngũ: [docs/domains/members/README.md](../members/README.md)

---

## 1. Phạm vi

VELT bán sản phẩm công nghệ do team tự phát triển (phần mềm, app). Module này quản trị
**catalog sản phẩm** và phục vụ nó ra site public.

**Trong phạm vi**

- CRUD sản phẩm: tên, mô tả ngắn, mô tả chi tiết (rich text), ảnh bìa, gallery (ảnh + video)
- Phân loại nhiều-nhiều vào danh mục sản phẩm (taxonomy riêng, phẳng)
- Gắn thành viên phát triển, mỗi người một vai trò **trong sản phẩm đó**
- Siêu dữ liệu kỹ thuật: nền tảng, tech stack, phiên bản, ngày ra mắt, đối tượng, điểm nổi bật
- Thông tin demo: link, cách truy cập, các bước dùng thử
- Luồng xuất bản + SEO cho trang chi tiết
- API public cho site đọc động

**Ngoài phạm vi (cố ý)**

| Việc | Vì sao | Thuộc về |
|---|---|---|
| Giá, gói, license, subscription | Mỗi sản phẩm một hình thức bán khác nhau | Module bán hàng riêng — xem §7 |
| Thanh toán, đơn hàng | Như trên | Module bán hàng riêng |
| Hồ sơ đội ngũ | Là bounded context riêng, products chỉ tham chiếu | [members](../members/README.md) |
| Trang landing kéo-thả cho từng sản phẩm | Mô tả rich text là đủ; nâng cấp sau nếu cần | CMS landing (đã có) |

---

## 2. Ba bounded context

```
members                 (độc lập, không phụ thuộc gì)
   ▲
   │ product_members
   │
products ──────────────► product_categories
         product_category_links
```

Mỗi context là một thư mục dưới `internal/modules/`, theo đúng cấu trúc của `cms`:

```
internal/modules/members/          models.go repository.go service.go handler.go routes.go
internal/modules/products/
    shared/base.go                 Require(perm), Sec(), Revalidate() — bản riêng của products
    catalog/                       sản phẩm (CRUD, publish, media, liên kết)
    categories/                    taxonomy sản phẩm
```

> `cms/shared.Base` **không** dùng lại được: nó mang helper riêng của CMS
> (`AllowSlugEdit`, `CategorizeRequired`, `RequireReview`...). Mỗi bounded context
> trong repo này có `shared/base.go` của chính nó — xem `admin/shared/base.go` và
> `cms/shared/base.go`. Products làm theo đúng vậy.

---

## 3. Hai trục trạng thái — đừng gộp

Đây là chỗ dễ sai nhất trong thiết kế này.

| Trục | Cột | Giá trị | Ý nghĩa |
|---|---|---|---|
| Luồng xuất bản | `status` | `draft` · `published` · `archived` | **Ai nhìn thấy** bản ghi |
| Vòng đời sản phẩm | `lifecycle` | `idea` · `building` · `launched` | **Nội dung hiển thị** cho khách |

Hai trục độc lập hoàn toàn:

| status | lifecycle | Kết quả |
|---|---|---|
| `published` | `launched` | Sản phẩm đang bán, hiện trên site |
| `published` | `building` | Khoe roadmap: khách thấy, có nhãn "Đang phát triển" |
| `published` | `idea` | Thăm dò nhu cầu trước khi làm |
| `draft` | bất kỳ | Chỉ người có `products.view` trong console thấy |
| `archived` | bất kỳ | Gỡ khỏi site, giữ lại bản ghi và URL cũ (410/404 tuỳ site) |

Gộp hai trục lại là mất khả năng công bố một sản phẩm chưa ra mắt — mà đó chính là
nhu cầu của team đang xây sản phẩm.

Nhãn tiếng Việt (`Ý tưởng` / `Đang phát triển` / `Đã ra mắt`) nằm ở i18n console,
**không** lưu trong DB. DB lưu mã `idea|building|launched`.

---

## 4. Data model

Quy ước bám theo schema hiện có (`migrations/0003_cms.sql`):

- Danh sách dùng **JSONB**, không dùng `TEXT[]` — cả repo không có cột `TEXT[]` nào
- Ảnh lưu **đường dẫn storage** trong cột `*_path`, không lưu URL tuyệt đối
- Khối SEO sao y `cms_articles`
- `published_snapshot JSONB` đóng băng nội dung public

### 4.1 `product_categories`

Taxonomy phẳng, **không phân cấp**. Mockup chỉ có 4 danh mục ngang hàng
(Cộng tác, Công cụ cá nhân, Quản lý & vận hành, AI & tự động hoá). Làm cây lúc này là
phức tạp hoá sớm; nâng cấp phẳng → cây sau rẻ hơn gỡ cây xuống phẳng.

```sql
CREATE TABLE product_categories (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug        TEXT NOT NULL UNIQUE,
    name        TEXT NOT NULL,
    description TEXT,
    sort_order  INT NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_product_categories_sort ON product_categories (sort_order, name);
```

### 4.2 `products`

```sql
CREATE TABLE products (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug               TEXT NOT NULL UNIQUE,
    name               TEXT NOT NULL,
    summary            TEXT,                      -- mô tả ngắn, dùng ở card danh sách
    body_html          TEXT,                      -- Tiptap, đã qua htmlsan.Body
    body_json          JSONB,                     -- Tiptap doc, nguồn để mở lại editor
    cover_path         TEXT,                      -- products/<id>/cover-<uuid>.webp

    status             TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'published', 'archived')),
    lifecycle          TEXT NOT NULL DEFAULT 'idea'
        CHECK (lifecycle IN ('idea', 'building', 'launched')),

    version            TEXT,                      -- "1.4.2"
    released_at        DATE,
    audience           JSONB NOT NULL DEFAULT '[]',   -- ["individual","team","business"]
    platforms          JSONB NOT NULL DEFAULT '[]',   -- ["web","ios","android","desktop"]
    tech_stack         JSONB NOT NULL DEFAULT '[]',   -- ["React","Go","Postgres"]
    highlights         JSONB NOT NULL DEFAULT '[]',   -- ["Đồng bộ thời gian thực", ...]

    is_featured        BOOLEAN NOT NULL DEFAULT false,
    sort_order         INT NOT NULL DEFAULT 0,

    product_url        TEXT,                      -- trang chính thức của sản phẩm
    demo_url           TEXT,
    demo_access        TEXT,                      -- "Không cần đăng nhập"
    demo_instructions  JSONB NOT NULL DEFAULT '[]',   -- ["Chọn dữ liệu mẫu", ...]

    seo_title          TEXT,
    seo_description    TEXT,
    seo_keywords       TEXT,
    canonical_url      TEXT,
    seo_noindex        BOOLEAN NOT NULL DEFAULT false,
    seo_nofollow       BOOLEAN NOT NULL DEFAULT false,
    og_title           TEXT,
    og_description     TEXT,
    og_path            TEXT,

    published_at       TIMESTAMPTZ,
    published_snapshot JSONB,

    created_by         UUID REFERENCES users (id) ON DELETE SET NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_products_status    ON products (status, published_at DESC);
CREATE INDEX idx_products_lifecycle ON products (lifecycle);
CREATE INDEX idx_products_listing   ON products (is_featured DESC, sort_order, name);
```

**Vì sao `audience`/`platforms`/`tech_stack` là JSONB chứ không phải bảng nối?**
Chúng là nhãn hiển thị + lọc, không có thuộc tính riêng, không cần đổi tên đồng loạt,
và không bao giờ là đích của một trang. Danh mục thì ngược lại (có slug, có trang
`/san-pham?danh-muc=...`), nên danh mục mới cần bảng.

### 4.3 Liên kết nhiều-nhiều

```sql
CREATE TABLE product_category_links (
    product_id  UUID NOT NULL REFERENCES products (id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES product_categories (id) ON DELETE CASCADE,
    PRIMARY KEY (product_id, category_id)
);
CREATE INDEX idx_pcl_category ON product_category_links (category_id);

CREATE TABLE product_members (
    product_id UUID NOT NULL REFERENCES products (id) ON DELETE CASCADE,
    member_id  UUID NOT NULL REFERENCES members (id) ON DELETE CASCADE,
    role       TEXT,          -- vai trò TRONG sản phẩm này, rỗng → lấy role chung của member
    sort_order INT NOT NULL DEFAULT 0,
    PRIMARY KEY (product_id, member_id)
);
CREATE INDEX idx_pm_member ON product_members (member_id);
```

`role` nằm trên bảng nối chứ không phải trên `members`: một người có thể là "Backend"
ở sản phẩm X và "Quản lý dự án" ở sản phẩm Y.

`ON DELETE CASCADE` cho `member_id`: xoá một thành viên thì gỡ họ khỏi mọi sản phẩm.
Nếu muốn giữ dấu vết thì **ẩn** thành viên (`is_active = false`) thay vì xoá — xem
[members](../members/README.md).

### 4.4 `product_media` (gallery)

```sql
CREATE TABLE product_media (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products (id) ON DELETE CASCADE,
    kind       TEXT NOT NULL CHECK (kind IN ('image', 'video')),
    path       TEXT,          -- kind='image': products/<id>/gallery-<uuid>.webp
    video_url  TEXT,          -- kind='video': URL YouTube/Vimeo
    caption    TEXT,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT product_media_source_xor CHECK (
        (kind = 'image' AND path IS NOT NULL AND video_url IS NULL) OR
        (kind = 'video' AND video_url IS NOT NULL AND path IS NULL)
    )
);
CREATE INDEX idx_product_media_order ON product_media (product_id, sort_order);
```

Ràng buộc XOR theo đúng kiểu `system_settings_value_xor` ở `0002_settings.sql`: để DB
chặn bản ghi nửa vời thay vì tin vào tầng service.

Video chỉ lưu **URL**, không upload file. Nhúng qua oEmbed/iframe ở tầng site.
Chỉ chấp nhận host trong allowlist (YouTube, Vimeo) — validate ở service, vì
`video_url` sẽ đi thẳng vào `<iframe src>` trên site public.

---

## 5. Media và storage

Tái dùng nguyên bộ công cụ của CMS trong `cms/shared/media_gc.go`
(sẽ nâng lên dùng chung, hoặc copy sang `products/shared/`):

| Việc | Hàm | Khi nào |
|---|---|---|
| Chặn trỏ chéo | `OwnsMedia(prefix, path)` | Trước khi lưu bất kỳ `*_path` nào client gửi lên |
| Dọn khi thay ảnh | `DeleteOldMedia(old, new)` | Khi đổi/xoá `cover_path`, `og_path` |
| Dọn khi xoá | `PurgeMediaTree(files, prefix)` | Khi xoá sản phẩm / thành viên |

Prefix storage:

```
products/<product-id>/      cover-*, og-*, gallery-*, inline-*
members/<member-id>/        avatar-*
```

> **Bắt buộc, nếu không ảnh sẽ 404 ở local driver:** thêm hai prefix vào allowlist phục
> vụ file tĩnh trong `cmd/api/main.go`:
>
> ```go
> filesHandler := files.NewHandler(store, []string{"users/", "cms/", "products/", "members/"})
> ```
>
> Driver S3 phục vụ thẳng từ bucket nên không ảnh hưởng, nhưng dev local thì gãy ngay.

Ảnh nhúng trong mô tả rich text đặt tên `inline-*` và được GC theo đúng cơ chế
`gcInlineMedia` của articles: sau khi lưu, quét prefix và xoá file `inline-*` không còn
xuất hiện trong `body_html`.

---

## 6. Slug, publish, snapshot

**Slug** — tái dùng `cms/shared/slug.go`: `Slugify`, `UniqueSlug`, `CreateSlugBase`,
`UpdateSlugPlan`. Sản phẩm **luôn cho sửa slug thủ công** (không gate bằng feature flag
như articles): catalog nhỏ, URL là tài sản marketing, team tự quản.

**Publish** — `POST /products/{id}/publish` đặt `status='published'`, `published_at=now()`
nếu đang rỗng, và ghi `published_snapshot`. `unpublish` đưa về `draft`, **giữ nguyên**
`published_at` và snapshot.

**`published_snapshot` đóng băng những gì:** `name`, `summary`, `body_html`,
`cover_path`, `lifecycle`, `version`, `released_at`, `highlights`, `audience`,
`platforms`, `tech_stack`, khối demo, khối SEO, danh mục, thành viên (kèm role), gallery.

Đọc public trả snapshot, không trả bản ghi sống. Nhờ vậy sửa dở dang trong console
không rò ra site. Đúng cơ chế `cms_articles.published_snapshot`.

---

## 7. Chỗ chừa cho module bán hàng

**Không có cột giá nào trong `products`.** Mỗi sản phẩm một hình thức bán khác nhau
(subscription, license vĩnh viễn, mua một lần, miễn phí) — nhét `price` vào `products`
sẽ chết ngay ở sản phẩm đầu tiên có 3 gói.

Module bán hàng sau này tự tạo bảng riêng và trỏ về `products.id`:

```sql
-- KHÔNG làm bây giờ. Phác hoạ để thấy seam.
CREATE TABLE product_offerings (
    id         UUID PRIMARY KEY,
    product_id UUID NOT NULL REFERENCES products (id) ON DELETE CASCADE,
    kind       TEXT NOT NULL,   -- subscription | license | onetime | free
    ...
);
```

Hợp đồng mà module này phải giữ: `products.id` ổn định, không tái sử dụng, và xoá
sản phẩm thì cascade sang bảng của module bán hàng.

---

## 8. Quyền

Seed trong migration, theo đúng cách `0003_cms.sql` chèn `permissions` + `role_permissions`.

| Mã | Cho phép |
|---|---|
| `products.view` | Xem danh sách + chi tiết trong console |
| `products.create` | Tạo sản phẩm |
| `products.edit` | Sửa sản phẩm (gồm gallery, thành viên, danh mục) |
| `products.delete` | Xoá sản phẩm |
| `products.publish` | Xuất bản / gỡ xuất bản / lưu trữ |
| `products.category.manage` | CRUD danh mục sản phẩm |
| `members.view` | Xem danh sách thành viên |
| `members.manage` | CRUD thành viên |

Gán ban đầu: `super_admin` có sẵn qua wildcard `*`; `admin` nhận toàn bộ; `editor` nhận
`products.view`, `products.create`, `products.edit`, `members.view`.

API public **không** kiểm tra quyền và chỉ trả `status='published'`.

---

## 9. Thứ tự triển khai

Mỗi bước phải chạy được và verify được trước khi sang bước sau.

| # | Việc | Verify |
|---|---|---|
| 1 | `members`: migration + module + màn hình console | Tạo/sửa/xoá thành viên, upload ảnh hiện đúng |
| 2 | `product_categories`: migration + module + màn hình | CRUD danh mục, slug tự sinh, chặn trùng |
| 3 | `products` lõi: CRUD + Tiptap + ảnh bìa + SEO + publish | Tạo → sửa → xuất bản; `published_snapshot` có dữ liệu |
| 4 | Gallery + gắn thành viên (role) + gắn danh mục | Kéo thả đổi thứ tự, lưu, F5 vẫn đúng thứ tự |
| 5 | API public | `curl` trả đúng sản phẩm `published`, không lộ `draft` |
| 6 | `src/site` tiêu thụ API | Ngoài phạm vi đợt này |

Mỗi bước: migration → model/repo → service (+ test) → handler/routes → console → verify thật.

---

## 10. Quyết định đã chốt

Chốt trong buổi phỏng vấn ngày 2026-10-10:

| Vấn đề | Chốt | Thay vì |
|---|---|---|
| Thành viên phát triển | Module `members` riêng | Dùng lại bảng `users`, hoặc text thuần |
| Danh mục | Taxonomy riêng, nhiều-nhiều | Dùng chung `cms_categories` |
| Site public đọc dữ liệu | API public động | Export JSON, hoặc chưa làm |
| Giá / gói bán | Module riêng, làm sau | Nhúng vào `products` |
| Mô tả chi tiết | Tiptap rich text | Puck landing builder |
| Thành viên trên sản phẩm | Có `role` riêng từng sản phẩm | Chỉ danh sách người |
| Gallery | Ảnh + video nhúng | Chỉ ảnh |
| Thành viên nghỉ việc | `is_active=false`, giữ liên kết sản phẩm | Xoá cứng |
| Gỡ sản phẩm khỏi site | `archived`; `DELETE` cứng chỉ cho bản ghi tạo nhầm | Xoá mềm `deleted_at` |

Hai điều tự quyết, bác được nếu sai:

1. **Danh mục phẳng, không cây** — lý do ở §4.1
2. **Sản phẩm có SEO riêng + `published_snapshot`** — vì site đọc động nên trang chi
   tiết cần meta tag riêng, và snapshot giữ nội dung public ổn định khi đang sửa nháp

## 11. Câu còn mở

Không còn câu nào chặn việc triển khai. Những gì chưa quyết thuộc về các đợt sau:

- **Module bán hàng** — hình thức bán theo từng sản phẩm (subscription, license, mua
  một lần). Seam đã chừa ở §7, chưa thiết kế.
- **`src/site` tiêu thụ API** — site public hiện vẫn là mockup tĩnh. Cách site đọc
  `/api/public/products` sẽ thiết kế khi làm bước 6.
