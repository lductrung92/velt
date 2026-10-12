# Triển khai: module dịch nội dung

Kế hoạch thi công cho [thiết kế ở README](README.md). File này nói **sửa file
nào, theo thứ tự nào**, không nhắc lại lý do đã có ở thiết kế.

---

## Bước 0 — Lịch sử slug (hạng mục riêng, làm trước)

**Không phải tính năng dịch.** Đây là lỗ hổng có sẵn: đổi slug hôm nay làm hỏng
mọi link đã phát ra, kể cả khi chưa có đa ngôn ngữ. Dịch slug nhân đôi số URL
hỏng được, nên phải vá trước.

```
migrations/0034_slug_history.sql
internal/platform/slughistory/         ← dùng chung, không thuộc module nào
    store.go      Record(entity, locale, oldSlug, id) / Lookup(entity, locale, slug)
```

Nối vào: mỗi service đổi slug gọi `Record` **trong cùng transaction** với lệnh
UPDATE. Mỗi handler công khai, khi không tìm thấy slug, tra `Lookup` trước khi trả
404 — thấy thì `301` tới slug hiện tại.

Chỗ phải sửa: `products/catalog`, `cms/articles`, `cms/pages`, `cms/taxonomy`.

**Kiểm chứng:** đổi slug một sản phẩm đã publish → URL cũ trả `301`, URL mới trả
`200`, cả hai cùng trỏ một bản ghi.

---

## Bước 1 — Nền móng backend

### 1.1 Migration

```
migrations/0035_translations.sql
```

Bảng `translations` + unique index trên `(entity, locale, values->>'slug')` như
README §3 và §4b.

### 1.2 Module

```
internal/modules/translation/
    models.go       Entity, Field, Declaration, Values
    declare.go      bảng khai báo thực thể → trường dịch được (README §4)
    repository.go   Get / Upsert / Delete / Bundle / Purge / ResolveSlug
    service.go      kiểm trường hợp lệ, locale hợp lệ, cờ bật/tắt
    handler.go      4 route ở translation-api.md §1
    routes.go
    shared/settings.go   translation.enabled, translation.locales
```

`declare.go` là nơi duy nhất biết thực thể nào dịch được trường nào. Thêm thực thể
= thêm một dòng ở đây, không migration.

### 1.3 Đăng ký settings

Theo đúng khuôn `ai`:

```go
// cmd/api/main.go
settingsDefs = append(settingsDefs, translation.SettingDefs()...)
```

### 1.4 Quyền

Service nhận một hàm kiểm quyền theo thực thể, do wiring truyền vào — module
translation **không tự biết** `products.edit` là gì:

```go
type Authorizer func(ctx context.Context, id *httpx.Identity, entity string) error
```

Nhờ vậy luật ABAC của cms (tác giả chỉ sửa bài của mình) vẫn do cms quyết định.

**Test bước này:** fallback, từ chối trường ngoài khai báo, từ chối locale lạ,
`Purge` xoá đúng bản ghi, và cờ tắt thì `Bundle` trả rỗng.

---

## Bước 2 — Nối thực thể đầu tiên: `product`

Làm **một** thực thể cho chạy thật trước khi nhân ra. Đây là bước chạm
`published_snapshot` nên đáng sợ nhất.

### 2.1 Cổng

```go
// internal/modules/products/catalog/ports.go
type Translator interface {
    Bundle(ctx context.Context, entity string, ids []uuid.UUID,
        locales []string) (map[uuid.UUID]map[string]map[string]any, error)
    ResolveSlug(ctx context.Context, entity, locale, slug string) (uuid.UUID, error)
    Purge(ctx context.Context, entity string, id uuid.UUID) error
}
```

`nil` hợp lệ = không có bản dịch. Test của products không phải dựng module dịch.

### 2.2 Gộp vào snapshot lúc publish

`catalog/service.go` → `transition()`, ngay trước `json.Marshal(full)`:

```go
if status == StatusPublished && s.tr != nil {
    byLocale, err := s.tr.Bundle(ctx, "product", []uuid.UUID{productID}, locales)
    // ... gắn vào full.I18n
}
```

Lỗi khi nạp bản dịch **không được chặn publish** — ghi log, publish bản gốc. Mất
bản dịch một lần tốt hơn là không xuất bản được nội dung.

### 2.3 Tra slug công khai

Giữ nguyên nguyên tắc có sẵn trong `GetPublishedBySlug`: **routing đọc bảng sống,
nội dung đọc snapshot**. Bản dịch cũng vậy — tra slug trên bảng `translations`,
không tra trong snapshot.

Hai truy vấn tuần tự, **không gộp thành một câu SQL khôn ngoan**:

```
1. slug dịch:  translations WHERE entity='product' AND locale=$l AND values->>'slug'=$s
2. nếu trượt:  products WHERE slug=$s
3. nếu trượt:  slug_history (bước 0) → 301
4. nếu trượt:  404
```

