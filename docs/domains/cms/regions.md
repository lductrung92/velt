# Domain: Vùng chứa khối (regions)

Những chỗ trên site công khai mà biên tập viên tự xếp nội dung vào: header,
footer, cột bài viết. Đọc file này trước khi thêm vùng mới hoặc sửa cách site
dựng khung trang.

- Màn hình quản trị: `/cms/giao-dien` (`src/console/src/modules/cms/pages/Appearance.tsx`)
- Module backend: `src/backend/internal/modules/cms/regions/`
- Bộ widget dùng chung: `src/backend/internal/modules/cms/widgets/registry.go`
- Menu điều hướng: `src/backend/internal/modules/cms/menus/`

---

## 1. Phạm vi

**Trong phạm vi:** phần khung bao quanh nội dung — thanh header, chân trang, cột
phụ. Những chỗ này giống nhau trên nhiều trang và không thuộc về bản ghi nào.

**Ngoài phạm vi:** nội dung của một trang cụ thể. Trang chủ được dựng bằng
*landing section* qua trình kéo thả Puck (`cms_landing_sections`), thân bài viết
là HTML trong `cms_articles`. Hai hệ đó trả lời câu hỏi "trang này nói gì";
vùng trả lời câu hỏi "quanh mọi trang có gì".

Chúng dùng chung từ vựng widget nhưng **không dùng chung bảng**. Một widget đặt
trong vùng không liên quan gì tới cùng loại widget nhúng trong thân trang.

## 2. Vấn đề

Phiên bản đầu có ba vùng phẳng: `header`, `sidebar`, `footer`. Đo trên site thật
cho thấy `sidebar` chỉ tồn tại ở **đúng một loại trang**:

```
/           khối sidebar render: 0
/blog       khối sidebar render: 0
/products   khối sidebar render: 0
/blog/{bài} khối sidebar render: 2   ← chỗ duy nhất
```

Tên vùng nói quá so với thực tế. Và một vùng phẳng không có cách nào diễn đạt
"khối này chỉ hiện ở trang bài viết" hay "khối này hiện khắp nơi trừ trang chủ".

Giải pháp: **nhóm trang**, mỗi nhóm có bộ vị trí riêng, nhóm con kế thừa nhóm
cha. Đây là mô hình template hierarchy của WordPress, và nó giải đúng bài toán
vì bài toán cũng chính là bài toán đó.

## 3. Định tuyến công khai

Đây là định tuyến của site, do chủ sản phẩm chốt:

| Đường dẫn | Trang |
|---|---|
| `/` | trang chủ |
| `/products` | danh sách sản phẩm |
| `/product/{slug}` | chi tiết sản phẩm |
| `/blog` | danh sách bài viết |
| `/blog/{slug}` | chi tiết bài viết |
| `/{slug}` | **trang CMS** — bắt phần còn lại |
| không giải được | 404 |

Mọi dòng trên cũng trả lời ở `/{mã ngôn ngữ}/…`; `splitLocale` bóc tiền tố một
lần ở `src/site/app/entry-server.tsx:125` **trước khi** định tuyến, nên nhóm
trang phải khớp trên đường dẫn đã bóc. Khớp trên URL thô thì mọi trang tiếng Anh
rơi hết về nhóm chung.

### 3.1 Hiện trạng lệch spec ở hai chỗ

| Spec | Site đang làm | Việc phải làm |
|---|---|---|
| `/{slug}` → trang CMS | **404 mọi trang CMS** | thêm route; xem §3.3 |
| `/blog/{slug}` | giống spec | — |
| `/product/{slug}` | `/products/{slug}` (số nhiều) | đổi + 301 từ dạng cũ |

`product.id` trong `src/site/app/types.ts:17` **đã là slug** (URL thật hôm nay:
`/products/kho-gon-cf9c`), nên việc đổi chỉ là đổi tiền tố, không phải đổi khoá.

Dạng cũ **đang nằm trong sitemap** (`src/site/app/lib/sitemap.server.ts:66`), tức
là đã hoặc sắp được lập chỉ mục. Đổi mà không 301 là vứt đi mọi liên kết đã có.
Site đã có sẵn tiền lệ 301 cho slug bài viết cũ
(`src/site/app/lib/blog.server.ts:133`) — dùng đúng cơ chế đó.

