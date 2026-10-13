# ZUKATEK Site — React SSR

Website công khai được migration từ `mockup` sang React + TypeScript. Trang chủ, danh mục, chi tiết sản phẩm và Blog render HTML tại mỗi request trên server Node.js; trình duyệt dùng `hydrateRoot` để kích hoạt tương tác. Vite xử lý dev/HMR và build riêng client/server.

## Chạy local

Từ thư mục gốc dự án, chạy cả API, console và site:

```powershell
.\scripts\dev.ps1
# Đổi cổng site nếu cần:
.\scripts\dev.ps1 -SitePort 5374
# Dừng stack (dùng cùng tham số cổng đã chọn):
.\scripts\dev.ps1 -Stop -SitePort 5374
```

Site mặc định ở `http://127.0.0.1:5373`, console ở `http://localhost:5273`. Script cài dependencies khi chưa có và dừng cả ba dịch vụ khi nhấn Ctrl+C.

Để chỉ chạy site:

```powershell
cd E:\startup\velt\src\site
npm ci
npm run dev
```

Mở **http://127.0.0.1:5373**. Có thể đổi cổng bằng `$env:PORT='5374'`. Server mặc định chỉ lắng nghe localhost.

Chạy bản build production tại local:

```powershell
npm run build
npm run preview
```

Không deploy Cloudflare trong lần migration này. `mockup/` được giữ làm bản tham chiếu; mã trong `src/site` chạy độc lập, không import hay đọc file từ `mockup`.

## Cấu trúc

```text
app/
  entry-server.tsx      # Render React và metadata cho từng request
  entry-client.tsx      # Hydrate HTML đã render
  App.tsx               # Route, context và layout chung
  components/           # Header, footer, đội ngũ, sản phẩm, form, chat
  pages/                # Home, Catalog, ProductDetail, Blog, BlogArticle
  data/                 # Dữ liệu mockup và mẫu minh họa
  lib/                  # Bộ lọc, URL an toàn, link giới thiệu
  styles/               # CSS đã duyệt từ mockup
public/assets/          # Logo, favicon, font và giấy phép
server.mjs              # HTTP server local dev/production
tests/                  # SSR, bộ lọc và browser regression
```

URL chính: `/`, `/products`, `/products/:id`. Các URL cũ `/index.html`, `/products.html`, `/product.html?id=...` vẫn render được để giữ các link đã chia sẻ. Metadata sản phẩm và mã HTTP 404 được tạo trên server. Bộ lọc danh mục nhận query `q`, `category`, `status`, `sort`, `page`; link giới thiệu giữ `ref`.

## Nội dung và tính năng

Chỉnh dữ liệu sản phẩm/đội ngũ tại `app/data/content.ts`. Các phần này giữ dữ liệu mockup, chưa kết nối API backend. Blog đã dùng API public CMS, mô tả bên dưới. Khi chưa có sản phẩm thật, 16 mẫu được gắn nhãn “Minh họa” và link tạm `example.com`. Sản phẩm thật tự thay các mẫu khi danh sách `products` có dữ liệu.

Giữ giao diện đã duyệt, nền đội ngũ sáng, hero hệ sinh thái, hồ sơ/kỹ năng/thành viên tham gia sản phẩm, bộ lọc/tìm kiếm không dấu/phân trang, link giới thiệu và preselect sản phẩm khi hỏi mua. Biểu mẫu chỉ chuẩn bị lời nhắn, cho phép copy/download/mailto nếu có email; không tự gửi. Chatbox React có hai chế độ xem thử AI/nhân viên, nút góc dưới chỉ có icon; không có API AI hay nhân viên online thật. Lịch sử chat chỉ tồn tại trong bộ nhớ của trang.

Phần đội ngũ hiện gồm 4 hồ sơ và địa cầu Zukatek: quả cầu xanh với địa hình
cách điệu, kinh/vĩ tuyến xoay liên tục 32 giây, bốn nhân vật minh họa trên
bán cầu nhìn thấy. Vị trí trang trí không biểu diễn địa điểm thật. Nhấn nhân
vật hoặc nút hồ sơ để mở chi tiết; cả hai hỗ trợ bàn phím. Danh sách hồ sơ
đứng cạnh globe trên desktop và nằm bên dưới trên điện thoại.

`components/team/TeamGlobeArtwork.tsx` dùng phép chiếu trực giao và cắt địa hình
ở đường chân trời; mỗi SVG có định danh riêng. Remotion chỉ tải khi section
gần viewport trên desktop và chuyển về bản tĩnh khi ra ngoài màn hình,
trên điện thoại hoặc khi người dùng giảm chuyển động. SSR luôn có bản tĩnh.
Không tự điền chân dung, chuyên môn hay sản phẩm tham gia. Bộ lọc kỹ năng,
hồ sơ chi tiết và link giới thiệu vẫn lấy từ dữ liệu từng thành viên.

## Kiểm tra

### Hero hệ sinh thái sản phẩm

Hero bám `../../OVERVIEW.md`: catalog là trung tâm, bốn nhóm khách hàng,
các sản phẩm độc lập và chỉ chung thương hiệu. Bốn cửa sổ SVG là **minh họa**,
không lấy dữ liệu sản phẩm, số liệu kinh doanh hay trạng thái ra mắt giả.