Thứ tự này giải quyết một ca nhập nhằng thật: sản phẩm A có slug EN `lean-stock`,
sản phẩm B có slug gốc `lean-stock` và chưa dịch. `/en/products/lean-stock` phải
ra A. **Slug đã dịch luôn thắng**, slug gốc chỉ là lưới đỡ.

### 2.4 Overlay và `alternates`

`PublicService` sau khi lấy snapshot:

- phủ `i18n[locale]` lên trường gốc, bỏ qua giá trị rỗng (README §6);
- dựng `alternates` từ một truy vấn `translations` cho `entity_id` đó, **luôn gồm
  cả bản đang xem** (hreflang hai chiều).

### 2.5 Xoá

`catalog/service.go` → `Delete()` gọi `s.tr.Purge(ctx, "product", id)`.

**Kiểm chứng bước 2 (chạy thật, không chỉ unit test):**

| | mong đợi |
| --- | --- |
| `GET /api/public/products/kho-gon` | bản tiếng Việt |
| `GET /api/public/products/lean-stock?locale=en` | cùng sản phẩm, chữ tiếng Anh |
| `GET /api/public/products/kho-gon?locale=en` | cùng sản phẩm, chữ tiếng Anh (chưa có slug EN) |
| sửa bản dịch, chưa publish | API công khai **vẫn** trả bản cũ |
| publish lại | API công khai trả bản mới |
| tắt `translation.enabled` | `?locale=en` bị bỏ qua, không lỗi |
| `alternates` | có cả `vi` và `en`, `x_default` ở `vi` |

---

## Bước 3 — Console

### 3.1 Module

```
src/console/src/modules/translation/
    services/translation.service.ts
    hooks/useTranslation.ts          useTranslations(entity,id) / useSaveTranslation
    components/LanguageTabs.tsx      [ Tiếng Việt ] [ English 3/6 ]
    components/TranslatedField.tsx   ô nhập + bản gốc bên dưới + nhãn "chưa dịch"
    components/RepublishBanner.tsx
```

### 3.2 Nối vào editor

State bản dịch **sống ngoài zod form**, đúng khuôn SEO đang dùng ở
`ProductEditor`:

```tsx
const [tr, setTr] = useState<Record<string, Values>>({});
const [trDirty, setTrDirty] = useState(false);
```

Lý do: hình dạng của nó động (theo locale × theo trường khai báo), không khớp một
schema zod tĩnh.

**Lưu lúc tạo** phải theo đúng khuôn ảnh deferred đang có:

```tsx
const created = await create.mutateAsync(body);
await resolveImage(created.id, featured, "featured");   // đã có
await flushTranslations(created.id, tr);                 // thêm, cùng chỗ
```

Không bao giờ bắt "lưu trước rồi mới dịch" — chính là friction đã bị bác bỏ khi
làm upload ảnh.

**Chốt chặn thoát trang** phải tính cả `trDirty`, nếu không người dịch mất công gõ.

### 3.3 Màn danh sách

Thêm một thẻ tổng quan **"Chưa dịch"**. Lọc theo *có/chưa có bản dịch* là `EXISTS`
trên bảng translations — rẻ, và khác hẳn với "tìm kiếm trong nội dung đã dịch"
(thứ README §13 nói không làm).

### 3.4 Màn cấu hình

`translation.enabled` + `translation.locales` vào màn Cấu hình hệ thống, cạnh các
cờ `app.*`.

---

## Bước 4 — Nhân ra 6 thực thể còn lại

Mỗi thực thể chỉ còn ba việc cơ học:

1. thêm dòng vào `declare.go`;
2. nối cổng `Translator` vào service của module đó (snapshot nếu có, `Purge` luôn
   luôn);
3. gắn `LanguageTabs` vào editor tương ứng.

Thứ tự đề xuất: `product_category` → `article` → `page` → `cms_category` → `tag`
→ `member`. Danh mục sản phẩm trước vì nó gần sản phẩm nhất; `member` cuối vì nó
không có snapshot và không có slug dịch.

---

## Ước lượng và rủi ro

| Bước | Khối lượng | Rủi ro |
| --- | --- | --- |
| 0 · lịch sử slug | vừa | chạm 4 module; phải vào đúng transaction |
| 1 · nền móng | vừa | thấp, module độc lập |
| 2 · product | **nhỏ nhưng khó** | chạm `published_snapshot` — phần dễ sai nhất |
| 3 · console | lớn | trạng thái editor nhân lên: section × ngôn ngữ × dirty |
| 4 · nhân ra | lớn nhưng cơ học | lặp lại, ít bất ngờ |

**Rủi ro lớn nhất không nằm ở code.** Bật module lên là mỗi nội dung phải viết hai
lần, mãi mãi. Nên bật `translation.enabled = false` làm mặc định, và chỉ bật khi
thật sự có người viết bản tiếng Anh (README §16).
