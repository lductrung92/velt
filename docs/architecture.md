# Bản đồ code VELT

Ghi nhận từ mã nguồn trong `src`, ngày 2026-10-11. Đây là bản đồ kiến trúc và luồng chính, không phải kết quả kiểm toán toàn bộ code.

## Ba ứng dụng

| Thư mục | Vai trò | Entry point |
|---|---|---|
| `src/backend` | Go API, nghiệp vụ, xác thực, lưu dữ liệu | `cmd/api/main.go` |
| `src/console` | React SPA để quản trị nội dung, sản phẩm, đội ngũ và tài khoản | `src/main.tsx`, `src/app/router.tsx` |
| `src/site` | Website công khai React SSR | `server.mjs`, `app/entry-server.tsx`, `app/entry-client.tsx` |

Console đã gọi backend. Site hiện chạy độc lập bằng dữ liệu mẫu trong `app/data/content.ts` và `app/data/examples.ts`, theo lựa chọn giữ dữ liệu mẫu trước khi nối API.

## Backend

Stack: Go, chi, pgx/PostgreSQL, goose migrations. `cmd/api/main.go` chỉ wiring: đọc config, chạy migrations, kết nối DB, dựng storage/mailer/cache/token, đăng ký middleware và modules, shutdown có timeout.

Luồng request: middleware → handler → service → repository → PostgreSQL. Handler decode/validate và trả HTTP; service kiểm permission và nghiệp vụ; repository thao tác persistence. `internal/httpx` thống nhất JSON/error envelope và identity. `internal/platform` cung cấp crypto, JWT, TOTP, rate limit, storage local/S3, mail, HTML sanitation, slug và revalidation. Redis dùng cho cache/limiter nếu cấu hình; có fallback khi không dùng Redis.

Modules gồm `auth`, `account`, `admin`, `settings`, `files`, `cms`, `members`, `products`. CMS có articles, pages, taxonomy, menus, landing builder, widgets, comments và newsletter; có các route đọc công khai dưới `/api/public/cms`.

`members` là hồ sơ marketing, tách khỏi `users` là danh tính đăng nhập. API quản trị ở `/api/members`; roster công khai ở `/api/public/members`, chi tiết theo slug. Chỉ hồ sơ active xuất hiện ở public.

`products` gồm `catalog`, `categories` và `shared`. Catalog quản lý sản phẩm, gallery ảnh/video, quan hệ danh mục và thành viên, demo, SEO và publish transitions. Hai trục khác nhau:

- `status`: `draft`, `published`, `archived` — trạng thái xuất bản.
- `lifecycle`: `idea`, `building`, `launched` — giai đoạn phát triển.

Publish chụp chi tiết vào `published_snapshot`; unpublish giữ snapshot. Quan hệ sản phẩm–danh mục, sản phẩm–thành viên và gallery có repository/endpoints riêng.

**Khoảng cách với tài liệu API:** code hiện có `/api/public/product-categories`, nhưng chưa đăng ký `/api/public/products` hay `/api/public/products/{slug}`. Các route này trong `docs/apis/products-api.md` là hợp đồng cần triển khai, chưa phải chức năng đang chạy. Khi nối site, cần thêm read path chỉ đọc sản phẩm đã xuất bản từ snapshot, không dùng API quản trị cho khách.

## Console

React + TypeScript + Vite, React Router, TanStack Query, Zustand, React Hook Form/Zod, i18next. Modules đối ứng backend: auth, account, admin, CMS, members, products.

Luồng dữ liệu: page → query/mutation hook → service → Axios client → API. Mutation invalidate query keys để đồng bộ danh sách và chi tiết. Form editor có draft cho nội dung, SEO, cover/gallery và quan hệ; lưu quan hệ qua endpoints riêng.

`src/services/api.ts` là client dùng chung: correlation ID, Bearer access token, refresh cookie, chuẩn hóa lỗi thành `ApiError`. Access token chỉ ở bộ nhớ Zustand. Bootstrap refresh phiên và nạp roles/permissions trước khi render route được bảo vệ; request 401 hết phiên dùng chung một refresh promise. `RequirePermission` kiểm hiển thị ở UI, backend vẫn là nơi quyết định quyền.

## Site

`server.mjs` dùng Vite middleware/SSR ở dev; production local đọc manifest client và bundle server. Mỗi request render React bằng `renderToString`, trả HTML, metadata, mã 200/404 và bootstrap props. `hydrateRoot` tiếp quản tương tác trên trình duyệt.

`App.tsx` giải quyết route và context chung. Trang chính: `/`, `/products`, `/products/:id`; URL `.html` cũ vẫn được hỗ trợ. Components dùng chung header/footer, sản phẩm, đội ngũ/modal, form và chatbox. `lib/catalog.ts` quản lý tìm kiếm không dấu, lọc và sắp xếp; `lib/links.ts` quản lý URL an toàn và referral.

Hiện có 5 hồ sơ chưa bổ sung thông tin và 16 mẫu sản phẩm có nhãn minh họa. Form chỉ tạo lời nhắn để copy/download/mailto; chat chỉ là bản xem thử AI/nhân viên. Chưa gửi tin nhắn lên backend hoặc kết nối AI thật.

## Chạy local và kiểm tra

- `scripts/dev.ps1`: chạy API + console; console mặc định cổng 5273, API theo config môi trường. Script này chưa khởi động site.
- Site: `cd src/site; npm run dev`, mặc định `http://127.0.0.1:5373`.
- Backend: `go test ./...`; các integration test DB cần database thử nghiệm riêng.
- Console: scripts `typecheck`, `test`, `e2e` trong package.json.
- Site: `npm run build`, `npm test`, `npm run test:e2e`.

Lần đọc code này không sửa nghiệp vụ backend/console, không chạy migrations và không deploy Cloudflare.
