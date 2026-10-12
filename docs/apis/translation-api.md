# API: Dịch nội dung

Hợp đồng HTTP cho module translation. Thiết kế đi kèm:
[docs/domains/translation/README.md](../domains/translation/README.md).

Hai mặt tiếp xúc, hai mô hình rất khác nhau:

| Nhóm | Tiền tố | Xác thực | Ghi? |
| --- | --- | --- | --- |
| Console | `/api/translations` | token người dùng | có |
| Khách trên site | các route `/api/public/*` sẵn có | không | không |

Khách **không có endpoint riêng**. Bản dịch đi kèm dữ liệu công khai vốn có, qua
tham số `?locale=`. Thêm một mặt tiếp xúc công khai nữa chỉ để lấy bản dịch sẽ
tạo ra đường thứ hai vào cùng một dữ liệu, với luật riêng của nó — đúng thứ kiến
trúc này tránh.

---

## 1. Console

Mọi route cần token như mọi route console khác. **Quyền là quyền của module sở
hữu**, không có quyền riêng cho dịch (xem domain §11):

| entity | quyền cần có |
| --- | --- |
| `product`, `product_category` | `products.edit` |
| `member` | `members.edit` |
| `article` | `cms.article.edit` (+ ABAC tác giả của chính module cms) |
| `page` | `cms.page.edit` |
| `cms_category`, `tag` | `cms.taxonomy.manage` |

### `GET /api/translations/{entity}/{id}`

Lấy toàn bộ bản dịch của một bản ghi, mọi ngôn ngữ.

```json
{
  "entity": "product",
  "entity_id": "8a7f…",
  "base_locale": "vi",
  "locales": ["en"],
  "translatable_fields": ["slug", "name", "summary", "body_html", "highlights", "seo"],
  "translations": {
    "en": {
      "values": { "name": "Lean Stock", "summary": "" },
      "updated_at": "2026-10-12T09:30:00+07:00"
    }
  }
}
```

`translatable_fields` đi kèm response để console **không phải tự biết** trường nào
dịch được. Một danh sách duy nhất, do backend giữ; console dựng form từ đó.

`summary` rỗng là hợp lệ và có nghĩa "chưa dịch" — sẽ rơi về bản gốc lúc publish.

### `PUT /api/translations/{entity}/{id}/{locale}`

Thay toàn bộ giá trị của một bản ghi × một ngôn ngữ.

```json
{ "values": { "name": "Lean Stock", "summary": "Inventory for multi-branch shops." } }
```

**PUT chứ không PATCH**: form dịch gửi cả khối, và trường bị xoá khỏi payload có
nghĩa "bỏ bản dịch, dùng lại bản gốc". Với PATCH thì không có cách nào diễn đạt
"xoá bản dịch của riêng trường này" mà không thêm quy ước `null` riêng.

- `200` — trả về nguyên dạng của `GET` ở trên.
- `422 unknown_field` — `values` chứa trường ngoài `translatable_fields`. Báo tên
  trường trong `details`.
- `422 unknown_locale` — `locale` không có trong `translation.locales`.
- `409 translation_disabled` — `translation.enabled` đang tắt.

Giá trị rỗng/chỉ có khoảng trắng được **lưu nguyên**, không tự xoá dòng: người
dùng xoá chữ đi là một ý định, và tỉ lệ "đã dịch" ở console phải phản ánh đúng
rằng trường đó đang trống.

**Slug trùng KHÔNG bị bắt ở đây.** Lưu một slug tiếng Anh đã thuộc bản ghi khác
vẫn `200`. Xung đột chỉ hiện ra lúc publish, khi `published_docs` từ chối dòng thứ
hai (`409 slug_taken`). Đây là đánh đổi có chủ ý của thiết kế — xem domain §5.

Console nên **cảnh báo mềm** ngay lúc nhập (một truy vấn đối soát, không chặn lưu)
để người dùng không phải gõ xong mới biết.

### `DELETE /api/translations/{entity}/{id}/{locale}`

Xoá hẳn bản dịch của một ngôn ngữ. `204`.

Khác với PUT một khối rỗng: PUT giữ dòng với `values = {}`, DELETE bỏ dòng. Hai
việc khác nhau, và ở màn hình chúng là hai nút khác nhau.

**Không xoá dòng ở `published_docs`.** URL tiếng Anh đã publish vẫn sống cho tới
lần publish tiếp theo — đúng nguyên tắc "bản công khai chỉ đổi khi bấm Publish".

### Sau khi sửa: cần publish lại

Với thực thể **có vòng đời publish** (`product`, `article`, `page`), bản dịch vừa
lưu **chưa lên website**. Response kèm cờ để console nói rõ điều đó:

```json
{ "requires_republish": true }
```

`true` khi bản ghi gốc đang ở trạng thái đã publish và `published_docs` hiện chưa
mang bản dịch mới. Xem domain §6 — đây là đánh đổi có chủ ý, không phải lỗi.

## 2. Khách trên site

Không có endpoint mới. Các route công khai sẵn có nhận thêm **một tham số**:

```
GET /api/public/products?locale=en
GET /api/public/products/{slug}?locale=en
GET /api/public/product-categories?locale=en
GET /api/public/members?locale=en
```

Response **giữ nguyên hình dạng cũ**. Các trường dịch được đã bị thay giá trị tại
chỗ:

```jsonc
// ?locale=en
{
  "slug": "lean-stock",
  "name": "Lean Stock",
  "summary": "Inventory for …",
  "categories": [{ "slug": "operations", "name": "Operations" }]
}
```

Site **không phải biết** trường nào đã dịch, trường nào rơi về bản gốc. Nó nhận
một bản ghi đã sẵn sàng hiển thị.

