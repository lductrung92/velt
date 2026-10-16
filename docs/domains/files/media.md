# Gói phục vụ tệp & ảnh

Thiết kế cho một gói riêng chịu trách nhiệm **đọc** tệp ra ngoài internet:
`/files/{slug}.{ext}` cho tệp, một URL khác cho ảnh, kèm nén/đổi cỡ ảnh và
cache. Phần **ghi** (upload, kiểm magic byte, hạn ngạch) vẫn ở module sở hữu
tệp — gói này không nhận upload.

Trạng thái: **đã cài đặt ở backend** (`internal/platform/media`). Mọi mục dưới
đây có nhãn **[ĐANG CHẠY]** là code có thật, đã có test; nhãn **[CHƯA]** là phần
còn lại — gần như toàn bộ nằm ở front-end (§8). Tài liệu này không còn là bản vẽ:
chỗ nào bản cài đặt làm khác thiết kế ban đầu thì đã sửa lại theo bản cài đặt, và
nói rõ vì sao.

---

## 0. Hiện trạng đo được (trước khi làm)

| Thứ | Hiện tại |
| --- | --- |
| URL | `/api/files/<entity>/<uuid>/<purpose>-<rand>.<ext>` |
| Người phục vụ | `internal/modules/files/files.go`, 70 dòng |
| Phân quyền | allowlist theo tiền tố đường dẫn (`users/`, `cms/`…) |
| Cache | `Cache-Control: public, max-age=3600`, **không ETag**, không 304 |
| Biến thể ảnh | **không có** — trả đúng tệp gốc |
| Siêu dữ liệu | **không lưu** kích thước ảnh ở đâu cả |
| Lưu trữ | `storage.Storage` (Local trên đĩa; S3 là chỗ cắm sẵn, chưa có) |
| Build | **`CGO_ENABLED=0`** |
| Tài liệu | `storage.go` trỏ tới `docs/domains/files/overview.md` — **file không tồn tại** |

Ba hệ quả đáng chú ý:

1. **URL lộ cấu trúc lưu trữ.** `uuid` của chủ sở hữu nằm ngay trên URL, và đổi
   cách sắp xếp thư mục là gãy mọi link đã phát ra.
2. **Cache 1 giờ, không ETag.** Mỗi giờ mọi ảnh tải lại toàn bộ. Lighthouse chấm
   mục "Efficient cache policy" trượt.
3. **Không có kích thước thật của ảnh** nên front-end không thể đặt `width`/
   `height` — đây là nguyên nhân CLS, một trong ba chỉ số Core Web Vitals.

---

## 1. Điểm 100 thực ra đòi những gì

Không phải mình nén ảnh là đủ. Các mục Lighthouse liên quan đến ảnh:

| Mục chấm | Ai giải quyết |
| --- | --- |
| Serve images in next-gen formats | **gói này** — trả WebP/AVIF |
| Properly size images | **gói này + front-end** — nhiều cỡ + `srcset`/`sizes` |
| Efficient cache policy | **gói này** — `immutable`, ETag, 304 |
| Avoid enormous network payloads | **gói này** — chất lượng nén |
| CLS: image elements have explicit width and height | **front-end**, cần siêu dữ liệu từ gói này |
| LCP: ảnh lớn nhất không `loading=lazy`, có `fetchpriority=high` | **front-end** |

Nói thẳng: **một mình backend không bao giờ đạt 100**. Gói này phải phát ra đủ
dữ liệu để site dựng được `srcset` + `width`/`height`, và site phải dùng nó.
Phần việc front-end là một nửa công việc, không phải phụ lục.

---

## 2. Hình dạng URL

```
Tệp (bản gốc, mọi loại):     https://<host>/files/{slug}.{ext}
Ảnh (có đổi cỡ/đổi định dạng): https://<img-host>/img/{slug}/{w}.{ext}
Ảnh (để trình duyệt tự chọn):  https://<img-host>/img/{slug}.{ext}
```

- `{slug}`: `ten-doc-duoc-{8 hex}`, ví dụ `so-do-kien-truc-9f3c21aa`. Đọc được,
  đoán không ra, không lộ cấu trúc thư mục, và **không đổi khi dời kho lưu trữ**.
- `{w}`: **chỉ trong tập cố định** `320 · 640 · 960 · 1280 · 1920`. Đây là
  phòng thủ DoS chính: không có `?w=` tuỳ ý thì không ai bơm được hàng triệu
  biến thể vào cache. imgproxy giải bài này bằng ký URL; tập cố định đơn giản
  hơn và không cần khoá bí mật.
