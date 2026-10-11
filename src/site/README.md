# ZUKATEK Site — React SSR

Website công khai được migration từ `mockup` sang React + TypeScript. Trang chủ, danh mục và chi tiết sản phẩm render HTML tại mỗi request trên server Node.js; trình duyệt dùng `hydrateRoot` để kích hoạt tương tác. Vite xử lý dev/HMR và build riêng client/server.

## Chạy local

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
  pages/                # Home, Catalog, ProductDetail
  data/                 # Dữ liệu mockup và mẫu minh họa
  lib/                  # Bộ lọc, URL an toàn, link giới thiệu
  styles/               # CSS đã duyệt từ mockup
public/assets/          # Logo, favicon, font và giấy phép
server.mjs              # HTTP server local dev/production
tests/                  # SSR, bộ lọc và browser regression
```

URL chính: `/`, `/products`, `/products/:id`. Các URL cũ `/index.html`, `/products.html`, `/product.html?id=...` vẫn render được để giữ các link đã chia sẻ. Metadata sản phẩm và mã HTTP 404 được tạo trên server. Bộ lọc danh mục nhận query `q`, `category`, `status`, `sort`, `page`; link giới thiệu giữ `ref`.

## Nội dung và tính năng

Chỉnh dữ liệu tại `app/data/content.ts`. Hiện giữ nguyên dữ liệu mockup theo yêu cầu, **chưa kết nối API backend**. Khi chưa có sản phẩm thật, 16 mẫu được gắn nhãn “Minh họa” và link tạm `example.com`. Sản phẩm thật tự thay các mẫu khi danh sách `products` có dữ liệu.

Giữ giao diện đã duyệt, nền đội ngũ sáng, hero hệ sinh thái, hồ sơ/kỹ năng/thành viên tham gia sản phẩm, bộ lọc/tìm kiếm không dấu/phân trang, link giới thiệu và preselect sản phẩm khi hỏi mua. Biểu mẫu chỉ chuẩn bị lời nhắn, cho phép copy/download/mailto nếu có email; không tự gửi. Chatbox React có hai chế độ xem thử AI/nhân viên, nút góc dưới chỉ có icon; không có API AI hay nhân viên online thật. Lịch sử chat chỉ tồn tại trong bộ nhớ của trang.

## Kiểm tra

```powershell
npm run build
npm test
npx playwright install chromium
npm run test:e2e
```

Nếu đã có Chromium, đặt `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` thay cho bước cài trình duyệt. E2E dùng server production riêng tại cổng 4175 và tự dừng sau khi chạy.

Kiểm tra gồm SSR không có browser globals, HTML có dữ liệu khi tắt JavaScript, 100 sản phẩm, bộ lọc/URL/phân trang, escaping và URL an toàn, hydration, modal, referral, biểu mẫu, chat và responsive 320–1920px. Ảnh kiểm tra lưu vào `artifacts/`.

Tham khảo: [React SSR](https://react.dev/reference/react-dom/server/renderToString), [React hydration](https://react.dev/reference/react-dom/client/hydrateRoot), [Vite SSR](https://vite.dev/guide/ssr).
