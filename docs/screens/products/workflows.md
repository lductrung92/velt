# Màn hình console: Sản phẩm, Danh mục, Thành viên

Đặc tả UI cho [domain products](../../domains/products/README.md) và
[domain members](../../domains/members/README.md). Hợp đồng API ở
[docs/apis/products-api.md](../../apis/products-api.md).

---

## 1. Điều hướng

Thêm một section mới vào `components/common/AppLayoutCombo/navItems.ts`, nằm giữa
`overview` (CMS) và `system` (Quản trị):

```
TỔNG QUAN
  CMS                    ← đã có
SẢN PHẨM                 ← mới
  Sản phẩm               /products           products.view
  Danh mục               /product-categories products.view
  Thành viên             /members            members.view
HỆ THỐNG
  Quản trị               ← đã có
```

Section không có mục nào hiển thị thì tự biến mất — `visibleNavSections` đã lo việc đó,
không cần code thêm.

Route khai báo trong `app/router.tsx`, bọc `RequirePermission` giống các route CMS.

---

## 2. Cấu trúc module console

Theo đúng layout của `modules/cms`:

```
modules/products/
  index.ts
  pages/        ProductList.tsx  ProductEditor.tsx
                ProductCategories.tsx
  components/   ProductStatusBadge.tsx  LifecycleBadge.tsx
                GalleryPane.tsx  MemberPicker.tsx
                CategoryMultiSelect.tsx  StringListField.tsx
  hooks/        productKeys.ts  useProducts.ts  useProductCategories.ts
                useProductMedia.ts
  services/     products.service.ts  productCategories.service.ts
  schemas/      product.ts
modules/members/
  pages/        MemberList.tsx  MemberEditor.tsx
  hooks/ services/ schemas/
```

---

## 3. Màn Danh sách sản phẩm — `/products`

```
┌───────────────────────────────────────────────────────────────┐
│ Sản phẩm                                        [Quản trị ›]  │
│ Quản lý catalog sản phẩm công nghệ của team.                  │
│ [+ Tạo sản phẩm]                            [lọc ▼] [làm mới] │
├───────────────────────────────────────────────────────────────┤
│ ẢNH │ TÊN ⇅ │ DANH MỤC │ TRẠNG THÁI │ VÒNG ĐỜI │ CẬP NHẬT ⇅ │ ⋯│
└───────────────────────────────────────────────────────────────┘
```

Tái dùng nguyên: `PageHeader`, `ListToolbar` (ô tìm kiếm có debounce),
`FilterPopover` + `FilterChips`, `SortableHead`, `TablePagination`, `EmptyState`,
`ConfirmDialog`.