### 3.2 `/{slug}` bắt phần còn lại, và điều đó đổi cả mô hình

`/{slug}` khớp mọi thứ chưa ai nhận. Ba hệ quả:

**Thứ tự khớp là bắt buộc, không phải tuỳ chọn.** Mọi đường dẫn đã biết phải thử
trước, `/{slug}` thử cuối. Đảo thứ tự thì một trang CMS tên `products` nuốt mất
danh sách sản phẩm.

**Phân nhóm cần tra dữ liệu, không chỉ khớp chuỗi.** `/abc` là trang CMS nếu có
trang nào slug `abc`, còn không thì là 404. Hai nhóm khác nhau, và chỉ nhìn
đường dẫn thì không phân biệt được. Đây là khác biệt thật so với mọi nhóm còn
lại — nhóm của trang chỉ biết **sau khi** loader trả lời.

**Slug phải có danh sách cấm.** Hôm nay backend không cấm slug nào
(`internal/modules/cms/pages/models.go:105` chỉ giới hạn độ dài). Một trang đặt
slug `blog`, `products`, `product`, `assets`, `robots.txt`, `sitemap.xml`, hay
trùng một mã ngôn ngữ đang bật (`en`) sẽ **tạo được rồi vĩnh viễn không ai mở
được** — route đã biết thắng trước. Phải chặn ở đường ghi, kèm thông báo nói rõ
vì sao, chứ không để người ta phát hiện bằng cách bấm vào link chết.

## 4. Cây nhóm trang

```
common                                     khớp mọi trang
├─ home              = /
├─ products          (nút gộp, không tự khớp)
│  ├─ product_list   = /products
│  └─ product_detail ^ /product/{slug}
├─ blog              (nút gộp, không tự khớp)
│  ├─ blog_list      = /blog
│  └─ blog_detail    ^ /blog/{slug}
├─ page_detail       = /{slug}   ← thử cuối cùng, cần tra dữ liệu
└─ not_found         không giải được
```

`=` khớp chính xác, `^` khớp tiền tố. Thử theo đúng thứ tự trên.

**Nút gộp** (`products`, `blog`) không khớp trang nào của riêng nó. Nó tồn tại để
trả lời "mọi trang sản phẩm" — khối đặt ở đó hiện trên cả danh sách lẫn chi tiết.
Không có nó thì mỗi khối chung phải nhập hai lần, đúng thứ mà kế thừa sinh ra để
xoá.

### 4.1 Cây là thứ bậc BIÊN TẬP, không phải thứ bậc URL

Chỗ này quan trọng và dễ hiểu nhầm. `/products` và `/product/{slug}` **không
chung tiền tố** — một cái số nhiều, một cái số ít. Vậy mà chúng vẫn là hai con
của cùng một nút `products`.

Chúng cùng nhóm vì người biên tập nghĩ về chúng như một ("mọi trang sản phẩm"),
không phải vì URL của chúng giống nhau. Nếu suy cây từ tiền tố, định tuyến này
sẽ không có nút gộp nào cho sản phẩm cả.

Nên mỗi nút **tự khai luật khớp của nó**, và quan hệ cha con khai riêng. Hai thứ
đó độc lập.

### 4.2 Nhóm phải lấy tên theo phân loại site đã có

Site **đã** phân loại trang rồi, ở `resolveRoute` (`src/site/app/App.tsx:20`) —
hàm đó quyết định trang nào render component nào. Nhóm trang lấy tên theo đúng
phân loại ấy và sống cùng một chỗ; **không dựng bộ matcher thứ hai**.

Hai nơi cùng quyết định "trang này là loại gì" thì sẽ lệch nhau, và triệu chứng
là một khối hiện ở nơi không ai cấu hình cho nó — loại lỗi không ai nghĩ tới
việc đi tìm.

## 5. Vị trí (slot) — chỉ những chỗ markup thật sự có

Một vị trí là một chỗ vật lý trong bố cục. Danh sách này **bị giới hạn bởi
markup hiện tại**, không phải bởi mong muốn.

