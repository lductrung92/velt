# Domain: AI tư vấn

Thiết kế trợ lý tư vấn khách hàng cho site Zukatek. Đọc file này trước khi viết
migration hoặc code.

- Hợp đồng HTTP: [docs/apis/ai-api.md](../../apis/ai-api.md)
- Lead và vòng đời khách: [docs/domains/crm/README.md](../crm/README.md)
- Nguồn dữ liệu sản phẩm: [docs/domains/products/README.md](../products/README.md)
- Bối cảnh kinh doanh: [OVERVIEW.md](../../../OVERVIEW.md)

---

## 1. MCP nằm ở đâu — đọc mục này trước

MCP (Model Context Protocol) là giao thức để **một LLM client khám phá và gọi tool
từ một server**. Có hai chỗ có thể đặt nó, và chỉ một chỗ là đúng.

**Chatbot trên site KHÔNG nói chuyện với backend qua MCP.** Chatbot và dữ liệu
nằm chung một process Go. Đẩy qua MCP là thêm một chặng JSON-RPC, thêm vòng đời
phiên, thêm chỗ hỏng — để lấy dữ liệu vốn cách một lời gọi hàm. Thứ điều khiển
hội thoại là **tool-use của chính LLM API**; MCP chỉ là cách *chạm tới* phần cài
đặt của tool.

**Zukatek là MCP server cho client bên ngoài.** Team mở Claude Desktop / Claude
Code hỏi "tuần này có lead nào", agent nội bộ sau này — client không do mình
viết, nên cần giao thức chuẩn. Giai đoạn đầu **chỉ cấp cho nội bộ team**.

```
                     ┌─ chatbot site  → gọi thẳng, in-process, identity ẩn danh
 registry tool ──────┤
 (một bản cài đặt)   └─ MCP server    → Claude Desktop, identity người thật
```

**Một registry, hai identity, hai allowlist khác nhau.** Mỗi tool khai báo quyền
nó đòi; mỗi rìa quyết định chạy dưới danh nghĩa ai và được gọi tool nào.

| | Chatbot site | MCP server |
|---|---|---|
| Identity | ẩn danh (khách) | user thật, quyền thật |
| Tool đọc | catalog, thành viên | thêm lead, hội thoại |
| Tool ghi | **duy nhất** `create_lead` | theo quyền của user |
| Xác thực | không | token cấp tay |

---

## 2. Phạm vi

**Trong phạm vi**

- Hội thoại tư vấn trên site, có streaming
- Trả lời bám theo catalog đã xuất bản
- Hỏi lại nhu cầu (quy mô, ngành, vấn đề đang gặp) và ghi vào lead
- Sinh lead, tự gán cho thành viên giới thiệu
- Chuyển cho người thật, người thật trả lời ngay trong cửa sổ chat đó
- MCP server nội bộ

**Ngoài phạm vi (cố ý)**

| Việc | Vì sao |
|---|---|
| Giá, báo giá, điều kiện hợp đồng | Không có dữ liệu giá — xem §4 |
| Tư vấn pháp lý, thuế, y tế | Ngoài năng lực, rủi ro thật |
| Vector DB, embedding, RAG | 4–10 sản phẩm vừa prompt — xem §3 |
| Hứa hẹn tiến độ, cam kết triển khai | Chỉ người thật được hứa |
| Đa ngôn ngữ | Tiếng Việt trước; chưa có nhu cầu |

---

## 3. Nguồn dữ liệu: không có RAG

Với 4–10 sản phẩm, **toàn bộ catalog đã xuất bản nhét vừa một prompt** (~5k
token). Dựng hạ tầng truy hồi ở quy mô này là tự tạo việc.

Đọc từ cột **`products.published_snapshot`** — bản đông lạnh đúng bằng thứ site
công khai. Hệ quả quan trọng: bot **không bao giờ thấy bản nháp**, nên không lỡ
miệng về sản phẩm chưa công bố.

**Khi nào đổi**: vượt khoảng 30 sản phẩm thì chuyển sang tool tìm kiếm
(`search_products` nhận từ khoá, trả vài bản tóm tắt). Vẫn **không** cần vector
DB — tìm kiếm toàn văn của Postgres đủ cho quy mô này.

---

## 4. Giới hạn cứng