- `{ext}`: `webp` · `jpg` · `png` (và `avif` nếu chọn phương án B ở §5).
- Dạng **không có `{w}`** dùng cho ảnh chèn trong thân bài viết — ở đó trình
  soạn thảo chỉ viết được `<img src>` trơn, không viết được `<picture>`. URL này
  thương lượng theo `Accept` và trả kèm `Vary: Accept`.

**[ĐANG CHẠY] Quyết định: URL thương lượng bị chặn trên ở 1920.** Thiết kế ban
đầu để nó trả **đúng cỡ gốc**; như vậy một ảnh 4000px dán vào thân bài sẽ gửi
nguyên 4000px xuống điện thoại — và đó đúng là chỗ duy nhất biên tập viên không
tự chọn cỡ được. Nên nó đổi cỡ xuống `max(AllowedWidths)` = **1920**. Ảnh nhỏ
hơn 1920 **không** bị phóng to (`resizeToWidth` không bao giờ upscale) và vẫn đi
qua đúng biến thể `-full` như trước, nên không ảnh nào phải mã hoá hai lần.
ETag của URL này mang cả bề rộng đã phục vụ (`"<sha>-1920-webp"` thay vì
`"<sha>-0-webp"`), nên một cache đang giữ bản chưa chặn sẽ miss đúng lúc nội dung
đổi. Header giữ nguyên: `max-age=604800`, `Vary: Accept`, **không** `immutable`.

### Vì sao ảnh ở host khác

| Lý do | Giải thích |
| --- | --- |
| Không cookie | Ảnh ở cùng origin với cookie refresh thì mỗi request ảnh đều mang cookie đi. Host riêng cắt sạch. |
| Chính sách cache khác hẳn | Tệp gốc `immutable` 1 năm; HTML thì vài phút. Tách host là tách luôn cấu hình CDN. |
| Đổi sang CDN sau không gãy link | Chỉ trỏ lại DNS của `img-host`. |

Không phải để "domain sharding" — HTTP/2 đã làm kỹ thuật đó thành phản tác dụng.

---

## 3. Bảng `files`: cái giá của slug phẳng

URL phẳng `{slug}.{ext}` buộc phải có chỗ tra ngược slug → khoá lưu trữ. Đây là
thay đổi lớn nhất của thiết kế này.

```sql
CREATE TABLE files (
  id           uuid PRIMARY KEY,
  slug         text UNIQUE NOT NULL,     -- khoá công khai
  storage_key  text NOT NULL,            -- <entity>/<uuid>/<purpose>-<rand>.<ext>
  mime         text NOT NULL,
  size_bytes   bigint NOT NULL,
  sha256       text NOT NULL,            -- ETag + khoá cache biến thể
  width        int,                      -- NULL nếu không phải ảnh
  height       int,
  owner_kind   text NOT NULL,            -- 'article' | 'user' | 'landing' | …
  owner_id     uuid,
  created_at   timestamptz NOT NULL DEFAULT now()
);
```

Được thêm ba thứ mà hôm nay không có:

- **`width`/`height`** → front-end đặt được thuộc tính, hết CLS.
- **`sha256`** → ETag thật và khoá cache biến thể ổn định.
- **một chỗ để xoá** → xoá tệp nay có một nơi để dọn danh tính và cache biến thể
  của nó (§4b). Lưu ý: điều này **không** làm `gcInlineMedia` hết phải đọc
  `body_html` — bảng nói mỗi tệp tên gì, không nói bài nào đang dùng nó; xem §4b.

**[ĐANG CHẠY]** Bảng có thật ở `migrations/0045_files.sql`. Khác thiết kế một
chỗ: `storage_key` là **UNIQUE** — một đối tượng đã lưu chỉ có một danh tính
công khai, nên mint lại cùng một khoá là no-op chứ không sinh slug thứ hai mà
sau này không ai xoá.

**Di trú**: URL `/api/files/...` cũ **phải tiếp tục sống** — chúng nằm trong
`body_html` của bài đã xuất bản. Kế hoạch: route cũ giữ nguyên, upload mới sinh
slug, và một lệnh backfill tạo hàng `files` cho tệp cũ. Không viết lại nội dung
đã lưu. **[ĐANG CHẠY]**: route cũ còn nguyên, `cmd/backfill-files` đã có,
`media.MintOr` sinh slug ở mọi đường upload và rơi về URL cũ khi mint hỏng.