| Vị trí | Nhóm | Chỗ thật trong mã | Ghi chú |
|---|---|---|---|
| `header` | common | `Header.tsx:164`, giữa nav và cụm ngôn ngữ/CTA | hàng ngang, chật |
| `footer` | common | `HomeStatic.tsx:463`, một cột của `.footer-grid` | xem §8, lưới cố định |
| `before_content` | common | **chưa có** — ngay sau `<main>` | cần thêm markup |
| `after_content` | common | **chưa có** — cuối `<main>`, trên footer | cần thêm markup |
| `sidebar_left` | blog_detail | `aside.blog-reading-sidebar`, `BlogArticle.tsx:76` | rộng **13rem** |
| `after_article` | blog_detail | sau `.blog-article-signoff`, `BlogArticle.tsx:122` | trong cột chính |
| `aside` | product_detail | `aside` trong `.product-detail-body`, `ProductDetail.tsx:142` | đang chứa thành viên |
| `after_content` | page_detail | **chưa có** — trang CMS chưa có route | xem §3.1 |

Ba loại trang **không có cột phụ nào**: trang chủ, danh sách sản phẩm, danh sách
blog. Cả ba là một cột toàn chiều rộng (`Home.tsx`, `Catalog.tsx:60`,
`Blog.tsx:22`). Muốn chúng có cột phụ thì phải cắt lại bố cục — đó là việc riêng,
không nằm trong tài liệu này.

### 5.1 Ràng buộc kích thước phải tôn trọng

`sidebar_left` rộng **13rem (208px)**, và 11rem ở ≤1000px
(`src/site/app/styles/blog.css:562`, `:783`). Dưới 767px nó xếp **lên trên** thân
bài (`blog.css:882`). Khối đặt vào đây phải đọc được ở 208px — một nút CTA có
chữ dài sẽ tràn. Ở ≤767px nó là thứ đầu tiên người đọc nhìn thấy trước cả bài
viết, nên khối quảng cáo dài đặt ở đây sẽ đẩy bài xuống.

## 6. Luật kế thừa

Khối được lưu theo cặp **(nhóm, vị trí)**. Khi dựng một trang:

1. Xác định nhóm của trang.
2. Đi ngược lên tới `common`.
3. Với mỗi vị trí, lấy danh sách của **tổ tiên gần nhất có khai báo** danh sách
   không rỗng.

**Ghi đè, không trộn.** Nhóm con khai báo `footer` thì danh sách của nó **thay
thế** danh sách của `common`, không cộng thêm.

Lý do chọn ghi đè: trộn thì không có cách nào nói "trang này đừng hiện khối
khuyến mãi", và nhìn vào màn hình quản trị không ai biết một khối từ đâu ra. Ghi
đè thì đoán được. Cái giá là muốn "footer chung + thêm một khối ở blog" thì phải
chép lại danh sách chung — và màn hình quản trị phải làm cái giá đó lộ ra:

> Vị trí kế thừa hiện ở dạng mờ, kèm nhãn *kế thừa từ Chung* và một nút
> *Ghi đè ở nhóm này* chép danh sách cha xuống làm điểm khởi đầu.

Không có nút đó thì người dùng sẽ tự chép tay và quên mất một mục.

## 7. Mô hình dữ liệu

Bảng `cms_region_blocks` đã có (migration `0043`). Thay đổi cần thiết:

```sql
ALTER TABLE cms_region_blocks
  ADD COLUMN page_group TEXT NOT NULL DEFAULT 'common';

DROP INDEX idx_cms_region_blocks_region;
CREATE INDEX idx_cms_region_blocks_slot
  ON cms_region_blocks (page_group, region, sort_order);
```

Cột `region` giữ nguyên tên nhưng đổi nghĩa: nó là **vị trí**, không còn là vùng.
Đổi tên cột sẽ đụng mọi câu truy vấn để đổi lấy một từ chính xác hơn — không
đáng, miễn là chỗ khai báo nói rõ.

**Không cần di trú dữ liệu.** Tính năng chưa commit và bảng trên máy dev đang
rỗng. Nếu đã có dữ liệu thì `DEFAULT 'common'` cũng xếp đúng cho `header` và
`footer`, chỉ `sidebar` phải chuyển tay sang `blog_detail`.

Từ vựng nhóm và vị trí sống trong **mã Go**, không phải CHECK trong DB — giống
cách `widgets` khai báo loại widget. Một CHECK nghĩa là mỗi lần site mọc thêm
một chỗ lại phải có migration, trong khi đường ghi là lối vào duy nhất.

