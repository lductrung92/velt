# Domain: CRM

Bounded context quản lý khách tiềm năng. Hiện chỉ có **leads** — cố ý nhỏ.

- Nguồn sinh lead: [docs/domains/ai/README.md](../ai/README.md)
- Người được giao lead: [docs/domains/members/README.md](../members/README.md)
- Bối cảnh kinh doanh: [OVERVIEW.md](../../../OVERVIEW.md)

---

## 1. Vì sao dựng context riêng ngay bây giờ

CRM đầy đủ là chuyện tương lai, nhưng **lead phải có chỗ ở ngay** khi chatbot bắt
đầu thu khách. Hai lựa chọn:

| | Hệ quả |
|---|---|
| Để lead trong module `ai` | Ít việc lúc này, nhưng khi làm CRM thật phải migration dữ liệu đang chạy |
| Dựng `crm` tối thiểu ngay | Thêm một context, nhưng lead nằm đúng chỗ từ đầu |

**Chọn cách hai.** Lead là tài sản kinh doanh có vòng đời riêng, dài hơn hội
thoại sinh ra nó. Hội thoại là *một sự kiện*; lead là *một mối quan hệ*. Trộn hai
thứ rồi tách sau là loại việc luôn đắt hơn dự tính.

Giữ nhỏ: context này **chỉ có leads**. Không pipeline, không deal, không báo giá,
không công việc, không nhắc hẹn. Những thứ đó thêm khi có nhu cầu thật.

---

## 2. Lead là gì ở đây

Một người đã để lại dấu hiệu quan tâm và có cách liên hệ lại.

Không phải lead: một lượt truy cập, một hội thoại hỏi bâng quơ rồi đi. Hội thoại
vẫn được lưu bên `ai`, nhưng **không** đẻ ra lead nếu không có ý định liên hệ.
Ranh giới này giữ cho danh sách lead còn đáng nhìn.

---

## 3. Hình dạng dữ liệu

```
leads
  id, name, email, phone, zalo,
  source (chat|form|manual), conversation_id,
  assigned_member_id, status, note,
  interested_product_ids, created_at, updated_at
```

- **Ít nhất một kênh liên hệ** (email, phone hoặc zalo) là bắt buộc. Lead không
  liên hệ lại được thì không phải lead.
- `source = chat` kèm `conversation_id` để mở lại đúng cuộc nói chuyện. Đây là
  thứ người bán cần nhất khi gọi lại: biết khách đã hỏi gì.
- `interested_product_ids`: nhiều-nhiều, vì khách thường phân vân giữa vài thứ.
- `assigned_member_id`: xem §4.

---

## 4. Giao cho ai

Theo OVERVIEW §4, mỗi thành viên có link giới thiệu riêng (`?ref=`), và mục đích
là **để khách biết hỏi ai** — không phải để tính hoa hồng.

Quy tắc giao:

1. Hội thoại có `referrer_member_id` thì lead về đúng thành viên đó.
2. Không có thì lead vào **hàng chờ chung**, ai nhận cũng được.

Không có lead nào được phép rơi khỏi hai nhánh này. Một lead không ai sở hữu là
một lead chết.

---

## 5. Trạng thái

```
 new ──> contacted ──> qualified ──> won
  │          │             │
  └──────────┴─────────────┴───────> lost
```

Năm trạng thái, cố ý ít. Mỗi lần thêm một trạng thái là thêm một lần người dùng
phải đoán nên chọn cái nào.

`lost` cần ghi lý do trong `note` — vì sau này nhìn lại, biết vì sao mất khách
đáng giá hơn biết đã mất bao nhiêu.

---

## 6. Quyền

| Quyền | Cho ai |
|---|---|
| `crm.leads.view` | xem lead của mình và hàng chờ chung |
| `crm.leads.manage` | tạo, sửa, gán, đổi trạng thái |
| `crm.leads.view_all` | xem toàn bộ lead của mọi người |

Tách `view` và `view_all` ngay từ đầu: team nhỏ thì ai cũng xem được, nhưng khi
đông lên thì việc một người bán thấy hết khách của người khác là chuyện cần cân
nhắc, không nên mặc định.

> **Lưu ý về quyền thành viên**: hiện bảng `members` không nối với `users` (xem
> OVERVIEW §7), nên "lead của mình" chưa có cách xác định chắc chắn. Phải xử lý
> chỗ nối đó trước khi `crm.leads.view` có nghĩa thật.

---

## 7. Phạm vi để sau

Ghi ra để biết là đã nghĩ tới và cố ý chưa làm:

- Pipeline, deal, giá trị hợp đồng — chờ module bán hàng
- Lịch sử tương tác ngoài chat (gọi điện, gặp mặt)
- Nhắc hẹn, công việc, lịch
- Nhập/xuất danh sách
- Báo cáo, biểu đồ chuyển đổi