### 3b. Đọc ra: cột cũ → URL mới **[ĐANG CHẠY]**

Backfill một mình không làm site thấy URL mới. Các cột đã lưu (`featured_path`,
`cover_path`, đường dẫn avatar, ảnh gallery…) vẫn giữ **khoá lưu trữ**, và các
API công khai vẫn dựng `/api/files/<key>` từ đó. Phải có một chỗ tra bảng `files`
**ở thời điểm đọc** rồi trả URL mới — đó là `internal/platform/media/public.go`.

Ba ràng buộc định hình nó:

1. **Thêm trường, không đổi kiểu.** `cover_url` vẫn là chuỗi, chỉ đổi *giá trị*
   sang `/img/{slug}.{ext}`; `cover_width`/`cover_height` là **anh em mới** bên
   cạnh. Không đổi tên, không bỏ trường nào — console và site đều đang đọc.
   Các trường mới dùng `omitempty`.
2. **Không có hàng `files` → giữ nguyên y như hôm nay**, và không gửi kích
   thước. Ảnh chưa backfill hoặc ảnh ở host ngoài không được 500, không được
   trắng. Hợp đồng là: *vắng mặt trong map = đừng đụng vào*.
3. **Tra theo lô.** `PublicURLs.Resolve` nhận cả danh sách giá trị của một phản
   hồi và trả về một map trong **một** truy vấn (`storage_key = ANY($1)`). Danh
   sách 20 sản phẩm là 1 query, không phải 20.

Một phản hồi có thể mang **khoá lưu trữ trần** (`cover_path`) hoặc **URL đã
dựng** (`/api/files/…`, trong snapshot đã đóng băng của sản phẩm — ở đó khoá gốc
đã bị bỏ đi). Nên `Resolve` nhận cả hai: nó hỏi chính bộ dựng URL cũ xem nó đặt
tiền tố gì trước một khoá (`/api/files/` với driver local, endpoint bucket với
S3) rồi cắt ngược. Không hard-code tiền tố ở đâu cả.

Những phản hồi công khai đã đổi, và tên trường mới:

| Phản hồi | Trường URL (giữ tên, đổi giá trị) | Trường mới |
| --- | --- | --- |
| `GET /api/public/cms/articles` → mỗi card | `cover_url` | `cover_width`, `cover_height` |
| `GET /api/public/cms/articles/{slug}` | `cover_url` | `cover_width`, `cover_height` |
| `GET /api/public/products` → mỗi item | `cover_url` | `cover_width`, `cover_height` |
| `GET /api/public/products/{slug}` | `cover_url` | `cover_width`, `cover_height` |
| … `seo` của nó | `og_image_url` | `og_image_width`, `og_image_height` |
| … `gallery[]` của nó | `url` | `width`, `height` |
| … `members[]` của nó | `avatar_url` | `avatar_width`, `avatar_height` |
| `GET /api/public/members`, `/{slug}` | `avatar_url` | `avatar_width`, `avatar_height` |
| widget `product_grid` → `items[]` | `cover_url` | `cover_width`, `cover_height` |
| widget `team` → `items[]` | `avatar_url` | `avatar_width`, `avatar_height` |
| section landing (mọi loại) | `<X>_url` | `<X>_width`, `<X>_height` |

**`width`/`height` là kích thước GỐC, không phải cỡ sẽ được phục vụ.** Một ảnh
2400×1350 trả về `cover_width: 2400`, trong khi `/img/{slug}.{ext}` chặn ở 1920.
Đó là chủ ý: hai số này dùng để **giữ chỗ theo tỉ lệ** (`aspect-ratio`) chứ không
phải để đặt bề rộng tuyệt đối. Site đặt chúng vào `<img width height>` kèm CSS
`width:100%; height:auto` như thường lệ; đừng dùng chúng làm cỡ bố cục.

Hai lưu ý:

- Widget `product_grid` và `team` xuất hiện trong **cả** landing section, inline
  widget của trang, lẫn chrome của `GET /api/public/cms/regions` — chúng lấy dữ
  liệu qua đúng service công khai ở trên, nên chỉ cần sửa một chỗ.
- Section landing được bơm `<X>_url` theo quy ước hậu tố `_path`, nên
  `<X>_width`/`<X>_height` cũng theo đúng quy ước đó, không liệt kê theo từng
  loại section. Đường console (`GET /api/cms/landing/.../sections`) **không**
  đổi: nó vẫn nhận `<X>_url` kiểu cũ.
