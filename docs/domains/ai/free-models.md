# Model miễn phí và chuyện xoay vòng khi hết hạn mức

Tài liệu khảo sát, viết trước khi code. Trả lời hai câu hỏi: **lấy key ở đâu**, và
**có xây được cơ chế tự chuyển model khi hết hạn mức không** (xây được, nhưng
không theo cách người ta hay tưởng — đọc §4).

Số liệu hạn mức trong tài liệu này **đổi liên tục**. Mỗi con số đều ghi nguồn và
cách tự kiểm lại; đừng tin số, hãy chạy lại lệnh.

- Thiết kế trợ lý: [README.md](README.md)
- Cấu hình hiện tại: Console → Cài đặt → AI (`ai.provider`, `ai.base_url`,
  `ai.api_key`, `ai.model`)

---

## 1. Lấy key

Cả hai đều tương thích OpenAI, nên chỉ cần điền vào `ai.base_url` + `ai.api_key`
là backend dùng được ngay, **không sửa code** — adapter `openai` đã có sẵn.

### Groq — `https://api.groq.com/openai/v1`

1. Đăng ký tại `console.groq.com` (không cần thẻ tín dụng)
2. Vào mục **API Keys** → tạo key mới
3. Key chỉ hiện **một lần**, copy ngay

Hạn mức free xem tại `console.groq.com/settings/limits` — đó là nguồn đúng duy
nhất, các trang blog đều lệch nhau.

Hai điểm phải nhớ:

