# Triển khai: đường đọc công khai và module dịch

Kế hoạch thi công cho [thiết kế ở README](README.md). File này nói **sửa file
nào, theo thứ tự nào**, không nhắc lại lý do đã có ở thiết kế.

Chia làm hai nửa độc lập:

```
Giai đoạn A   published_docs cho tiếng Việt   ← không liên quan gì tới dịch
Giai đoạn B   translations + ngôn ngữ thứ hai
```

**A xong là dừng được.** Nó có giá trị riêng (sửa bug slug trùng, có `301`, tìm
kiếm nhanh gấp 185 lần) và không nợ gì nếu B không bao giờ làm.

---

# GIAI ĐOẠN A — đường đọc công khai

## A1. Migration

```
migrations/0034_published_docs.sql        tạo bảng + 2 index + pg_trgm
migrations/0035_published_docs_backfill.sql   chép snapshot sang, locale='vi'
migrations/0036_drop_published_snapshot.sql   bỏ 4 cột
```

**Ba file, không phải một.** Giữa 0035 và 0036 có một khoảng dữ liệu nằm cả hai
nơi — đó là đường lui. Chỉ chạy 0036 sau khi code ở A3/A4 đã lên và chạy thật.

0035 backfill từ bốn bảng:

```sql
INSERT INTO published_docs (entity, locale, slug, entity_id, search_text, body)
SELECT 'product', 'vi', slug, id,
       coalesce(published_snapshot->>'name','') || ' ' ||
       coalesce(published_snapshot->>'summary',''),
       published_snapshot
FROM products WHERE published_snapshot IS NOT NULL;
-- lặp cho cms_articles, cms_pages, cms_landing_pages
```

**`cms_pages` sẽ nổ ở đây** nếu dữ liệu thật đã có hai trang cùng slug (README §5).
Đó là mục đích. Migration phải dừng và bắt người vận hành chọn slug mới, chứ không
được âm thầm bỏ qua một trang. Viết câu đối soát chạy **trước** 0035 để biết trước:

```sql
SELECT slug, count(*) FROM cms_pages
WHERE status='published' GROUP BY slug HAVING count(*) > 1;
```

`cms_landing_pages` dùng cột `key` chứ không có `slug` — dùng `key` làm slug, và
ghi rõ điều đó trong migration.

## A2. Package dùng chung

```
internal/platform/pubdocs/        ← KHÔNG thuộc module nào
    models.go      Doc, Ref
    store.go       Get / Upsert / Retire / Purge / Alternates / Search
```

Đặt ở `platform` chứ không ở `modules/translation`, vì nó phải chạy **kể cả khi
module dịch tắt** (README §12). Nó thay thế `published_snapshot`, là hạ tầng.

`Upsert` nhận một lô `[]Doc` cho cùng một `entity_id` và làm trong một transaction:
rút các dòng slug cũ về `is_current = false, body = NULL`, rồi upsert dòng mới.

## A3. Publish ghi vào bảng mới

Bốn chỗ, đều là hàm đã có:

```
products/catalog/service.go      transition()
cms/articles/service.go          luồng publish
cms/pages/service.go             luồng publish
cms/landing/service.go           luồng publish
```

Mỗi chỗ: ngay sau khi dựng `full` và `json.Marshal`, thay vì ghi vào cột, gọi
`pubdocs.Upsert`. **Cùng transaction** với lệnh cập nhật trạng thái — nếu không,
một lần publish lỗi giữa chừng để lại bản ghi `published` mà không có URL.

Xung đột khoá chính → trả `409 slug_taken` kèm tên slug, không trả 500.

## A4. Đọc công khai đọc bảng mới

```
products/catalog/public_repository.go    ListPublished, GetPublishedBySlug
cms/articles/public_repo.go
cms/pages/repository.go                  GetPublishedPageBySlug
cms/landing/repository.go
ai/tools/catalog.go                      trợ lý cũng đọc snapshot
```

`GetPublishedPageBySlug` **bỏ hẳn** `ORDER BY parent_id NULLS FIRST LIMIT 1` —
mẹo đó tồn tại chỉ vì slug không duy nhất; giờ nó duy nhất thật. Xoá cả comment
thú nhận ở trên nó.

Tra trúng dòng `is_current = false` → tra dòng sống cùng `entity_id` → `301`.

## A5. Tìm kiếm dùng index

`ILIKE '%q%'` trên `search_text` giờ đi qua GIN trgm. Không đổi API, không đổi
hành vi — chỉ nhanh hơn.

Nhân tiện ghi nhận: lỗi "catalog chỉ khớp nguyên cụm" (`quản lý kho` → 0 kết quả)
**vẫn còn** sau bước này. Trigram sửa tốc độ, không sửa cách tách từ. Hạng mục
riêng.

**Kiểm chứng giai đoạn A (chạy thật, không chỉ unit test):**

| | mong đợi |
| --- | --- |
| mọi URL công khai đang có | `200`, nội dung y hệt trước migration |
| publish một sản phẩm, đổi slug | URL cũ `301` → URL mới `200` |
| tạo 2 trang cùng slug rồi publish cả hai | cái thứ hai `409`, không phải 500 |
| xoá một sản phẩm đã publish | URL của nó `404`, không còn dòng mồ côi |
| `EXPLAIN` truy vấn tìm kiếm | có `Bitmap Index Scan`, không có `Seq Scan` |
| `pg_table_size` bốn bảng nội dung | nhỏ hơn hẳn trước |

---

# GIAI ĐOẠN B — dịch

## B1. Migration

```
migrations/0037_translations.sql
```

Bảng `translations` như README §3.2. Không có index slug — slug duy nhất đã do
`published_docs` lo.

## B2. Module