Cặp `(nhóm, vị trí)` phải được **kiểm tra chéo**: `sidebar_left` chỉ hợp lệ ở
`blog_detail`. Gửi `('home', 'sidebar_left')` là 422. Không kiểm thì sẽ có khối
nằm trong DB mà không trang nào vẽ, và không ai hiểu tại sao nó không hiện.

## 8. Hai lỗi đã sửa, và lý do ghi lại

Cả hai nằm trong bản dựng đầu tiên và đều chỉ lộ ra khi đo, không khi đọc.

**Lưới footer là 4 cột cứng.** `.footer-grid{grid-template-columns:1.4fr 1fr 1fr 1fr}`
(`src/site/app/styles/styles.css:13`). Con của nó là brand + N cột menu +
`footer-message`; thêm vùng vào làm con thứ 5 nên `footer-message` bị đẩy xuống
hàng hai. Sửa bằng cách đưa vùng **ra ngoài lưới, thành hàng riêng bên dưới**
(`HomeStatic.tsx`) — không đụng vào template 4 rãnh, nên footer không có khối
vẫn giống hệt trước. Nếu sau này ai muốn vùng thành một cột thật thì phải đếm số
con và đặt số rãnh theo, đừng chỉ chèn thêm một con nữa.

**Ngưỡng ẩn lệch với nav.** Nav ẩn ở ≤1023px (`styles.css:18`), vùng header ban
đầu ẩn ở ≤900px. Từ 901 tới 1023px có khối lơ lửng cạnh một thanh nav đã biến
mất. Đã thống nhất về 1023px.

## 9. Hợp đồng API

Giữ **một lần đọc cho cả site**, như hiện tại. Site đã phân loại trang rồi nên
nó tự làm phẳng được; bắt nó hỏi theo từng nhóm sẽ phá tầng cache layout
(một bản theo ngôn ngữ, `layout.server.ts`).

```
GET /api/public/cms/regions?locale=xx
→ { "<nhóm>": { "<vị trí>": [ khối ] } }
```

Chỉ những nhóm và vị trí **có khối đang hiện** mới xuất hiện. Nhóm vắng mặt
nghĩa là "chưa cấu hình", và site render thứ nó vốn có — cùng giao kèo mà mọi
cài đặt khung trang đang theo (`""` = dùng mặc định site mang sẵn). Đây là lý do
site chưa ai mở màn hình này trông **giống từng pixel** với trước đây; đã kiểm
bằng cách so SHA256 ảnh chụp header và footer trước/sau.

Đường ghi giữ nguyên hình dạng, thêm nhóm vào đường dẫn:

```
GET /api/cms/regions                              → mọi nhóm, mọi vị trí
PUT /api/cms/regions/{nhóm}/{vị trí}/blocks       → thay cả danh sách
```

Thay cả danh sách và **giữ nguyên id** mà body gửi lên, như `menus` làm — id là
mỏ neo, mất nó là mất thứ gắn vào nó.

## 10. Việc không làm

- **Không dựng cột phụ cho trang chủ, danh sách blog, danh sách sản phẩm.** Cả
  ba đang là một cột; thêm cột là sửa bố cục site ở mức phải duyệt riêng.
- **Không đụng landing section.** Trang chủ vẫn do Puck dựng.
- **Không làm vùng theo từng bản ghi** ("bài viết này có sidebar riêng"). Chưa ai
  cần, và nó biến vùng thành một trường của bài viết.

## 11. Ghi chú đã phát hiện khi khảo sát

- Site **chưa** định tuyến trang CMS, dù spec nói `/{slug}`.
  `/public/cms/pages/{slug}` hiện chỉ được đọc đúng một lần, ở
  `landing.server.ts:41`, để lấy `sections` cho trang chủ. Mọi trang CMS khác
  trả 404. Nhóm `page_detail` ở §4 mô tả đích đến, không phải hiện trạng.
- `cms_pages.template` là **cột chết** — không chỗ nào trong `src/site/` đọc nó.
- `widgets/registry.go:17` trỏ tới `docs/domains/cms/widgets.md`, file **chưa
  tồn tại**.
- Loại `categories_showcase`, `rich_text`, `cta_banner` tồn tại **hai lần** —
  vừa là widget vừa là landing section, hai form cấu hình riêng. Comment trong
  `widgets/registry.go:5-6` đã ghi "có thể hợp nhất sau" từ lâu.