`app/components/hero/HeroArtwork.tsx` dùng chung cho HTML SSR và Remotion.
`HeroMotion.tsx` chạy vòng lặp 14 giây/30fps: cửa sổ nổi nhẹ, checklist được
đánh dấu, thẻ công việc di chuyển qua các cột, biên nhận và biểu đồ đổi theo nhịp riêng.
Cửa sổ xếp lệch với góc nghiêng nhẹ, bóng đổ nhiều lớp và nền ribbon xanh;
điểm sáng, con trỏ minh họa và viền tập trung luân phiên theo từng cửa sổ.
Các chuyển động dùng hàm tuần hoàn để nối vòng lặp êm; định danh SVG riêng
cho từng bản minh họa tránh xung đột gradient giữa SSR, fallback và Player.
Tự chạy, không âm thanh hoặc nút điều khiển. Không biểu diễn SSO hay luồng
đồng bộ dữ liệu giữa sản phẩm.

`HeroVisual.tsx` chỉ tải Player trên desktop từ 768px khi người dùng cho phép
chuyển động. Điện thoại, chế độ giảm chuyển động và khi Player lỗi giữ cùng
minh họa tĩnh. SSR luôn có ảnh minh họa và nội dung đầy đủ trước hydration;
khung SVG giữ tỷ lệ để tránh xê dịch bố cục. Remotion và Player ghim cùng
phiên bản với console. API tham khảo: [Remotion Player](https://www.remotion.dev/docs/player/player).

### Lệnh kiểm tra

```powershell
npm run build
npm test
npx playwright install chromium
npm run test:e2e
```

Nếu đã có Chromium, đặt `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` thay cho bước cài trình duyệt. E2E dùng server production riêng tại cổng 4175 và tự dừng sau khi chạy.

Kiểm tra gồm SSR không có browser globals, HTML có dữ liệu khi tắt JavaScript, 100 sản phẩm, bộ lọc/URL/phân trang, escaping và URL an toàn, hydration, modal, referral, biểu mẫu, chat và responsive 320–1920px. Ảnh kiểm tra lưu vào `artifacts/`.

Tham khảo: [React SSR](https://react.dev/reference/react-dom/server/renderToString), [React hydration](https://react.dev/reference/react-dom/client/hydrateRoot), [Vite SSR](https://vite.dev/guide/ssr).

## Blog và đăng bài

- `/blog`: danh sách, bài mới nhất, tìm kiếm `q`, sắp xếp `sort` và phân trang `page` (9 bài/trang). Bộ lọc dùng form GET; tìm kiếm và phân trang vẫn hoạt động khi chưa hydrate.
- `/blog/:slug`: bài chi tiết, ảnh bìa, ngày xuất bản, thời gian đọc, mục lục H2/H3 khi có ít nhất hai đề mục, sao chép link và các bài khác. Link giữ người giới thiệu `ref`.
- Đăng bài tại Console → CMS → Bài viết. Site chỉ đọc `/api/public/cms/articles` và `/api/public/cms/articles/:slug`, không cần đăng nhập và không đọc endpoint quản trị. Bài phải được xuất bản theo workflow CMS để xuất hiện. Site không tạo bài mẫu hay đăng bài thay người dùng.
- Trang chủ có section Blog và ba bài mới nhất. Header/mobile/footer đều có liên kết Blog.

`renderRequest` lấy snapshot CMS trên server rồi `render` tạo HTML; snapshot được serialize cho React hydration, tránh nội dung server/client lệch nhau. API mặc định `http://127.0.0.1:8081/api`; đặt biến môi trường server `SITE_API_BASE_URL` khi cần đổi. Có thể đặt `SITE_PUBLIC_API_BASE_URL` nếu địa chỉ media công khai khác địa chỉ API nội bộ. Ảnh bìa và ảnh/link `/api/files/` trong body được chuyển sang origin API. Body chỉ lấy từ read model public, đã được backend `htmlsan.Body` sanitize; không nhận HTML từ query string.

SEO bài viết dùng thông tin CMS, canonical, Open Graph article, noindex/nofollow. Khi API trả slug mới, site chuyển301 và giữ query; bài không khả dụng trả404, lỗi API trả503 kèm Thử lại. Trang chủ vẫn hoạt động khi Blog không tải được. Không tự hiển thị bài nháp hoặc dữ liệu giả khi lỗi.

Giao diện Blog dùng Be Vietnam Pro, xanh Zukatek, typography đọc18px desktop/17px mobile, ảnh minh họa Journal khi chưa có ảnh bìa. CSS riêng `app/styles/blog.css` được nạp cho cả client và SSR dev. Kiểm tra bằng `npm run build`, `npm test`; bộ test Blog có fixture riêng, không ghi dữ liệu CMS.

Lưu ý local: `scripts/dev.ps1` giám sát cả ba process và dừng cả stack khi một process thoát. Khi sửa chính `server.mjs`, hãy khởi động lại bằng script này, không dừng riêng site thuộc stack. Thay React/CSS bình thường vẫn dùng HMR.