- `GET /api/public/cms/pages/{slug}` trả `og_path` — là **khoá lưu trữ**, không
  phải URL, và site tự dựng URL từ nó. Không đổi gì ở đây (không đổi tên, không
  bỏ trường); nếu site cần `og_url` + kích thước thì đó là một trường mới, một
  việc riêng.

---

## 4. Cache

| Loại URL | Header |
| --- | --- |
| `/files/{slug}.{ext}` | `public, max-age=31536000, immutable` + `ETag` |
| `/img/{slug}/{w}.{ext}` | `public, max-age=31536000, immutable` + `ETag` |
| `/img/{slug}.{ext}` (thương lượng) | `public, max-age=604800` + `ETag` + `Vary: Accept` |

`immutable` an toàn vì bộ ba (slug, w, ext) không bao giờ đổi nội dung: thay ảnh
là sinh slug mới. URL thương lượng **không** được `immutable` vì cùng một URL trả
bytes khác nhau tuỳ trình duyệt.

Chuẩn hoá `Accept` thành ba nhóm (`avif` / `webp` / `jpeg`) trước khi dùng làm
khoá cache — lấy nguyên chuỗi `Accept` làm khoá thì một ảnh vỡ thành hàng chục
mục cache và tỉ lệ hit rơi.

Biến thể nằm trên đĩa tại `<cache-root>/<sha256[0:2]>/<sha256>-{w}.{ext}`, sinh
một lần rồi dùng lại (`{w}` là `full` khi không đổi cỡ). Xoá tệp gốc thì xoá cả
nhánh đó.

**[ĐANG CHẠY]** Toàn bộ bảng trên đúng như cài đặt. Ba điểm bản cài đặt nói thêm:

- ETag **gọi tên bản dựng**, không gọi tên tệp gốc: `"<sha>-<w>-<ext>"`. Cùng
  một ảnh trả `/640.webp` và `/640.jpg` khác bytes, ETag chung sẽ cho cache phục
  vụ cái này thay cái kia.
- Bề rộng ngoài tập cố định là **404, không phải clamp**. Clamp sẽ trả bytes
  dưới một URL hứa cỡ khác, rồi `immutable` giữ lời nói dối đó một năm.
- Header `X-Media-Cache: hit|miss` cho biết phản hồi này có tốn một lần mã hoá
  không — cách duy nhất nhìn thấy điều đó từ ngoài tiến trình.

### 4b. Xoá: ba thứ phải biến mất, không phải một **[ĐANG CHẠY]**

Mỗi tài sản tồn tại ở ba nơi: **đối tượng trong storage**, **hàng `files`** cho
nó danh tính công khai, và **các biến thể đã dựng** dưới cache root. Trước đây
chỉ nơi thứ nhất được xoá. Hàng còn sót để một slug trỏ vào khoá lưu trữ rỗng;
biến thể còn sót là bản sao của một ảnh đã xoá mà `/img` vẫn vui vẻ phục vụ —
cache đánh khoá theo sha256, mà sha256 của tệp đã xoá thì không bao giờ đổi.

Việc xoá thuộc **đường xoá của module sở hữu** (nó mới biết nó đang xoá cái gì và
vì sao). Gói `media` chỉ đưa ra khả năng và không bao giờ với ngược vào module:

```go
media.Forgetter: Forget(ctx, key) · ForgetPrefix(ctx, prefix)
```

`Forget` xoá hàng theo `storage_key` rồi quét sạch nhánh
`<cache-root>/<sha[0:2]>/<sha>-*`. `ForgetPrefix` làm đúng thế cho cả một thư mục
media (xoá một bài viết, một sản phẩm, một landing). Hai tài sản trùng bytes thì
trùng sha và dùng chung nhánh cache — xoá cái này có thể dọn bản dựng của cái
kia; vô hại, vì tệp gốc còn đó và lần yêu cầu sau dựng lại. Cache là thứ duy
nhất chỉ sai bằng cách chậm.

Đã nối vào: `cms/shared.DeleteOldMedia` · `cms/shared.PurgeMediaTree` ·
`products/shared` (hai hàm cùng tên) · `landing.gcDroppedMedia` ·
`members.deleteFile` · `account` (thay/xoá avatar) · `catalog.DeleteGalleryItem`
· `articles.gcInlineMedia`.