**Giá: chặn bằng vắng dữ liệu, không bằng lời dặn.** Module sản phẩm cố ý không
có giá (mỗi sản phẩm bán một kiểu — xem OVERVIEW §3). Model không bịa được thứ
nó không được đưa. Đây là cơ chế bảo vệ mạnh hơn mọi câu "đừng nói về giá" trong
system prompt. **Không đưa dữ liệu giá vào context kể cả khi module bán hàng ra
đời** — lúc đó phải thiết kế lại mục này một cách có chủ ý.

**Tư vấn nghiệp vụ: được, nhưng có biên.** Bot được bàn chuyện chung ("quán ăn
nên quản kho thế nào") rồi dẫn về sản phẩm phù hợp. Biên:

- Nói ở mức kinh nghiệm chung, không phải tư vấn pháp lý/thuế/y tế
- Mọi phát biểu **về sản phẩm Zukatek** phải bắt nguồn từ snapshot
- Không chê sản phẩm đối thủ đích danh
- Không chắc thì nói không chắc và chuyển người thật

**Prompt injection: chặn bằng giới hạn năng lực.** Khách là nguồn không tin được.
Cách chặn không phải van xin trong prompt mà là bot trên site chỉ có tool
**chỉ-đọc** cộng đúng một thao tác ghi (`create_lead`). Có bị dụ cũng không làm
được gì ngoài phạm vi đó.

**Đường lùi: giữ bot keyword hiện có.** `src/site/app/components/Chat.tsx` đang
trả lời bằng so khớp từ khoá. Giữ nguyên làm tầng suy biến: LLM hỏng, quá ngân
sách, hoặc quá rate limit thì rơi về nó thay vì chết hẳn.

---

## 5. Vòng đời hội thoại

Một hội thoại có **đúng một trạng thái**, và trạng thái quyết định ai được nói.

```
 bot     ──(khách xin gặp người, hoặc bot thấy nên chuyển)──>  waiting
 waiting ──(một thành viên nhận)────────────────────────────>  human
 human   ──(thành viên trả lại)─────────────────────────────>  bot
 bất kỳ  ──(hết hạn / khách đóng)───────────────────────────>  closed
```

| Trạng thái | AI sinh câu trả lời? | Ai nói |
|---|---|---|
| `bot` | có | AI |
| `waiting` | **không** | chỉ thông báo chờ |
| `human` | **không** | thành viên đã nhận |
| `closed` | không | — |

**Tính chất phải giữ bằng mọi giá: khi `state != bot`, AI không được sinh thêm
một chữ nào.** Đây là lỗi dễ xảy ra nhất của loại hệ thống này — khách đang nói
với người thật thì bot chen vào. Kiểm tra trạng thái phải nằm ở *thời điểm phát
từng đoạn stream*, không chỉ ở lúc bắt đầu.

**Không có ai trực**: nếu không thành viên nào online, bot nói thẳng là hiện
không có người, thu thông tin liên hệ và tạo lead. Không để khách chờ vô vọng.

---

## 6. Hình dạng dữ liệu

```
ai_conversations
  id, state, visitor_key, referrer_member_id, lead_id,
  claimed_by_user_id, claimed_at, last_activity_at, created_at

ai_messages
  id, conversation_id, role (visitor|assistant|staff|system),
  author_user_id, content, token_in, token_out, created_at

ai_usage_daily
  day, conversations, tokens_in, tokens_out, estimated_cost
```

- `visitor_key`: khoá ẩn danh trong cookie, **không phải tài khoản**. Khách không
  đăng nhập để chat.
- `referrer_member_id`: lấy từ `?ref=` — xem §7.
- `role = staff` kèm `author_user_id`: phân biệt câu của người thật với câu của
  AI, để đọc lại transcript còn biết ai nói.
- `ai_usage_daily`: chặn trần ngân sách mà không phải quét bảng message.

---

## 7. Người giới thiệu thành người được giao lead

Site đã có sẵn cơ chế `?ref=`: khách vào qua link của một thành viên thì hiện
"qua giới thiệu của X". Cơ chế này **đã dựng xong một nửa mà chưa nối vào đâu**.

Nối nốt: `conversation.referrer_member_id` dẫn tới lead **tự gán cho đúng thành
viên đó**. Không có `?ref=` thì lead vào hàng chờ chung.

Theo OVERVIEW §4, cơ chế giới thiệu **không tính hoa hồng, không đo KPI** — nên
không cần lưu vết nhiều tầng, không cần trang thống kê. Chỉ cần gán đúng người.

---

## 8. Chống lạm dụng và chi phí

Một endpoint LLM công khai là chỗ đốt tiền và là bia cho bot cào.

| Lớp | Biện pháp |
|---|---|
| Theo IP | dùng limiter đã có trong `main.go` |
| Theo hội thoại | trần số lượt và trần token mỗi hội thoại |
| Theo ngày | **trần ngân sách**; chạm trần thì rơi về bot keyword |
| Theo nội dung | độ dài tối đa mỗi tin nhắn |

Khoá API đặt trong `system_settings` dạng **secret đã mã hoá** (`GetSecret`, cùng
đường với `mail.smtp_password`), **không** để trong file có thể commit.

**Model**: `claude-sonnet-5-5` cho hội thoại (chất lượng tiếng Việt và khả năng
tư vấn), `claude-haiku-5-5` cho phân loại rẻ tiền (nhận biết ý định liên hệ,
định tuyến). Không fine-tune, không agent framework.

---

## 9. Kết cấu module

```
internal/modules/ai/
  shared/         sentinel, Base (cổng phân quyền), như mọi context khác
  conversation/   bảng + máy trạng thái + hub realtime + SSE
  tools/          registry tool, mỗi tool khai quyền nó đòi
  provider/       client LLM, streaming, bộ đếm ngân sách
  mcp/            adapter MCP trên tools/, xác thực token, nội bộ
```

Phụ thuộc **một chiều**, qua port như tiền lệ `landing/pages_port.go` và
`widgets.Ports`:

```
ai ──> products  (đọc published_snapshot)
ai ──> members   (đọc roster công khai)
ai ──> crm       (tạo lead)
```

Không có chiều ngược lại. `products` và `members` không biết `ai` tồn tại.

---

## 10. Realtime: cái giá thật

Chat người thật ngay trên site là **phần nặng nhất của cả module**, nặng hơn con
bot. Nói rõ ở đây để không ai bất ngờ.

**Vận chuyển**: SSE xuống, POST lên. Không dùng WebSocket: streaming của LLM đã
cần SSE rồi, dùng lại một đường thì ít thứ phải nuôi hơn, và SSE đi qua proxy dễ
hơn.

**Hub trong process**: bản đồ `conversation → các subscriber`. Đủ cho một
instance.

> **Giới hạn phải biết**: hub nằm trong RAM của một process. Chạy từ hai instance
> trở lên thì tin nhắn của người thật ở instance A không tới được khách đang cắm
> SSE vào instance B. Lúc đó cần Redis pub/sub (Redis đã là tuỳ chọn sẵn có trong
> `buildLimiter`). **Chưa làm bây giờ**, nhưng đừng để quên khi scale.

**Phía console**: cần một màn hộp thư — danh sách hội thoại đang sống, nhận
(claim), trả lời, xem transcript, thấy lead. Đây là một màn hình mới hoàn chỉnh
chứ không phải một nút.

**Trực tuyến/vắng mặt**: cần biết thành viên nào đang mở console, để bot nói đúng
sự thật về việc có người hay không.

---

## 11. Thứ tự làm

| Bước | Việc | Nghiệm thu |
|---|---|---|
| 0 | API public cho sản phẩm (**đang treo**) | `curl` trả đúng sản phẩm `published` |
| 1 | `crm/leads` tối thiểu | tạo/xem/gán lead qua API |
| 2 | `ai/conversation` + `provider` + `tools`, chatbot SSE | hỏi về sản phẩm, trả lời bám snapshot, không nói giá |
| 3 | Sinh lead và gán theo `?ref=` | hội thoại có ý định liên hệ thì lead về đúng người |
| 4 | Console hộp thư + chuyển người thật | nhận hội thoại, AI im, hai bên nói được |
| 5 | MCP server nội bộ | Claude Desktop tra được catalog và lead |

Bước 0 không bắt buộc cho bot (bot đọc snapshot in-process), nhưng site thì cần,
và cả hai ăn chung một nguồn — làm trước thì gọn hơn.

---

## 12. Những chỗ dễ sai

- **AI chen lời khi người thật đã nhận.** Kiểm trạng thái ở từng đoạn stream.
- **Bot đọc nhầm bản nháp.** Chỉ đọc `published_snapshot`, không đọc bảng gốc.
- **Nói về giá.** Đừng đưa dữ liệu giá vào context, kể cả sau này.
- **Hub trong RAM khi chạy nhiều instance.** Xem §10.
- **Lead mồ côi.** Không có `?ref=` vẫn phải vào hàng chờ chung, không được rơi.
- **Chạm trần ngân sách mà không suy biến.** Phải rơi về bot keyword, không lỗi.