- **Hạn mức tính theo tổ chức, không theo key.** Tạo 5 key không được 5 lần hạn
  mức. ([Groq rate limits](https://console.groq.com/docs/rate-limits))
- Groq tuyên bố không lưu input/output mặc định — nên hợp với dữ liệu khách hàng
  hơn free tier của Gemini (bên đó dùng prompt để huấn luyện).

### OpenRouter — `https://openrouter.ai/api/v1`

1. Đăng ký tại `openrouter.ai`
2. Vào **Keys** → tạo key
3. Model miễn phí là những model có id kết thúc bằng `:free`

Hạn mức model free phụ thuộc **tổng số credit đã từng mua**, không phải số dư
hiện tại:

| Đã mua (tổng cộng) | Request/phút | Request/ngày |
|---|---|---|
| Dưới 10 USD | 20 | **50** |
| Từ 10 USD trở lên | 20 | **1.000** |

Nạp một lần 10 USD là trần ngày nhảy từ 50 lên 1.000 **vĩnh viễn**. Với khối
lượng của chatbot thì đây gần như là khoản bắt buộc.
([OpenRouter limits](https://openrouter.ai/docs/api-reference/limits))

---

## 2. Biết được gì về hạn mức — và không biết được gì

Đây là chỗ quyết định toàn bộ thiết kế ở §4. **Hai nhà cung cấp lộ thông tin
khác hẳn nhau.**

### Groq: chỉ biết SAU khi gọi

Không có endpoint nào hỏi hạn mức. Thông tin nằm ở **header của chính response**:

| Header | Nghĩa |
|---|---|
| `x-ratelimit-limit-requests` | trần request/ngày |
| `x-ratelimit-remaining-requests` | còn lại trong ngày |
| `x-ratelimit-limit-tokens` | trần token/phút |
| `x-ratelimit-remaining-tokens` | token còn lại trong phút |
| `x-ratelimit-reset-requests` | bao lâu nữa reset trần ngày |
| `x-ratelimit-reset-tokens` | bao lâu nữa reset trần phút |
| `retry-after` | **chỉ có khi 429**, tính bằng giây |

Hệ quả: **không thể "kiểm tra hạn mức rồi mới chọn model"** với Groq. Muốn biết
còn bao nhiêu thì phải gọi — mà gọi thì đã tiêu mất một request.

### OpenRouter: hỏi trước được, nhưng không theo từng model

`GET /api/v1/key` (kèm `Authorization: Bearer <key>`) trả về, trong `data`:

- `free_model_daily_requests`: `{ used, limit, remaining }` cho ngày UTC hiện tại
- `limit`, `limit_remaining`, `usage`, `usage_daily/weekly/monthly`
- `budgets`, `effective_budget` — ngân sách nào sẽ chặn trước

**Nhưng `free_model_daily_requests` là bộ đếm chung cho toàn bộ model free của cả
tài khoản**, không phải từng model. Nó trả lời "hôm nay còn bao nhiêu lượt free",
không trả lời "model A còn, model B hết".

> **Kết luận quan trọng:** dữ liệu để xây "quét hạn mức từng model rồi xếp hạng
> ưu tiên" **không tồn tại ở cả hai bên**. Thiết kế phải dựa trên *phản ứng khi
> bị từ chối*, không dựa trên *dự đoán trước*.

---

## 3. Model miễn phí nào gọi được tool

Chatbot sống bằng tool-calling. Model không gọi tool sẽ **bịa sản phẩm và giá**
thay vì tra catalog — đây không phải lỗi nhỏ, đây là nói dối khách hàng.

### OpenRouter: liệt kê được bằng máy

Catalogue công khai, không cần key. Lệnh này in ra danh sách model **miễn phí và
có `tools`**, chạy lại bất cứ lúc nào để cập nhật:

```bash
curl -s https://openrouter.ai/api/v1/models | python -X utf8 -c "
import json,sys
d=json.load(sys.stdin)['data']
def free(m):
    p=m.get('pricing') or {}
    return float(p.get('prompt','1') or 1)==0 and float(p.get('completion','1') or 1)==0
ft=[m for m in d if 'tools' in (m.get('supported_parameters') or []) and free(m)]
for m in sorted(ft, key=lambda x:-(x.get('context_length') or 0)):
    print(f\"{m['id']:<52} ctx={m.get('context_length')}\")
"
```

Tại thời điểm khảo sát: **465 model, 394 hỗ trợ tools, 15 vừa miễn phí vừa hỗ trợ
tools**. Vài cái context lớn nhất:

```
thinkingmachines/inkling:free                 ctx=1048576
nvidia/nemotron-3.5-lightning:free            ctx=1000000
google/gemma-4-31b-it:free                    ctx=262144
cohere/north-mini-code:free                   ctx=256000
openrouter/free                               ctx=200000
```

### Kết quả đo thật (2026-10-16)

Đo bằng chính `POST /api/ai/test`, **6 lượt mỗi model**, trên tài khoản free.

| Model (Groq) | Gọi được tool | Độ trễ TB |
|---|---|---|
| `qwen/qwen3.8-27b` | **6/6** | **616 ms** |
| `openai/gpt-oss-120b` | 4/6 | 1.261 ms |
| `openai/gpt-oss-20b` | 4/6 | 945 ms |

| Model (OpenRouter free) | Kết quả |
|---|---|
| `openrouter/free` | gọi được tool, nhưng **16.639 ms** |
| `google/gemma-4-31b-it:free` | HTTP 429 |
| `nvidia/nemotron-3.5-lightning:free` | kết nối được nhưng **không gọi tool** |
| `thinkingmachines/inkling:free` | HTTP 403 |

Ba kết luận rút ra, cái thứ hai quan trọng nhất:

1. **Groq hơn hẳn OpenRouter cho chatbot.** Nhanh hơn 20–25 lần, và không bị
   429/403 ngay lần thử đầu.
2. **Gọi tool là XÁC SUẤT, không phải có/không.** Cùng một model, cùng một câu
   hỏi: lần gọi tool, lần không. `gpt-oss-120b` trượt 2/6 lần — nghĩa là cứ 3
   câu hỏi thì có 1 câu chatbot **trả lời bịa thay vì tra catalog**. Một phép
   thử duy nhất không đủ kết luận; phải chạy nhiều lượt và tính tỉ lệ.
3. **Model to hơn không chắc tốt hơn ở việc này.** `qwen3.8-27b` nhỏ hơn nhưng
   gọi tool chuẩn 6/6 và nhanh nhất.

Danh sách model Groq cũng khác hẳn các blog: tài khoản thử nghiệm chỉ có **11
model, trong đó 4 cái dùng để chat** (phần còn lại là whisper, TTS, prompt-guard).
**Không có `llama-3.3-70b-versatile`** như các bài viết 2026 vẫn nhắc. Luôn gọi
`GET /models` để biết tài khoản mình thực sự có gì.

### Groq: phải thử từng cái

Groq không công bố trường nào nói model có hỗ trợ tool hay không. Cách duy nhất
là thử — và dự án **đã có sẵn công cụ**: Console → Cài đặt → AI → **Kiểm tra kết
nối** (`POST /api/ai/test`). Nó phân biệt đúng ba trường hợp:

- kết nối tốt **và model gọi được tool** → dùng được
- gọi được endpoint **nhưng model không gọi tool** → loại, sẽ bịa
- không gọi được endpoint

Đây là cổng kiểm duyệt bắt buộc trước khi thêm bất kỳ model nào vào danh sách ưu
tiên.

---

## 4. Thiết kế xoay vòng — ba mức, rẻ trước

Vì §2 đã loại bỏ phương án "quét hạn mức rồi chọn", cái còn lại là **danh sách ưu
tiên + phản ứng khi bị từ chối**. Có ba mức công sức, **nên thử từ mức 0**.

### Mức 0 — `openrouter/free` (không code dòng nào)

OpenRouter có sẵn một model id tên `openrouter/free`: *"a router that selects
free models at random… smartly filters for models that [phù hợp request]"*, và
**nó có hỗ trợ tools**.

Điền đúng một chuỗi đó vào `ai.model` là xong. OpenRouter tự xoay vòng giúp.

- **Được:** không code, không bảo trì
- **Mất:** không kiểm soát được model nào trả lời, chất lượng dao động giữa các
  lượt, và trần free theo ngày của tài khoản vẫn áp dụng

**Thử cái này trước. Nếu đủ dùng thì dừng ở đây.** (Mức 2 giờ đã có sẵn trong
console — xem §4e — nhưng vẫn nên đo lưu lượng thật trước khi xếp chuỗi dài.)

### Mức 1 — danh sách fallback của OpenRouter (code rất ít)

Gửi thêm mảng `models` trong body chat completions, xếp theo thứ tự ưu tiên:

```json
{
  "models": ["google/gemma-4-31b-it:free", "nvidia/nemotron-3.5-lightning:free"],
  "messages": [ ... ]
}
```

OpenRouter thử lần lượt; lỗi bất kỳ (hết hạn mức, quá context, downtime, model bị
chặn) thì nhảy sang cái tiếp theo. Trường `model` trong response cho biết ai đã
trả lời.

- **Được:** vẫn một lần gọi HTTP, mình kiểm soát thứ tự
- **Mất:** chỉ trong phạm vi OpenRouter, không gộp được Groq
- **Phải kiểm:** tài liệu **không nói gì về streaming**. Chatbot của mình stream
  qua `OnDelta` — bắt buộc thử thật trước khi tin.

### Mức 2 — tự xoay vòng, nhiều nhà cung cấp (code thật)

Chỉ làm khi cần gộp Groq + OpenRouter vào một danh sách, hoặc cần kiểm soát thứ
tự chặt.

**Cơ chế:** giữ một bảng trạng thái theo cặp `(provider, model)` với một trường
`cooling_until`.

1. Duyệt danh sách ưu tiên, **bỏ qua** cái nào đang trong thời gian nghỉ
2. Gọi model đầu tiên còn khả dụng
3. Thành công → ghi lại `x-ratelimit-remaining-*` **để quan sát**, không dùng để
   ra quyết định
4. Gặp **429** → đọc `retry-after` → đặt `cooling_until = now + retry-after` →
   sang model kế tiếp
5. Hết danh sách → rơi về **đường degraded đã có sẵn** của dự án (trường
   `degraded` trong `StartedConversation`, kèm câu trả lời kịch bản)

### Năm cái bẫy — phần phải nghĩ kỹ nhất

**a) Không được đổi model giữa chừng khi đang stream.** Chatbot đẩy từng mẩu chữ
cho khách qua `OnDelta`. Nếu model chết sau khi đã phát 200 ký tự, **không thể**
âm thầm chuyển sang model khác — khách đã đọc đoạn đầu rồi. Luật bắt buộc:
**chỉ fallback trước mẩu delta đầu tiên**; sau đó, lỗi là lỗi, không phải lý do
xoay vòng. Đây là ràng buộc dễ bỏ sót nhất và cũng nguy hiểm nhất.

**b) Model không thay thế được cho nhau.** Xoay từ model 70B sang 8B giữa một
cuộc hội thoại thì giọng văn và năng lực đổi hẳn, khách nhận ra ngay. Nên xoay
**trong cùng một hạng chất lượng**, đừng trộn.

**c) Hạn mức dùng chung — đã kiểm chứng, và nó phá một nửa ý tưởng xoay vòng.**
Thí nghiệm: đọc `x-ratelimit-remaining-requests` của `gpt-oss-20b` và
`qwen3.8-27b`, rồi gọi `gpt-oss-120b` vài lần, rồi đọc lại. **Số dư của cả hai
model kia tụt theo.** Ba model Groq rút từ **cùng một túi**.

Nghĩa là: xoay vòng giữa các model Groq **không cho thêm request nào**. Nó chỉ
cứu được khi một model chết hoặc chạm trần token/phút riêng. Muốn có túi thứ hai
thật sự thì phải đổi sang **nhà cung cấp khác**, không phải model khác.

**d) Trạng thái nghỉ lưu ở đâu.** Chạy một instance thì để trong bộ nhớ là đủ.
Chạy nhiều instance thì mỗi instance sẽ tự học lại từ đầu, lãng phí mỗi lần một
request — lúc đó cần Redis (`REDIS_URL` đã có trong config, hiện để trống).

