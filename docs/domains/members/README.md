# Domain: Members

Hồ sơ đội ngũ công khai của VELT. Là bounded context độc lập — không phụ thuộc module
nào, và là tiền đề của [products](../products/README.md).

---

## 1. Vì sao tách khỏi `users`

`users` là **danh tính đăng nhập console**: email, mật khẩu, 2FA, vai trò RBAC, phiên.
`members` là **hồ sơ marketing công khai**: ảnh chân dung, giới thiệu, kỹ năng, link
mạng xã hội, kênh liên hệ.

Trộn hai thứ này gây ba vấn đề cụ thể:

1. Người rời team vẫn phải giữ tài khoản đăng nhập chỉ để trang sản phẩm không vỡ
2. Thành viên không cần vào console (designer, cộng tác viên) vẫn bị cấp tài khoản
3. Mỗi lần sửa bio lại đụng vào bảng mang `password_hash` và `recovery_codes`

Không có cột liên kết `members.user_id`. Nếu sau này cần "tự sửa hồ sơ của mình" thì
thêm cột đó, nhưng hiện tại chưa có nhu cầu — admin sửa hộ.

---

## 2. Data model

```sql
CREATE TABLE members (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug        TEXT NOT NULL UNIQUE,      -- dùng cho link giới thiệu /?ref=<slug>
    full_name   TEXT NOT NULL,
    role        TEXT,                      -- vai trò chung: "Backend Engineer"
    bio         TEXT,
    avatar_path TEXT,                      -- members/<id>/avatar-<uuid>.webp
    email       TEXT,                      -- kênh liên hệ CÔNG KHAI, khác users.email
    zalo        TEXT,
    links       JSONB NOT NULL DEFAULT '[]',   -- [{"label":"GitHub","url":"https://..."}]
    skills      JSONB NOT NULL DEFAULT '[]',   -- ["Go","React"]
    sort_order  INT NOT NULL DEFAULT 0,
    is_active   BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_members_listing ON members (is_active, sort_order, full_name);
```

Khớp với shape mockup đang hardcode ở `mockup/src/content.js`:
`{ id, name, role, bio, skills, image, links, email, zalo }`.

Trường `color` của mockup **không** đưa vào DB — đó là biến trình bày, để site tự gán
theo thứ tự.

### `is_active` chứ không xoá

Người rời team đặt `is_active = false`. Họ biến mất khỏi site nhưng liên kết
`product_members` còn nguyên, nên lịch sử "ai đã làm sản phẩm này" không mất.

`DELETE` cứng chỉ dành cho bản ghi tạo nhầm; nó cascade xoá khỏi mọi sản phẩm.

---

## 3. Slug và link giới thiệu

Mockup đã dùng `/?ref=member-1` để giữ người tư vấn xuyên suốt phiên xem sản phẩm
(`mockup/src/outreach.js`). Khi site chuyển sang đọc API động, tham số `ref` sẽ mang
`members.slug` thay vì id cứng.

Sinh slug bằng `cms/shared/slug.go` (`Slugify` + `UniqueSlug`) từ `full_name`, cho phép
sửa tay. Slug đã công bố thì **không đổi** — đổi là gãy mọi link giới thiệu đã phát ra.
Console cảnh báo khi sửa slug của thành viên đang `is_active`.

---

## 4. Media

Prefix: `members/<member-id>/`

Dùng `OwnsMedia` trước khi lưu `avatar_path`, `DeleteOldMedia` khi thay ảnh,
`PurgeMediaTree` khi xoá cứng. Chi tiết ở
[products §5](../products/README.md#5-media-và-storage) — kể cả việc phải thêm
`"members/"` vào allowlist của `files.NewHandler` trong `cmd/api/main.go`.

Console dùng lại `ImageHandler` (upload + crop + camera) với biến thể `Circle`, giống
màn hình avatar tài khoản.

---

## 5. Quyền

| Mã | Cho phép |
|---|---|
| `members.view` | Xem danh sách + chi tiết trong console |
| `members.manage` | Tạo / sửa / xoá / đổi thứ tự |

API public không kiểm tra quyền, chỉ trả thành viên `is_active = true`.

---

## 6. Quan hệ với Products

`product_members (product_id, member_id, role, sort_order)` — xem
[products §4.3](../products/README.md#43-liên-kết-nhiều-nhiều).

Cột `role` nằm ở bảng nối: `members.role` là vai trò chung hiển thị ở trang đội ngũ,
còn `product_members.role` là vai trò trong đúng sản phẩm đó. Khi rỗng, site hiển thị
`members.role`.
