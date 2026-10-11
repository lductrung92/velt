# API: AI tư vấn

Hợp đồng HTTP cho module AI. Thiết kế đi kèm:
[docs/domains/ai/README.md](../domains/ai/README.md).

Ba nhóm mặt tiếp xúc, ba mô hình xác thực khác nhau:

| Nhóm | Tiền tố | Xác thực |
|---|---|---|
| Khách trên site | `/api/public/chat` | không, nhận diện bằng `visitor_key` trong cookie |
| Người trực trong console | `/api/chat` | token người dùng như mọi route console |
| Client MCP | `/api/mcp` | token cấp tay, nội bộ |

---

## 1. Khách trên site

### `POST /api/public/chat/conversations`

Mở hội thoại. Trả `id` và đặt cookie `visitor_key` nếu chưa có.

```json
{ "ref": "an-nguyen", "page": "/products/bang-cong-viec" }
```

`ref` là slug thành viên giới thiệu, lấy từ `?ref=` trên URL. Sai hoặc không có
thì bỏ qua, không báo lỗi — khách không chịu trách nhiệm cho link hỏng.

`page` để bot biết khách đang xem gì mà mở lời cho đúng.

### `POST /api/public/chat/conversations/{id}/messages`

Gửi một tin nhắn. Chỉ chủ `visitor_key` của hội thoại đó mới gửi được.

```json
{ "content": "Quán tôi 3 chi nhánh, quản kho đang rối" }
```

Giới hạn độ dài. Vượt trần lượt của hội thoại thì trả `429`.

Trả `202` ngay; câu trả lời đi qua đường stream chứ không qua response này.

### `GET /api/public/chat/conversations/{id}/stream`

SSE. Đây là đường duy nhất chữ chảy về khách — cả chữ của AI lẫn của người thật.

| Sự kiện | Nghĩa |
|---|---|
| `delta` | một mẩu chữ đang sinh |
| `message` | một tin nhắn hoàn chỉnh (AI, người thật, hoặc hệ thống) |
| `state` | trạng thái hội thoại đổi — xem domain §5 |
| `error` | hỏng, kèm `code` |

Client **phải** xử lý `state`: khi chuyển sang `waiting`/`human` thì ngừng chờ
chữ của AI và đổi giao diện cho đúng sự thật.

Mất kết nối thì kết nối lại kèm `Last-Event-ID` để nhận bù phần đã lỡ.

### `POST /api/public/chat/conversations/{id}/handoff`

Khách xin gặp người thật. Chuyển trạng thái sang `waiting`.

Nếu không ai đang trực, phản hồi nói rõ điều đó — không để khách chờ vô vọng.

### Suy biến

Khi LLM hỏng hoặc chạm trần ngân sách ngày, các endpoint trên **vẫn trả 200** và
hội thoại chạy bằng bot keyword cũ. Kèm cờ:

```json
{ "degraded": true }
```

Site dùng cờ này để nói thật với khách rằng đang ở chế độ trả lời mẫu. **Không
trả 5xx** — người dùng không cần biết hoá đơn của mình.

---

## 2. Người trực trong console

Mọi route cần quyền `ai.chat.handle`.

| Method | Path | Việc |
|---|---|---|
| `GET` | `/api/chat/conversations` | hàng chờ và hội thoại đang sống, lọc theo trạng thái |
| `GET` | `/api/chat/conversations/{id}` | transcript đầy đủ, kèm lead nếu có |
| `GET` | `/api/chat/stream` | SSE: hội thoại mới vào hàng chờ, tin nhắn mới |
| `POST` | `/api/chat/conversations/{id}/claim` | nhận, chuyển sang `human` |
| `POST` | `/api/chat/conversations/{id}/messages` | trả lời với tư cách người thật |
| `POST` | `/api/chat/conversations/{id}/release` | trả lại cho bot |
| `POST` | `/api/chat/presence` | báo đang trực; hết hạn thì tự coi là vắng |

`claim` phải **chống tranh chấp**: hai người bấm cùng lúc thì một người thắng,
người kia nhận `409`. Hai người cùng trả lời một khách mà không biết nhau là lỗi
khó chịu hơn nhiều so với một thông báo xung đột.

---

## 3. MCP

### `POST /api/mcp`

Endpoint MCP, JSON-RPC. Xác thực bằng token cấp tay, ánh xạ về một user thật —
tool chạy dưới **quyền của user đó**, không phải quyền của token.

Tool giai đoạn đầu:

| Tool | Quyền đòi | Việc |
|---|---|---|
| `search_products` | `products.view` | tìm trong catalog đã xuất bản |
| `get_product` | `products.view` | chi tiết một sản phẩm |
| `list_members` | `members.view` | danh sách đội ngũ |
| `list_leads` | `crm.leads.view` | lead, lọc theo trạng thái và người được giao |
| `get_conversation` | `ai.chat.handle` | transcript một hội thoại |

**Không có tool ghi ở giai đoạn đầu.** Thêm khi có nhu cầu thật, từng cái một,
mỗi cái cân nhắc riêng — một client MCP là một agent, và agent sai thì ghi sai
hàng loạt.

---

## 4. Lỗi

Theo đúng khuôn lỗi sẵn có của dự án. Mã riêng của module:

| Mã | Khi nào |
|---|---|
| `conversation_closed` | gửi vào hội thoại đã đóng |
| `turn_limit_reached` | hội thoại vượt trần lượt |
| `already_claimed` | hai người cùng nhận một hội thoại |
| `no_staff_online` | xin người thật nhưng không ai trực |
