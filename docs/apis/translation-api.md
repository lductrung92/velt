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
  "translatable_fields": ["name", "summary", "body_html", "highlights", "seo"],
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

`summary` rỗng là hợp lệ và có nghĩa "chưa dịch" — sẽ rơi về bản gốc khi hiển thị.

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

### `DELETE /api/translations/{entity}/{id}/{locale}`

Xoá hẳn bản dịch của một ngôn ngữ. `204`.

Khác với PUT một khối rỗng: PUT giữ dòng với `values = {}`, DELETE bỏ dòng. Hai
việc khác nhau, và ở màn hình chúng là hai nút khác nhau.

### Sau khi sửa: cần publish lại

Với thực thể **có `published_snapshot`** (`product`, `article`, `page`), bản dịch
vừa lưu **chưa lên website**. Response kèm cờ để console nói rõ điều đó:

```json
{ "requires_republish": true }
```

`true` khi bản ghi gốc đang ở trạng thái đã publish và snapshot hiện tại chưa chứa
bản dịch mới. Xem domain §7 — đây là đánh đổi có chủ ý, không phải lỗi.

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
  "slug": "kho-gon",              // không dịch, giữ nguyên
  "name": "Lean Stock",           // đã thay
  "summary": "Inventory for …",   // đã thay
  "categories": [{ "slug": "quan-ly", "name": "Operations" }]
}
```

Site **không phải biết** trường nào đã dịch, trường nào rơi về bản gốc. Nó nhận
một bản ghi đã sẵn sàng hiển thị. Đó là điểm mấu chốt: logic fallback nằm một chỗ,
ở backend, không rải ra mọi component.

### Quy tắc

- Không có `locale`, hoặc `locale=vi` → bản gốc, y như hôm nay.
- `locale` lạ hoặc không nằm trong `translation.locales` → **bản gốc, `200`**.
  Khách gõ sai tham số không đáng nhận trang lỗi.
- `translation.enabled` tắt → `locale` bị bỏ qua, luôn trả bản gốc.
- Trường chưa dịch → giá trị gốc tiếng Việt (domain §6).

### Cache

API công khai đang đặt `Cache-Control: public, max-age=60`.

Ngôn ngữ **phải nằm trong URL**, không được lấy từ `Accept-Language`. Cache dùng
chung khoá theo URL; nếu ngôn ngữ đến từ header mà URL không đổi, proxy sẽ trả
tiếng Anh cho người đọc tiếng Việt.

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

Tắt module **không xoá dữ liệu**. Bật lại là có ngay (domain §12).

## 4. Lỗi

Dùng chung khuôn lỗi của toàn hệ thống:

```json
{ "error": { "code": 422, "message": "unknown_field", "details": { "field": "slug" } } }
```

| Mã | Khi nào |
| --- | --- |
| `401 unauthorized` | thiếu token ở route console |
| `403 access_denied` | thiếu quyền của module sở hữu |
| `404 not_found` | `entity` không khai báo, hoặc `id` không tồn tại |
| `409 translation_disabled` | ghi khi module đang tắt |
| `422 unknown_field` | `values` có trường ngoài danh sách |
| `422 unknown_locale` | `locale` không nằm trong cấu hình |

`404` khi `entity` lạ chứ không phải `400`: với người gọi, một thực thể không
khai báo thì không tồn tại.
