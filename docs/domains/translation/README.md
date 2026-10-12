# Domain: Dịch nội dung (translation)

Bản dịch của nội dung do người dùng nhập — tên sản phẩm, tiêu đề bài viết, tiểu
sử thành viên. Đọc file này trước khi viết migration hoặc code.

- Hợp đồng HTTP: [docs/apis/translation-api.md](../../apis/translation-api.md)
- Kế hoạch thi công: [implementation.md](implementation.md)
- Nguồn dữ liệu sản phẩm: [docs/domains/products/README.md](../products/README.md)
- Bối cảnh kinh doanh: [OVERVIEW.md](../../../OVERVIEW.md)

---

## 0. Sơ đồ

**Đường đi của bản dịch** — ghi ở đâu, đông cứng lúc nào, khách đọc ra sao, và
chuyện gì xảy ra khi tắt module:

![Luồng dịch nội dung](../../diagrams/translation-flow.svg)

---

## 1. Phạm vi

**Trong phạm vi:** bản dịch của dữ liệu nằm trong database và do người dùng nhập.

**Ngoài phạm vi:** chữ nằm trong mã nguồn — nhãn nút, tiêu đề cột, thông báo lỗi.
Những thứ đó là i18next, sống ở `src/console/src/locales/*.json`, và không đi qua
module này. Hai bài toán trùng tên nhưng khác hẳn nhau: một bên lập trình viên
viết lúc code, một bên biên tập viên viết lúc vận hành.

Tiếng Việt là **ngôn ngữ gốc**. Nó luôn nằm ở cột gốc của bảng gốc và luôn bắt
buộc. Module này chỉ giữ phần thêm vào.

## 2. Vì sao là một bounded context riêng

Vì các module khác **không được đổi schema**.

Nếu nhét `name_en`, `summary_en` vào `products`, hoặc dựng `product_translations`
riêng, thì module `products` và module `translation` cùng sở hữu schema về
product. Tắt tính năng đi vẫn còn cột thừa hoặc bảng treo, và mỗi thực thể dịch
được lại thêm một migration.

Với một bảng tham chiếu dùng chung, `products` / `cms` / `members` không biết gì
về chuyện dịch. Chúng chỉ nhận một cổng hẹp (§5) và gọi khi dựng dữ liệu công
khai. Tắt module → cổng trả rỗng → mọi thứ chạy như chưa từng có bản dịch.

## 3. Bảng

```sql
CREATE TABLE translations (
    entity     TEXT        NOT NULL,
    entity_id  UUID        NOT NULL,
    locale     TEXT        NOT NULL,
    values     JSONB       NOT NULL DEFAULT '{}',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (entity, entity_id, locale)
);

CREATE INDEX idx_translations_lookup ON translations (entity, locale);
```

**Một dòng cho mỗi bản ghi × mỗi ngôn ngữ**, không phải mỗi trường một dòng.

Một sản phẩm có khoảng tám trường dịch được. Kiểu field-per-row sẽ thành tám dòng,
và đọc một sản phẩm phải gom tám dòng rồi pivot; đọc một trang danh sách 20 sản
phẩm thành 160 dòng. Một dòng JSONB đọc một phát, và `values` vẫn truy vấn được
bằng toán tử JSONB khi cần.

`entity` là động nên **không có khoá ngoại** — xem §9 về dọn rác.

## 4. Thực thể và trường dịch được

Khai báo tập trung trong module. Thêm một thực thể là thêm một dòng vào bảng khai
báo trong code, **không cần migration**.

| entity             | trường dịch được                            |
| ------------------ | ------------------------------------------- |
| `product`          | `slug`, `name`, `summary`, `body_html`, `highlights`, `seo` |
| `product_category` | `slug`, `name`, `description`, `seo`        |
| `member`           | `role`, `bio`                               |
| `article`          | `slug`, `title`, `excerpt`, `body_html`, `seo` |
| `page`             | `slug`, `title`, `seo`                      |
| `cms_category`     | `slug`, `name`, `description`, `seo`        |
| `tag`              | `slug`, `name`                              |

Ghi vào một trường không có trong khai báo sẽ bị từ chối với `422`. Danh sách này
là **hợp đồng, không phải gợi ý**: nó chặn việc một bản dịch lặng lẽ ghi đè lên
trường mà không ai định cho dịch — `status`, `sort_order`, giá, ngày.

### Trường nào KHÔNG dịch, và vì sao

- `status`, `lifecycle`, `sort_order`, ngày tháng — không phải chữ, là trạng thái.
- Quan hệ (chuyên mục, thẻ, thành viên) — dịch ở chính bản ghi được trỏ tới, chứ
  không dịch lại ở nơi trỏ.