**`gcInlineMedia` vẫn phải đọc `body_html`, và sẽ còn phải đọc.** Bảng `files`
nói mỗi đối tượng **tên công khai là gì**; nó không nói **bài nào đang tham
chiếu nó**, và không có bảng nào nói điều đó. Nên "còn sống hay không" chỉ quyết
được bằng cách nhìn vào thân bài. Thứ bảng `files` sửa được là **nhìn cái gì**:
ảnh chèn trước đây mang URL có chứa khoá lưu trữ, nay mang `/img/{slug}.{ext}`
— không có khoá trong đó. Khớp theo khoá không thôi sẽ đọc **mọi ảnh chèn đã
mint là vô chủ và xoá sạch ở lần lưu kế tiếp**. Nên một mục là "sống" khi thân
bài nhắc **hoặc** khoá lưu trữ (URL `/api/files` cũ, vẫn nằm trong mọi bài đã
xuất bản) **hoặc** slug (URL `/files` và `/img` đều mang nó) — và slug được tra
theo lô, một truy vấn cho cả thư mục. Các "anh em" khác của nó không đọc HTML
ngay từ đầu: `gcDroppedMedia` đi theo khoá `*_path` trong JSON config,
`DeleteOldMedia` so hai giá trị cột.

Một chỗ cố tình để nguyên: `Resolver` (bộ nhớ đệm slug trong tiến trình) không
bị dọn khi xoá. Hàng vừa xoá có thể còn phục vụ thêm vài giây từ cache — giống
hệt bản sao nằm trên CDN sống lâu hơn nó, và `/files` dù sao cũng 404 vì bytes
đã biến mất.

---

## 5. Quyết định then chốt: bộ mã hoá ảnh

Dự án đang build **`CGO_ENABLED=0`**. Đây là ràng buộc, không phải sở thích.

**Phương án A — libvips qua `govips`.** Nhanh (vendor nói 4–8× ImageMagick),
AVIF + WebP chín muồi, chạy production nhiều nơi. Giá: bật cgo, cài thư viện C
trên cả máy dev (Windows) lẫn production, build chậm hơn, cross-compile khó.

**Phương án B — thuần Go, chỉ WebP.** Giải mã bằng stdlib + `x/image/webp`, đổi
cỡ bằng `x/image/draw`, mã hoá WebP bằng một thư viện thuần Go (có vài lựa chọn
ra đời 2026, đều còn v0.x). Không cgo, không phụ thuộc hệ thống. Giá: bỏ AVIF,
và phải tự đo chất lượng/tốc độ của thư viện v0.x trước khi tin.

**WebP một mình có đủ 100 điểm không?** Có. Mục "next-gen formats" của Lighthouse
chấp nhận WebP; AVIF nhỏ hơn WebP cỡ 15–30% với ảnh chụp, là tối ưu thêm chứ
không phải điều kiện đạt điểm. AVIF cũng **to hơn** WebP ở ảnh nhỏ (~200px).

**[ĐÃ CHỐT] Phương án B.** Thư viện: `github.com/mayahiro/go-webp v0.4.0` (thuần
Go), giải mã bằng stdlib + `golang.org/x/image/webp`, đổi cỡ bằng
`golang.org/x/image/draw` (CatmullRom). `CGO_ENABLED=0` giữ nguyên.

**Hệ quả đã trả giá: `go.mod` nay yêu cầu Go ≥ 1.26.0.** Bộ mã hoá WebP thuần Go
kéo theo mức ngôn ngữ đó; đây là cái giá của việc không bật cgo, và nó ràng buộc
cả máy dev lẫn CI. Ghi ở đây để lần sau không ai đi tìm xem vì sao go.mod bị nâng.

Đo trên ảnh của chính dự án: JPEG q80 61.230 B → WebP q80 35.522 B (−42%), không
thấy khác biệt. Nhưng một logo hai màu **to lên** 3.759 B → 6.832 B dưới lossy —
VP8 lossy tiêu bit để bịa ra kết cấu ở chỗ không có kết cấu. Nên chọn
lossy/lossless **theo từng ảnh**, không chọn một lần cho cả dự án: lấy mẫu lưới
~4096 điểm, có alpha hoặc ≤ 256 màu phân biệt → lossless, còn lại → lossy q80.

---

## 6. Ranh giới gói

**[ĐANG CHẠY]** Gói có thật, và lớn hơn bản vẽ vì có thêm nửa ghi và nửa đọc-ra:

```
internal/platform/media/
  media.go       kiểu Record · Format · URLs (hai base URL cấu hình được)
  resolve.go     slug → bản ghi files (có cache trong bộ nhớ, không hết hạn)
  image.go       giải mã · đổi cỡ · mã hoá · cache biến thể · chặn 1920
  negotiate.go   Accept → định dạng (ba nhóm, không lấy nguyên chuỗi Accept)
  http.go        ba handler: /files/{name} · /img/{name} · /img/{slug}/{name}
  mint.go        upload đã lưu → slug (các module gọi qua MintOr)
  store.go       Postgres: đọc theo slug, theo khoá, theo lô khoá; ghi khi mint
  public.go      đọc ra: khoá/URL cũ → URL media + width/height, theo lô
  keep.go        xoá: bỏ hàng files + cả nhánh biến thể (Forget/ForgetPrefix)
```

Gói **không** biết gì về bài viết, trang hay thành viên: nó nhận `storage.Storage`
và một kho đọc bảng `files`. Upload vẫn thuộc module sở hữu. Chiều phụ thuộc chỉ
có một hướng — **module → media**, không bao giờ ngược lại — kể cả ở đường xoá:
module gọi `Forget`, gói media không biết ai gọi mình.

Mount ở đâu là **cấu hình**: cùng một binary có thể phục vụ `/files` trên host
chính và `/img` trên host ảnh, qua hai route và hai base URL trong settings.
Tách thành service riêng chỉ cần thiết khi muốn scale riêng — chưa có nhu cầu đó.

---

## 7. An toàn

- Giữ nguyên `X-Content-Type-Options: nosniff` và `Content-Security-Policy:
  default-src 'none'; sandbox` như handler hiện tại.
- Giới hạn kích thước ảnh đầu vào khi giải mã (bom nén: ảnh 100×100 nén có thể
  bung thành 25.000×25.000). Chặn theo số pixel, không theo dung lượng tệp.
- Slug không đoán được thay cho allowlist tiền tố; tệp riêng tư vẫn phải đi
  route có kiểm quyền, **không** nằm trong bảng này.
- Không nhận URL nguồn từ ngoài (SSRF) — gói chỉ đọc kho của chính mình.

---

## 8. Việc front-end (một nửa công việc)

- Site: component `<Img>` dựng `srcset` từ tập cỡ cố định + `sizes` + `width`/
  `height` lấy từ các trường anh em ở §3b (`cover_width`/`cover_height`, …);
  ảnh LCP `fetchpriority="high"`, không `loading=lazy`. Trường kích thước có thể
  **vắng mặt** (ảnh chưa backfill, ảnh ngoài) — khi đó cứ render như cũ.
- Console: trình soạn thảo chèn ảnh bằng URL `/img/{slug}.{ext}` (thương lượng),
  và ghi `width`/`height` thật vào thẻ để không nhảy layout.
- Lưu ý xung đột: thẻ `<img>` trong thân bài hiện dùng `width="50%"` làm **bố
  cục**. `width`/`height` cho CLS phải là **kích thước thật**, nên bố cục cần
  chuyển sang class (`kd-img--w50`) — nếu không hai thứ tranh nhau một thuộc tính.

---

## 9. Thứ tự làm

1. **[XONG]** Bảng `files` + backfill + sinh slug khi upload (route cũ vẫn sống).
2. **[XONG]** Handler `/files/{slug}.{ext}` + ETag/304/immutable.
3. **[XONG]** Đo bộ mã hoá WebP → chốt §5 (phương án B).
4. **[XONG]** Handler `/img` + cache biến thể + chặn 1920 ở URL thương lượng.
5. **[XONG]** Đọc ra: phản hồi công khai trả URL `/img` + `width`/`height` (§3b).
6. **[XONG]** Xoá: bỏ hàng `files` + nhánh biến thể ở mọi đường xoá (§4b).
7. **[CHƯA]** Front-end: `<Img>` ở site, chèn ảnh ở console (§8).
8. **[CHƯA]** Đo Lighthouse trước/sau trên một trang bài viết thật.

Nói lại cho rõ, vì đây là điểm dễ hiểu nhầm nhất của cả tài liệu: **backend đã
phát ra đủ dữ liệu để đạt 100, và một mình nó không đạt được**. `srcset` dựng từ
tập cỡ cố định, `width`/`height` lấy từ các trường mới ở §3b, `fetchpriority` cho
ảnh LCP — ba thứ đó là việc của site, và là một nửa công việc chứ không phải
phụ lục.