Khác với bản thiết kế đầu: backend cũng **không phải biết**. Việc phủ bản dịch và
rơi về bản gốc đã xong từ lúc publish; lúc đọc chỉ là lấy đúng dòng
`published_docs` ứng với `(entity, locale, slug)`.

### Tra theo slug

`{slug}` được tra **trong phạm vi ngôn ngữ đang hỏi**:

```
GET /api/public/products/lean-stock?locale=en   → dòng (product, en, lean-stock)
GET /api/public/products/kho-gon                → dòng (product, vi, kho-gon)
```

Bản ghi chưa có slug dịch thì lúc publish đã lấy slug gốc, nên
`/api/public/products/kho-gon?locale=en` vẫn trả bản tiếng Anh của chính sản phẩm
đó. Trang tiếng Anh không được biến mất chỉ vì chưa ai đặt slug cho nó (domain §5).

### Slug cũ → `301`

Slug bị thay không biến mất; nó ở lại `published_docs` với `is_current = false`.
Tra trúng dòng đó → backend tra dòng đang sống của cùng bản ghi, **cùng ngôn ngữ
đó** → `301`.

Không có bảng `slug_history`. Chuyển hướng là hệ quả của việc khoá chính đặt lên
URL, không phải một cơ chế riêng.

### Khối `alternates`

Response chi tiết kèm đủ đường dẫn mọi ngôn ngữ, để site dựng `hreflang` mà không
phải gọi thêm vòng nào:

```json
{
  "slug": "lean-stock",
  "name": "Lean Stock",
  "alternates": [
    { "locale": "vi", "path": "/products/kho-gon",       "x_default": true },
    { "locale": "en", "path": "/en/products/lean-stock", "x_default": false }
  ]
}
```

`hreflang` chỉ có hiệu lực khi mọi bản **trỏ lẫn nhau và tự trỏ vào mình**; thiếu
một chiều là Google bỏ qua cả cặp. Vì vậy `alternates` luôn chứa **cả bản đang
xem**, không chỉ các bản khác.

`x_default` đánh dấu tiếng Việt — ngôn ngữ gốc và là bản luôn tồn tại.

Dựng khối này là một truy vấn
`WHERE entity = $1 AND entity_id = $2 AND is_current`.

### Tìm kiếm

`?q=` tìm trên cột `search_text` của chính ngôn ngữ đang hỏi, qua index GIN
trigram. Tìm `Lean Stock` với `?locale=en` ra kết quả; tìm cùng chuỗi đó với
`locale=vi` thì không — đúng như người đọc mong đợi.

### Quy tắc

- Không có `locale`, hoặc `locale=vi` → bản gốc, y như hôm nay.
- `locale` lạ hoặc không nằm trong `translation.locales` → **bản gốc, `200`**.
  Khách gõ sai tham số không đáng nhận trang lỗi.
- `translation.enabled` tắt → `locale` bị bỏ qua, luôn trả bản gốc.
- Nội dung đã publish trước khi bật module → chỉ có dòng `vi` cho tới khi publish
  lại. `?locale=en` trả bản tiếng Việt, `200`.

### Cache

API công khai đang đặt `Cache-Control: public, max-age=60`.

Ngôn ngữ **phải nằm trong URL**, không được lấy từ `Accept-Language`.

Query param ở đây là của **API**, không phải URL công khai của website. Google
đánh dấu `site.com?loc=de` là *"Not recommended"* cho URL trang; website dùng tiền
tố `/en/…`. API không bị index nên query param là đúng chỗ. Cache dùng chung khoá
theo URL; nếu ngôn ngữ đến từ header mà URL không đổi, proxy sẽ trả tiếng Anh cho
người đọc tiếng Việt.

ETag tính từ chính body nên tự đổi theo ngôn ngữ — không cần làm gì thêm.

Nếu sau này hỗ trợ `Accept-Language` thì **bắt buộc** thêm
`Vary: Accept-Language`.

## 3. Cấu hình

Hai setting, gác bởi `settings.manage` như mọi setting khác:

| Khoá | Kiểu | Mặc định | Ý nghĩa |
| --- | --- | --- | --- |
| `translation.enabled` | bool | `false` | Bật/tắt toàn bộ module |
| `translation.locales` | mảng | `["en"]` | Ngôn ngữ ngoài tiếng Việt |

Cả hai là `is_public` để site và console đọc được mà không cần đăng nhập — site
phải biết có nên hiện nút đổi ngôn ngữ hay không.

Tắt module **không xoá dữ liệu** ở `translations`. Nhưng lần publish tiếp theo sẽ
chỉ ghi dòng `vi`, nên URL tiếng Anh của bản ghi đó biến mất. Bật lại và publish
lại là có ngay (domain §12).

## 4. Lỗi

Dùng chung khuôn lỗi của toàn hệ thống:

```json
{ "error": { "code": 422, "message": "unknown_field", "details": { "field": "price" } } }
```

| Mã | Khi nào |
| --- | --- |
| `401 unauthorized` | thiếu token ở route console |
| `403 access_denied` | thiếu quyền của module sở hữu |
| `404 not_found` | `entity` không khai báo, hoặc `id` không tồn tại |
| `409 translation_disabled` | ghi khi module đang tắt |
| `422 unknown_field` | `values` có trường ngoài danh sách |
| `422 unknown_locale` | `locale` không nằm trong cấu hình |
| `409 slug_taken` | **ở route publish**, không phải ở route dịch — slug đã thuộc bản ghi khác trong cùng loại nội dung và cùng ngôn ngữ |

`404` khi `entity` lạ chứ không phải `400`: với người gọi, một thực thể không khai
báo thì không tồn tại.
