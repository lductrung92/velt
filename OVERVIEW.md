# Zukatek — mô tả định hướng

Tài liệu nền, ghi lại những gì đã chốt về Zukatek để người đọc sau (hoặc AI) không
phải đoán. Cập nhật qua phỏng vấn ngày 2026-10-11.

Quy ước: mục **Chưa quyết** ở cuối là thật — những chỗ đó cố tình bỏ trống chứ
không phải quên. Đừng tự điền.

---

## 1. Mục tiêu

Xây hệ sinh thái Zukatek gồm các sản phẩm phần mềm phục vụ cá nhân, nhóm, hộ kinh
doanh và doanh nghiệp.

**Nguồn thu**: sản phẩm đóng gói là chính, nhận thêm đặt hàng/tùy biến khi khách
cần. Tức là catalog sản phẩm — chứ không phải hồ sơ năng lực — mới là trung tâm.

**"Hệ sinh thái" nghĩa là chung thương hiệu, không chung hệ thống.** Mỗi sản phẩm
độc lập hoàn toàn: riêng tài khoản, riêng dữ liệu. Zukatek là cái tên chung để
khách tin tưởng. Hệ quả: *không* làm đăng nhập một lần (SSO), *không* có tầng dữ
liệu dùng chung giữa các sản phẩm. Nếu sau này đổi ý, đó là một quyết định lớn chứ
không phải mở rộng tự nhiên.

**Giai đoạn hiện tại**: chưa có sản phẩm nào chạy thật với người dùng ngoài. Website
và hệ quản trị làm trước. Vì vậy site lúc này là nơi tạo niềm tin và thu liên hệ,
chưa phải kênh bán hàng.

---

## 2. Đối tượng người dùng

Bốn nhóm: cá nhân, nhóm, hộ kinh doanh, doanh nghiệp.

**Không có nhóm khách chính ở cấp thương hiệu.** Mỗi sản phẩm nhắm một tệp riêng.
Đây là lựa chọn có chủ ý, không phải chưa nghĩ ra.

Hệ quả: "khách mục tiêu" là thuộc tính của *từng sản phẩm* (trường `audience`),
không phải của Zukatek. Trang chủ vì thế không nên viết theo kiểu nói với một
nhóm khách cụ thể.

---

## 3. Sản phẩm

**Quy mô 12 tháng tới**: 4–10 sản phẩm trên site.

**Đa dạng theo cả ba trục cùng lúc**, chưa có trục nào là chính:

| Trục | Ví dụ |
|---|---|
| Ngành nghề | quán ăn, phòng khám, cửa hàng… |
| Nghiệp vụ | bán hàng, kế toán, chấm công, chăm khách… |
| Hình thái | web app, app điện thoại, tiện ích nhỏ, API/AI agent |

Hai trục *nghiệp vụ* và *hình thái* đã có chỗ riêng trong dữ liệu sản phẩm
(`audience`, `platforms`, `tech_stack`), nên **danh mục nên dành cho trục còn lại**
thay vì lặp lại những gì các trường kia đã nói.

**Bốn danh mục đang có trong database (Cộng tác / Công cụ cá nhân / Quản lý & vận
hành / AI & tự động hoá) chỉ là dữ liệu mẫu, cần bỏ.** Chưa đặt danh mục mới: với
4–10 sản phẩm và chưa có trục chính, phân loại nên mọc ra từ sản phẩm thật chứ
không nên nghĩ trước.

**Bán hàng tách riêng.** Mỗi sản phẩm một hình thức: thuê bao, license, mua đứt…
Vì vậy module sản phẩm cố ý *không* có giá, gói, đơn hàng hay thanh toán.

---

## 4. Quy trình vận hành

### Từ khách tới người dùng

**Tùy sản phẩm, mỗi thứ một kiểu**: sản phẩm nhỏ cho tự đăng ký, sản phẩm lớn bắt
buộc qua tư vấn. Không có một phễu dùng chung.

Hệ quả: trang chi tiết sản phẩm phải tự nói được "muốn dùng thì làm gì tiếp theo",
và câu trả lời khác nhau giữa các sản phẩm.

### Cơ chế giới thiệu

Mỗi thành viên có link riêng (`?ref=`) để tự chia sẻ lên Facebook/Zalo. Khách vào
qua link đó thì site hiện "qua giới thiệu của X" và biết liên hệ đích danh ai.

**Không tính hoa hồng, không đo KPI.** Nên không cần lưu vết, không cần báo cáo,
không cần trang thống kê. Thứ cần là mỗi thành viên có kênh liên hệ công khai
(email/Zalo) và sản phẩm có cờ `forwardReferral` để chuyển tham số sang ứng dụng.

### Ai vận hành

**Cả team.** Mỗi thành viên tự cập nhật hồ sơ và kỹ năng của mình; một người quản
phần còn lại (sản phẩm, bài viết, danh mục).

> **Hệ thống hiện chưa làm được việc này.** Xem §7.

---

## 5. AI tư vấn và CRM

Hướng đã chốt (2026-10-11), thiết kế chi tiết ở
[docs/domains/ai](docs/domains/ai/README.md) và
[docs/domains/crm](docs/domains/crm/README.md).

- **Trợ lý tư vấn trên site**, bám theo catalog đã xuất bản. Được bàn chuyện
  nghiệp vụ chung rồi dẫn về sản phẩm phù hợp — không chỉ đọc thuộc catalog.
- **Không bao giờ nói về giá.** Chặn bằng cách không đưa dữ liệu giá vào, chứ
  không bằng lời dặn trong prompt.
- **Lead là đầu ra**, tự gán cho thành viên giới thiệu qua `?ref=`. Đây là chỗ
  cơ chế giới thiệu ở §4 cuối cùng được nối vào.
- **Người thật nhận máy ngay trong cửa sổ chat đó.** Phần nặng nhất của cả
  module, nặng hơn con bot.
- **MCP chỉ dành cho nội bộ team** (Claude Desktop tra catalog, lead). Chatbot
  trên site *không* đi qua MCP — cùng một process thì gọi thẳng.

---

## 6. Chưa quyết

- **Triển khai sản phẩm ở đâu**: Zukatek tự host, giao khách tự chạy, hay có app
  cài trên máy/điện thoại — chưa quyết, tính sau khi có sản phẩm thật.
- **Danh mục sản phẩm**: bỏ bộ mẫu, chưa có bộ mới.
- **Mô hình bán của từng sản phẩm**: thuê bao / license / mua đứt — quyết theo
  từng sản phẩm, khi làm module bán hàng.

---

## 7. Khoảng trống giữa định hướng và hệ thống

Phát hiện khi đối chiếu câu trả lời phỏng vấn với code. Chưa sửa.

**Thành viên không tự sửa được hồ sơ của mình.** Bảng `members` (hồ sơ đội ngũ) và
bảng `users` (tài khoản đăng nhập) là hai thực thể rời, không có cột nối. Quyền
`members.manage` lại là tất-cả-hoặc-không: ai sửa được hồ sơ mình thì đồng thời
sửa và **xoá** được hồ sơ người khác.

Muốn đúng như §4 thì cần ba thứ: tài khoản console cho từng thành viên, một cột
nối `members.user_id`, và một quy tắc quyền giới hạn trong phạm vi bản thân.

Giải pháp tạm chấp nhận được với team nhỏ tin nhau: cấp `members.manage` cho tất
cả và dựa vào thoả thuận. Nên biết là đang chọn như vậy, chứ không phải tưởng hệ
thống đã chặn.