- `id`, `created_at` — khoá và dấu thời gian.

`slug` **có** dịch được. Xem §4b — nó là trường đặc biệt nhất của module này.

## 4b. Slug — trường đặc biệt nhất

Slug dịch được, nhưng **lý do thường bị hiểu sai**, nên viết rõ ở đây.

### Google nói gì

Nguồn: [Managing Multi-Regional and Multilingual Sites](https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites)
và [Localized Versions of your Pages](https://developers.google.com/search/docs/specialty/international/localized-versions).

| Điều | Google nói |
| --- | --- |
| URL có quyết định ngôn ngữ của trang không? | **Không.** *"We don't use any code-level language information such as lang attributes, or the URL."* |
| Dùng từ bản địa trong URL được không? | Được. *"It's fine to use localized words in the URL."* Mã hoá UTF-8. |
| Mỗi bản ngôn ngữ có cần URL riêng không? | **Có.** `hreflang` trỏ tới từng `href` cụ thể; mỗi bản phải có URL của riêng nó. |
| Dùng query param để chọn ngôn ngữ? | **Không khuyến nghị** — `site.com?loc=de` bị đánh dấu *"Not recommended"*. |

Nghĩa là: **dịch slug KHÔNG giúp Google nhận ra ngôn ngữ**. Việc đó do `hreflang`,
`<html lang>` và chính nội dung làm.

### Vậy vì sao vẫn dịch

Vì **người đọc**, và lợi ích SEO đến gián tiếp qua họ:

- URL hiện nguyên văn trong kết quả tìm kiếm. `/en/products/lean-stock` đọc được
  với khách Anh; `/en/products/kho-gon` thì không.
- Link được copy-paste, nhắn qua chat, đọc to trong cuộc họp.
- Từ khoá trong URL là tín hiệu yếu nhưng khác không, và nó nằm trong snippet.

Đây là lý do đủ mạnh. Nhưng nó là lý do **trải nghiệm**, không phải *"Google bắt
buộc"* — và phân biệt được hai thứ đó mới quyết định đúng phần tiếp theo.

### Ràng buộc: duy nhất theo từng ngôn ngữ

Payload CMS đã chốt đúng luật này và nó hợp lý: slug chỉ cần **duy nhất trong
phạm vi một ngôn ngữ**. Hai bản ghi khác nhau không được trùng slug tiếng Anh;
nhưng một bản ghi được phép có slug tiếng Việt trùng slug tiếng Anh của chính nó.

```sql
CREATE UNIQUE INDEX idx_translations_slug
    ON translations (entity, locale, (values ->> 'slug'))
    WHERE values ->> 'slug' IS NOT NULL AND values ->> 'slug' <> '';
```

Slug tiếng Việt vẫn nằm ở cột gốc với `UNIQUE` sẵn có. Không có va chạm giữa hai
ngôn ngữ vì tiền tố đường dẫn đã tách chúng ra: `/products/kho-gon` và
`/en/products/lean-stock`.

### Chưa dịch slug thì URL tiếng Anh là gì

**Vẫn tồn tại, dùng slug gốc:** `/en/products/kho-gon`.

Không được để trang tiếng Anh biến mất chỉ vì thiếu slug — nội dung đã có quy tắc
rơi về bản gốc (§6), và `hreflang` cần hai bản trỏ về nhau mới có hiệu lực. Một
URL xấu vẫn tốt hơn một URL 404.

### Khối `alternates` cho hreflang

`hreflang` chỉ có tác dụng khi **mọi bản trỏ lẫn nhau và tự trỏ vào mình**; thiếu
một chiều là Google bỏ qua cả cặp. Để site không phải tự suy ra, API công khai trả
sẵn danh sách:

```json
"alternates": [
  { "locale": "vi", "path": "/products/kho-gon",        "x_default": true },
  { "locale": "en", "path": "/en/products/lean-stock",  "x_default": false }
]
```

`x-default` trỏ về tiếng Việt — ngôn ngữ gốc, và là bản luôn tồn tại.

Dựng khối này ở backend chứ không ở site, vì chỉ backend biết đủ slug của mọi
ngôn ngữ cho một bản ghi. Để site tự ghép sẽ cần thêm một vòng gọi API.

### Hệ quả bắt buộc: lịch sử slug

**Hiện tại codebase KHÔNG có cơ chế nào cho việc đổi slug.** Không bảng lịch sử,
không chuyển hướng 301. Đổi slug một sản phẩm hôm nay là âm thầm làm hỏng mọi
link đã phát ra và vứt đi thứ hạng mà URL đó đã kiếm được.

Dịch slug **nhân đôi số URL có thể hỏng theo cách đó**. Nên lịch sử slug chuyển từ
"nên có" thành **bắt buộc**:

```sql
CREATE TABLE slug_history (
    entity      TEXT        NOT NULL,
    locale      TEXT        NOT NULL,
    slug        TEXT        NOT NULL,
    entity_id   UUID        NOT NULL,
    replaced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (entity, locale, slug)
);
```

Slug cũ → `301` tới slug hiện tại.

**Đây không phải tính năng của module translation.** Nó là lỗ hổng có sẵn, áp cho
cả slug tiếng Việt hôm nay, không liên quan gì tới dịch. Module translation chỉ
làm nó trở nên cấp bách. Vì vậy nó phải là **một hạng mục riêng, làm trước hoặc
cùng lúc** — không phải một mục con lặng lẽ nằm trong module dịch.

## 5. Cổng cho module khác

Module khác **không import** package này. Chúng khai báo một interface hẹp của
riêng mình và nhận cài đặt lúc wiring — đúng khuôn `ai.Deps` đang dùng.

```go
// Trong products:
type Translator interface {
    // Bundle nạp bản dịch cho nhiều bản ghi một lượt, cho màn danh sách.
    Bundle(ctx context.Context, entity string, ids []uuid.UUID,
        locales []string) (map[uuid.UUID]map[string]map[string]any, error)
}
```

`nil` là hợp lệ và có nghĩa "không có bản dịch". Nhờ vậy test của products không
cần dựng cả module translation, và tắt tính năng chỉ là truyền `nil`.

**Nạp theo lô, không nạp từng dòng.** Một màn danh sách 20 sản phẩm phải là một
truy vấn `WHERE entity = $1 AND entity_id = ANY($2)`, không phải 20 truy vấn.

## 6. Quy tắc rơi về bản gốc

Một trường dịch **thiếu, rỗng, hoặc chỉ có khoảng trắng** → dùng giá trị gốc
tiếng Việt. Không bao giờ hiển thị ô trống cho khách.

```
i18n.en.name = "Lean Stock"  → hiện "Lean Stock"
i18n.en.name = ""            → hiện "Kho Gọn"
i18n.en không tồn tại        → hiện "Kho Gọn"
```

Nhờ quy tắc này bản dịch làm dần được: dịch tên sản phẩm trước, mô tả để sau, mà
trang vẫn đọc được suốt quá trình đó. Console nên hiển thị **tỉ lệ đã dịch** để
người làm biết còn thiếu gì (§10).

## 7. Quan hệ với `published_snapshot` — chỗ va chạm thật

Sản phẩm và bài viết đã publish được API công khai đọc từ `published_snapshot`,
một bản sao JSON **đông cứng tại thời điểm bấm Publish**. Nhờ nó mà trang danh
sách và trang chi tiết không bao giờ nói hai điều khác nhau.

**Quyết định: bản dịch được gộp vào snapshot lúc publish.**

```
Sửa bản dịch → Lưu         → website VẪN hiển thị bản cũ
             → bấm Publish  → snapshot mang bản dịch mới → website cập nhật
```

Snapshot khi đó có thêm một khối:

```json
{
  "name": "Kho Gọn",
  "summary": "Quản lý tồn kho cho quán ăn nhiều chi nhánh.",
  "i18n": {
    "en": { "name": "Lean Stock", "summary": "Inventory for multi-branch shops." }
  }
}
```

Đánh đổi đã cân nhắc:

- Đọc công khai vẫn **một truy vấn**, không join thêm gì.
- Bản dịch viết dở **không lọt ra ngoài** — đúng lời hứa "bản công khai là bản đã
  duyệt" mà snapshot sinh ra để giữ.
- Giá phải trả: **sửa bản dịch xong phải publish lại**. Màn hình dịch phải nói
  thẳng điều này ra; nếu không người dùng sẽ tưởng hệ thống hỏng.

Thực thể **không có snapshot** (member, tag, cms_category) thì đọc bản dịch trực
tiếp qua cổng ở §5 — không có độ trễ publish, vì cũng không có publish.

## 8. Chọn ngôn ngữ ở API công khai

**Dùng query param `?locale=en`, không dùng header `Accept-Language`.**

Lưu ý phân biệt: đây là **API**, không phải URL công khai của website. Google đánh
dấu `site.com?loc=de` là *"Not recommended"* cho URL trang; website dùng tiền tố
`/en/…` (§4b). API thì query param là đúng chỗ — nó không được index.

API công khai đang đặt `Cache-Control: public, max-age=60`. Một cache dùng chung
(CDN, proxy) khoá theo URL. Nếu ngôn ngữ đến từ header mà URL không đổi, cache sẽ
trả tiếng Anh cho người đọc tiếng Việt. Query param làm URL khác nhau → khoá cache
khác nhau → an toàn.

ETag hiện tính từ chính body (`sha256` của JSON đã marshal), nên nó tự đổi theo
ngôn ngữ; không cần làm gì thêm ở đó.

Nếu sau này vẫn muốn hỗ trợ `Accept-Language`, bắt buộc thêm
`Vary: Accept-Language` — nếu không sẽ dính đúng lỗi vừa mô tả.

`locale` không hợp lệ hoặc không có trong `translation.locales` → phục vụ bản gốc,
không báo lỗi. Khách gõ sai tham số không đáng nhận một trang lỗi.

## 9. Dọn rác

Không có khoá ngoại nên xoá một sản phẩm sẽ để lại dòng dịch mồ côi. Hai lớp:

1. **Đường chính** — mỗi module gọi `Purge(ctx, entity, id)` trong luồng xoá của
   mình, cùng transaction nếu được.
2. **Lưới an toàn** — một truy vấn đối soát chạy tay, cho trường hợp (1) bị sót
   hoặc dữ liệu bị xoá thẳng dưới DB.

Mồ côi **không gây lỗi hiển thị** (resolver chỉ tra theo id còn sống), chỉ tốn
chỗ. Đây là cái giá đã biết của việc chọn một bảng dùng chung thay vì khoá ngoại.

## 10. Console

Form soạn thảo có **tab ngôn ngữ**, hiện khi `translation.enabled` bật và
`translation.locales` không rỗng.

```
┌─────────────────────────────────────────┐
│  Tiếng Việt  │  English 3/5             │   ← tỉ lệ đã dịch
├─────────────────────────────────────────┤
│  Tên sản phẩm                           │
│  ┌───────────────────────────────────┐  │
│  │ Lean Stock                        │  │
│  └───────────────────────────────────┘  │
│  Bản gốc: Kho Gọn                       │   ← luôn hiện để đối chiếu
└─────────────────────────────────────────┘
```

Ba nguyên tắc:

- **Tab ngôn ngữ khác chỉ hiện trường dịch được** — gồm cả `slug` (§4b). Hiện
  `status`, ảnh bìa, chuyên mục sẽ ngụ ý chúng dịch được — chúng không.
- **Luôn hiện bản gốc bên cạnh ô nhập.** Người dịch cần nhìn thấy thứ mình đang
  dịch; bắt họ nhớ hoặc mở tab khác là thiết kế tồi.
- **Nói rõ cần publish lại** khi bản ghi đã publish và bản dịch vừa đổi — xem §7.

Màn danh sách **không đổi**: vẫn hiển thị và tìm kiếm trên bản gốc tiếng Việt
(§12).

## 11. Quyền

**Dùng lại quyền của module sở hữu**, không tạo quyền riêng.

Sửa bản dịch của một sản phẩm cần `products.edit`. Sửa bản dịch của một bài viết
cần `cms.article.edit` — kèm nguyên tắc ABAC của chính module đó (tác giả chỉ sửa
bài của mình).

Một quyền `translation.manage` riêng sẽ cho phép người ta sửa chữ của nội dung mà
họ không được phép chạm vào — một đường vòng quanh phân quyền hiện có. Bản dịch là
nội dung, không phải một loại tài nguyên khác.

Ngoại lệ duy nhất: `translation.enabled` và `translation.locales` là cấu hình hệ
thống, gác bởi `settings.manage` như mọi setting khác.

## 12. Bật/tắt

`translation.enabled` (bool, mặc định `false`) — cùng khuôn với `ai.enabled`: tắt
là tính năng im lặng rút lui, không lỗi, không mất dữ liệu.

Khi tắt:

- Cổng ở §5 trả rỗng. API công khai không có khối `i18n`.
- Console ẩn tab ngôn ngữ.
- Publish không gộp bản dịch vào snapshot.
- **Dữ liệu dịch giữ nguyên trong bảng.** Bật lại là có ngay.

Tắt module **không bao giờ được xoá thứ người ta đã viết**.

`translation.locales` (mảng, mặc định `["en"]`) — các ngôn ngữ ngoài tiếng Việt.
Thêm ngôn ngữ là sửa setting, không phải migration. Bỏ một ngôn ngữ khỏi danh
sách chỉ ẩn nó đi, dữ liệu vẫn còn.

## 13. Những gì module này KHÔNG làm

- **Không dịch máy.** Người viết bản dịch, hệ thống chỉ lưu. Dịch tự động là một
  tính năng khác, cần quyết định riêng về chi phí và chất lượng.
- **Không dịch giao diện.** Đó là i18next (§1).
- **Không lọc/tìm kiếm theo trường đã dịch.** Console tìm trên bản gốc tiếng
  Việt. Tìm theo bản dịch cần index riêng trên JSONB; để khi nào thật sự cần.
- **Không có quy trình duyệt riêng cho bản dịch.** Bản dịch đi theo vòng đời
  publish của bản ghi gốc.

## 14. Thứ tự triển khai

0. **Lịch sử slug + chuyển hướng 301** — hạng mục riêng, áp cho slug tiếng Việt
   hôm nay. Phải xong trước hoặc cùng lúc, nếu không dịch slug sẽ nhân đôi số URL
   âm thầm hỏng (§4b).
1. **Migration + module backend** — bảng, service, cổng, `Purge`, settings. Test
   đơn vị cho fallback và cho việc từ chối trường không khai báo.
2. **Nối một thực thể: `product`** — cổng vào `products`, gộp vào snapshot lúc
   publish, overlay ở API công khai theo `?locale`. Kiểm chứng thật đầu-cuối.
3. **Tab ngôn ngữ trong console** cho ProductEditor.
4. **Nhân ra các thực thể còn lại** — mỗi cái chỉ là khai báo + nối cổng + tab.

Bước 2 là bước đáng sợ nhất vì nó chạm `published_snapshot`. Làm một thực thể cho
chạy thật rồi mới nhân ra, để nếu kiến trúc sai thì sửa khi còn rẻ.

Chi tiết từng file và từng điểm nối: [implementation.md](implementation.md).

## 15. Quyết định đã chốt

| Câu hỏi | Chốt | Vì sao |
| --- | --- | --- |
| Một bảng chung hay bảng riêng từng thực thể? | **Một bảng chung** | Module khác không đổi schema; tắt được sạch |
| Mỗi trường một dòng hay một dòng JSONB? | **Một dòng JSONB** | Đọc một phát thay vì gom-và-pivot |
| Bản dịch lên web lúc nào? | **Lúc publish** | Giữ lời hứa của snapshot; đọc vẫn một truy vấn |
| Chọn ngôn ngữ bằng gì? | **`?locale=`** | `Cache-Control: public` sẽ trả sai ngôn ngữ nếu dùng header |
| Quyền riêng cho dịch? | **Không** | Dùng quyền của module sở hữu, tránh đường vòng phân quyền |
| Phạm vi đợt này? | **Toàn bộ nội dung** | 7 thực thể ở §4 |
| Tiếng Việt lưu ở đâu? | **Cột gốc, bảng gốc** | Ngôn ngữ gốc luôn bắt buộc, không phải một bản dịch |
| Dịch slug? | **Có** | Vì người đọc và CTR, không phải vì Google cần — Google không dùng URL để đoán ngôn ngữ (§4b) |
| Slug duy nhất theo gì? | **Theo từng ngôn ngữ** | Cùng luật Payload CMS dùng; tiền tố `/en` đã tách hai không gian |
| Thiếu slug dịch thì sao? | **Dùng slug gốc** | `/en/products/kho-gon` xấu nhưng sống; hreflang cần hai chiều |
| Ai dựng `hreflang`? | **Backend, qua `alternates`** | Chỉ backend biết đủ slug mọi ngôn ngữ của một bản ghi |

## 16. Câu còn mở

- **Ai viết bản tiếng Anh?** Đây là việc biên tập, không phải việc code. Hệ thống
  chỉ cung cấp chỗ nhập.
- **Có cần lịch sử sửa bản dịch không?** Hiện không có. Nếu cần thì đi theo khuôn
  revision của bài viết, không tự nghĩ cách mới.
- **Site đọc bản dịch thế nào?** Site hiện **chưa đọc API** chút nào — nội dung
  là file tĩnh. Nối site vào API là một hạng mục riêng, chưa làm, và phải xong
  trước thì bản dịch mới có chỗ hiển thị.
- **Đổi slug đã publish có nên cảnh báo không?** Lịch sử slug giữ link cũ sống,
  nhưng đổi slug vẫn làm reset tín hiệu của URL. Console nên hỏi lại một lần.
- **Dọn rác tự động?** Hiện là truy vấn chạy tay (§9). Dựng job định kỳ khi số
  lượng đủ lớn để đáng.