```
internal/modules/translation/
    models.go       Entity, Field, Declaration, Values
    declare.go      bảng khai báo thực thể → trường dịch được (README §4)
    repository.go   Get / Upsert / Delete / Bundle / Purge
    service.go      kiểm trường hợp lệ, locale hợp lệ, cờ bật/tắt
    handler.go      3 route ở translation-api.md §1
    routes.go
    shared/settings.go   translation.enabled, translation.locales
```

`declare.go` là nơi duy nhất biết thực thể nào dịch được trường nào, **và trường
nào góp vào `search_text`**. Thêm thực thể = thêm một dòng ở đây, không migration.

Đăng ký settings theo đúng khuôn `ai`:

```go
// cmd/api/main.go
settingsDefs = append(settingsDefs, translation.SettingDefs()...)
```

Quyền: service nhận một hàm kiểm quyền theo thực thể, do wiring truyền vào —
module translation **không tự biết** `products.edit` là gì:

```go
type Authorizer func(ctx context.Context, id *httpx.Identity, entity string) error
```

Nhờ vậy luật ABAC của cms (tác giả chỉ sửa bài của mình) vẫn do cms quyết định.

**Test bước này:** từ chối trường ngoài khai báo, từ chối locale lạ, `Purge` xoá
đúng bản ghi, cờ tắt thì `Bundle` trả rỗng.

## B3. Nối thực thể đầu tiên: `product`

Làm **một** thực thể cho chạy thật trước khi nhân ra.

Cổng hẹp, khai báo trong `products` chứ không import module dịch:

```go
// internal/modules/products/catalog/ports.go
type Translator interface {
    Bundle(ctx context.Context, entity string, ids []uuid.UUID,
        locales []string) (map[uuid.UUID]map[string]map[string]any, error)
    Purge(ctx context.Context, entity string, id uuid.UUID) error
}
```

`nil` hợp lệ = không có bản dịch. Test của products không phải dựng module dịch.

`transition()` giờ dựng **nhiều** `Doc` thay vì một — vòng lặp theo locale, áp quy
tắc rơi-về-bản-gốc (README §6). Lỗi khi nạp bản dịch **không chặn publish**: ghi
log, publish bản gốc.

`Delete()` gọi `s.tr.Purge` **và** `pubdocs.Purge`, cùng transaction.

**Kiểm chứng giai đoạn B:**

| | mong đợi |
| --- | --- |
| `GET /api/public/products/kho-gon` | bản tiếng Việt |
| `GET /api/public/products/lean-stock?locale=en` | cùng sản phẩm, chữ tiếng Anh |
| `GET /api/public/products/kho-gon?locale=en` | cùng sản phẩm, chữ tiếng Anh (chưa có slug EN) |
| trường dịch để trống | hiện tiếng Việt, không hiện ô trống |
| sửa bản dịch, chưa publish | API công khai **vẫn** trả bản cũ |
| publish lại | API công khai trả bản mới |
| tắt `translation.enabled`, publish lại | chỉ còn dòng `vi`; `?locale=en` bị bỏ qua |
| bật lại, publish lại | bản dịch cũ quay về nguyên vẹn |
| `alternates` | có cả `vi` và `en`, `x_default` ở `vi` |
| tìm kiếm "Lean Stock" | ra sản phẩm đó |

## B4. Console

```
src/console/src/modules/translation/
    services/translation.service.ts
    hooks/useTranslation.ts          useTranslations(entity,id) / useSaveTranslation
    components/LanguageTabs.tsx      [ Tiếng Việt ] [ English 3/6 ]
    components/TranslatedField.tsx   ô nhập + bản gốc bên dưới + nhãn "chưa dịch"
    components/RepublishBanner.tsx
```

State bản dịch **sống ngoài zod form**, đúng khuôn SEO đang dùng ở `ProductEditor`:

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

Màn danh sách: thêm thẻ tổng quan **"Chưa dịch"** (`EXISTS` trên translations).

Màn Cấu hình hệ thống: `translation.enabled` + `translation.locales`, cạnh các cờ
`app.*`.

## B5. Nhân ra 6 thực thể còn lại

Mỗi thực thể chỉ còn ba việc cơ học:

1. thêm dòng vào `declare.go`;
2. nối cổng `Translator` vào service của module đó;
3. gắn `LanguageTabs` vào editor tương ứng.

Thứ tự đề xuất: `product_category` → `article` → `page` → `cms_category` → `tag`
→ `member`. Danh mục sản phẩm trước vì nó gần sản phẩm nhất; `member` cuối vì nó
không có vòng đời publish.

---

## Ước lượng và rủi ro

| Bước | Khối lượng | Rủi ro |
| --- | --- | --- |
| A1 · migration | vừa | **cao** — chạm dữ liệu publish; phải tách 3 file để lui được |
| A2 · pubdocs | nhỏ | thấp, package độc lập |
| A3/A4 · nối publish + đọc | vừa | **cao** — 9 file, là đường công khai đang chạy |
| A5 · tìm kiếm | nhỏ | thấp |
| B1/B2 · module dịch | vừa | thấp, module độc lập |
| B3 · product | nhỏ | vừa |
| B4 · console | lớn | trạng thái editor nhân lên: section × ngôn ngữ × dirty |
| B5 · nhân ra | lớn nhưng cơ học | lặp lại, ít bất ngờ |

**Rủi ro lớn nhất của A** là migration: nó động vào nội dung đã publish của một hệ
thống đang chạy. Bù lại nó không chạm `slug` ở bảng nội dung, nên 95 file kia
không phải đọc lại.

**Rủi ro lớn nhất của B không nằm ở code.** Bật module lên là mỗi nội dung phải
viết hai lần, mãi mãi. Nên `translation.enabled = false` là mặc định, và chỉ bật
khi thật sự có người viết bản tiếng Anh (README §16).