**Hai cột trạng thái, không gộp thành một** — đây là biểu hiện UI của hai trục ở
[domain §3](../../domains/products/README.md#3-hai-trục-trạng-thái--đừng-gộp):

| Cột | Component | Giá trị |
|---|---|---|
| Trạng thái | `ProductStatusBadge` | Nháp · Đã xuất bản · Lưu trữ |
| Vòng đời | `LifecycleBadge` | Ý tưởng · Đang phát triển · Đã ra mắt |

Bộ lọc: danh mục, trạng thái, vòng đời, nền tảng, nổi bật. Mỗi lựa chọn hiện một chip
xoá được, giống màn Bài viết.

Menu `⋯`: Sửa · Xem trên site (chỉ khi đã xuất bản) · Nhân bản · Lưu trữ · Xoá.
Xoá mở `ConfirmDialog` nêu rõ sẽ xoá cả gallery.

---

## 4. Trình soạn sản phẩm — `/products/new`, `/products/:id`

`EditorActionBar` cố định trên cùng: `[Quay lại]` … `[Lưu]` `[Xuất bản ▾]`.

Năm tab. **Tab Gallery và Thành viên chỉ bật sau khi đã lưu lần đầu** — chúng cần
`product.id` để upload file và tạo liên kết. Khi tạo mới, hai tab này hiện trạng thái
"Lưu sản phẩm trước để thêm ảnh và thành viên", giống cách `PageEditor` chỉ cho thiết
kế landing sau khi trang đã tồn tại.

### Tab 1 — Thông tin

| Trường | Control | Ghi chú |
|---|---|---|
| Tên | `TextField` | Bắt buộc |
| Slug | `TextField` | Tự sinh từ tên; sửa được; cảnh báo khi sửa slug đã xuất bản |
| Mô tả ngắn | `Textarea` | Dùng ở card danh sách và thẻ OG |
| Ảnh bìa | `ImageHandler` biến thể `Rounded` | Crop 16:9 |
| Danh mục | `CategoryMultiSelect` | Nhiều-nhiều, có nút tạo nhanh |
| Vòng đời | `Select` | Ý tưởng / Đang phát triển / Đã ra mắt |
| Phiên bản | `TextField` | Tự do, ví dụ `1.4.2` |
| Ngày ra mắt | `input[type=date]` | |
| Đối tượng | Chips chọn nhiều | Cá nhân / Nhóm / Doanh nghiệp |
| Nền tảng | Chips chọn nhiều | Web / iOS / Android / Desktop |
| Công nghệ | `StringListField` | Nhập tự do, Enter để thêm thẻ |
| Điểm nổi bật | `StringListField` nhiều dòng | Kéo thả đổi thứ tự |
| Nổi bật | `Switch` | Đẩy lên đầu danh sách trên site |
| Link sản phẩm | `TextField` | URL trang chính thức |
| Demo | `TextField` ×2 + `StringListField` | Link, cách truy cập, các bước dùng thử |

### Tab 2 — Nội dung

`RichTextEditor` (Tiptap) chiếm toàn bộ tab. Ảnh dán/chèn upload lên
`POST /products/{id}/upload` với `purpose=inline`; file mồ côi được GC khi lưu.

### Tab 3 — Gallery

Lưới thẻ kéo thả (`dnd-kit`, đã dùng ở Menu Builder). Mỗi thẻ: ảnh thu nhỏ hoặc
thumbnail video, ô caption sửa tại chỗ, nút xoá.

Hai nút thêm: `[+ Tải ảnh lên]` và `[+ Thêm video]` (hộp thoại nhập URL YouTube/Vimeo).
Thả chuột xong là gọi `PUT /media/order` ngay — không chờ bấm Lưu, vì thứ tự đã là trạng
thái trên server.

### Tab 4 — Thành viên

Danh sách kéo thả. Mỗi dòng: avatar + tên + ô `role` sửa tại chỗ + nút gỡ.
`[+ Thêm thành viên]` mở `cmdk` command palette tìm theo tên, ẩn người đã có trong danh
sách và người `is_active = false`.

Ô `role` để trống thì hiện placeholder là vai trò chung của người đó, báo cho người dùng
biết site sẽ hiển thị gì.

Lưu cả danh sách bằng một `PUT /members` khi bấm Lưu.

### Tab 5 — SEO

Tái dùng nguyên `PageSeoSection` của CMS — cùng bộ trường, cùng preview.

### Xuất bản

Nút `[Xuất bản ▾]` chỉ hiện với `products.publish`:

- **Xuất bản** → `POST /publish`, toast "Đã xuất bản", badge đổi sang Đã xuất bản
- **Gỡ xuất bản** → `POST /unpublish`
- **Lưu trữ** → `POST /archive`, có `ConfirmDialog`

`useUnsavedGuard` chặn rời trang khi form còn dirty, kể cả dirty từ tab Gallery.

---

## 5. Màn Danh mục sản phẩm — `/product-categories`

Danh sách phẳng kéo thả đổi thứ tự. Mỗi dòng: tên, slug, mô tả, số sản phẩm, nút sửa/xoá.
Tạo và sửa đều trong một `Dialog` — theo đúng kiểu màn `CmsTags`, không cần trang riêng
vì chỉ có bốn trường.

Hộp thoại xoá phải nêu số sản phẩm đang dùng: *"Xoá danh mục này? 4 sản phẩm sẽ bị gỡ
khỏi danh mục."* Không chặn xoá — liên kết tự cascade.

---

## 6. Màn Thành viên — `/members`, `/members/:id`

Danh sách dạng thẻ (không phải bảng) — nội dung chính là ảnh chân dung và vai trò,
bảng sẽ làm nó teo lại. Kéo thả đổi thứ tự hiển thị trên site.

Người `is_active = false` hiện mờ kèm nhãn "Đã ẩn", vẫn nằm trong danh sách.

Trình soạn gồm: `ImageHandler` biến thể `Circle` cho avatar, họ tên, slug, vai trò
chung, bio (`Textarea`), kỹ năng (`StringListField`), email, Zalo, danh sách link
(cặp nhãn + URL, kéo thả), công tắc `is_active`.

Khối chỉ-đọc ở cuối: **Sản phẩm đã tham gia** — lấy từ `GET /api/members/{id}`, mỗi
dòng là tên sản phẩm + vai trò trong sản phẩm đó, bấm vào mở trình soạn sản phẩm.

---

## 7. Component mới cần viết

Chỉ bốn cái; còn lại tái dùng hết.

| Component | Việc |
|---|---|
| `StringListField` | Danh sách chuỗi có thứ tự, kéo thả — dùng cho công nghệ, điểm nổi bật, các bước demo, kỹ năng |
| `GalleryPane` | Lưới ảnh/video kéo thả, caption sửa tại chỗ |
| `MemberPicker` | `cmdk` palette chọn thành viên + gán vai trò |
| `CategoryMultiSelect` | Chọn nhiều danh mục, có tạo nhanh |

`LifecycleBadge` và `ProductStatusBadge` là wrapper mỏng quanh `StatusBadge` sẵn có,
chỉ map giá trị sang màu.

---

## 8. i18n

Toàn bộ chuỗi đi qua `react-i18next`; `eslint-plugin-i18next` sẽ báo lỗi nếu hardcode.

Thêm hai namespace mới vào `locales/vi/translation.json` và `locales/en/translation.json`:
`products.*` và `members.*`. Thêm khoá nav: `nav.section.products`, `nav.products`,
`nav.product_categories`, `nav.members`.

Nhãn enum nằm ở i18n chứ không ở DB:

```
products.lifecycle.idea      "Ý tưởng"        / "Idea"
products.lifecycle.building  "Đang phát triển" / "In development"
products.lifecycle.launched  "Đã ra mắt"      / "Launched"
products.status.draft        "Nháp"           / "Draft"
products.status.published    "Đã xuất bản"    / "Published"
products.status.archived     "Lưu trữ"        / "Archived"
```

---

## 9. Test

Theo đúng mức hiện có của console (Vitest + Testing Library + MSW):

| Test | Khẳng định |
|---|---|
| `ProductList.test.tsx` | Lọc, phân trang, hiện đúng hai badge |
| `ProductEditor.test.tsx` | Bắt buộc tên; tab Gallery/Thành viên khoá khi tạo mới; lưu gửi đúng payload |
| `GalleryPane.test.tsx` | Đổi thứ tự gọi `PUT /media/order` |
| `MemberPicker.test.tsx` | Ẩn người đã chọn và người đã ẩn |
| `ProductCategories.test.tsx` | Hộp thoại xoá nêu số sản phẩm |
| `navItems.test.ts` | Section SẢN PHẨM ẩn khi không có quyền |

`navItems.test.ts` đã tồn tại và **sẽ phải sửa** khi thêm section mới — nó đang assert
chính xác danh sách section hiện ra theo từng bộ quyền.