**e) Đa nhà cung cấp + xoay vòng — ĐÃ LÀM (migration 0049).**

Endpoint không còn là setting. Nó là **bản ghi**, vì có thể có nhiều cái:

| Bảng | Giữ gì |
|---|---|
| `ai_providers` | nhãn, kiểu adapter, base_url, khoá API (mã hoá), bật/tắt |
| `ai_purpose_models` | chuỗi có thứ tự cho từng công việc: (nhà cung cấp, model) |

Sáu setting cũ (`ai.provider`, `ai.base_url`, `ai.api_key`, `ai.model`,
`ai.model.chat`, `ai.model.content`) đã bị xoá khỏi cả DB lẫn registry —
migration mang dữ liệu sang, ciphertext của khoá copy nguyên vẹn vì AEAD
không dùng AAD.

Luật xoay vòng, trong `endpoints.Stream()`:

1. Duyệt chuỗi theo thứ tự, bỏ qua mắt xích đang nghỉ
2. Gặp **429** → đọc `Retry-After` → cho nghỉ đúng chừng đó → sang bước kế
3. **Chỉ** 429 mới nhảy. Khoá sai, model không tồn tại, request hỏng — những
   cái đó model khác cũng sai y hệt
4. **Chỉ nhảy khi chưa phát chữ nào.** Sau mẩu delta đầu tiên, lỗi là lỗi —
   không ghép hai giọng văn vào giữa một câu trả lời đang chạy
5. Hết chuỗi → rơi về bot kịch bản (`degraded`), không báo lỗi cho khách

---

## 5. Thứ tự nên làm

1. **Lấy key Groq + OpenRouter.** Nạp 10 USD vào OpenRouter nếu định dùng thật —
   trần ngày từ 50 lên 1.000.
2. **Chạy "Kiểm tra kết nối" cho từng ứng viên.** Lọc ra model nào thực sự gọi
   được tool. Chưa code gì ở bước này.
3. **Thử `openrouter/free`.** Nếu đủ dùng, dừng. Không xây máy xoay vòng khi một
   chuỗi cấu hình đã giải quyết xong.
4. **Chỉ khi khối lượng vượt hạn mức** mới làm mức 1, rồi mức 2.

Lý do xếp thứ tự này: chưa ai biết một model miễn phí có đủ cho chatbot hay
không. Xây cơ chế xoay vòng trước khi biết điều đó là xây cho một vấn đề có thể
không tồn tại.
