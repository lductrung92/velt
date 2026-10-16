# Cảnh báo thay đổi chưa lưu

Thiết kế cho cơ chế chặn rời khỏi nơi có thay đổi chưa lưu, dùng chung cho mọi
màn soạn thảo và mọi hộp thoại có form trong console.

Trạng thái: **đã gỡ một nửa (2026-10-15)**.

- Phần **chặn điều hướng** (`UnsavedChangesProvider`, `useUnsavedChanges`,
  `beforeunload`, hộp thoại "Rời trang khi chưa lưu?") đã bị gỡ khỏi console
  theo yêu cầu: rời màn soạn thảo giờ đi thẳng, không hỏi.
- Phần **chặn đóng hộp thoại** (`src/hooks/useDialogDismissGuard.ts`) vẫn còn và
  vẫn dùng ở form thành viên, form menu, form item menu.

Phần còn lại của tài liệu giữ nguyên làm hồ sơ thiết kế cũ; đừng đọc nó như mô
tả hệ thống hiện tại.

---

## 1. Vấn đề

Hôm nay console có hai mảnh rời rạc:

| Nơi | Chặn được gì | Không chặn được gì |
| --- | --- | --- |
| `src/hooks/useUnsavedGuard.ts` | Tải lại trang, đóng tab, rời sang tên miền khác | Mọi điều hướng trong app |
| `ArticleEditor.tsx` (nút Quay lại) | Đúng một nút bấm, viết tay | Back trình duyệt, mọi link trong sidebar, breadcrumb |

Hệ quả đo được: ở `/cms/articles/<id>`, gõ vào tiêu đề rồi bấm **Bài viết** ở
sidebar — mất sạch, không hỏi một câu. Bấm **back trình duyệt** — mất sạch.
Chỉ đúng nút "Quay lại" trong trang là có hỏi.

Hộp thoại có form (`UserFormDialog`, `TagFormDialog`, `ItemFormDialog`,
`CreateMenuDialog`, `GalleryPane`) không có lớp bảo vệ nào: bấm ✕, bấm Escape
hay bấm ra ngoài đều mất dữ liệu ngay.

---

## 2. Ràng buộc kỹ thuật

Đây là những giới hạn của nền tảng, không phải lựa chọn thiết kế. Thiết kế phải
uốn theo chúng.

### 2.1 Mỗi router chỉ được MỘT blocker

React Router phát cảnh báo `A router only supports one blocker at a time` nếu
có hai `useBlocker` cùng sống. Nhóm bảo trì nói rõ hướng giải quyết là **nâng
blocker lên component cha chung và gộp điều kiện lại**.

→ **Hệ quả then chốt:** không được đặt `useBlocker` trong từng editor. Phải có
đúng một `useBlocker` ở gốc app, lấy dữ liệu từ một sổ đăng ký.

Đây là lý do thiết kế dưới đây có vẻ "nặng" hơn mức cần thiết cho một màn hình.
Nó không nặng vì cầu kỳ; nó nặng vì nền tảng chỉ cho một blocker.

### 2.2 `useBlocker` chỉ chặn điều hướng phía client

Không chặn được: tải lại trang, đóng tab, gõ URL trực tiếp, rời sang tên miền
khác. Những trường hợp đó phải do `beforeunload` lo — tức là vẫn cần cả hai cơ
chế, không thay thế nhau được.

### 2.3 `beforeunload` cần người dùng đã tương tác

Từ Chrome 60, hộp thoại chỉ hiện nếu trang **đã nhận một thao tác người dùng**
(sticky activation). Nội dung tuỳ chỉnh đã bị bỏ từ Chrome 51 — mọi trình duyệt
hiện chỉ hiện câu chữ mặc định của chúng.

→ Không thể thống nhất giao diện cho trường hợp này. Chấp nhận, và **không**
cố vẽ lại nó.

### 2.4 Back trình duyệt (POP) đổi URL trước khi app biết

Trình duyệt đổi URL rồi mới bắn `popstate`, nên khi app biết thì URL đã lệch.
React Router xử lý bằng cách **hoàn tác ngay** điều hướng POP bị chặn để đồng bộ
lại. Theo đó `reset()` không cần khôi phục URL.

→ **Phải kiểm chứng bằng thực nghiệm ở bước cài đặt**, không tin vào tài liệu.
Đây là rủi ro số một của tính năng này.

### 2.5 `shouldBlock` phải trả lời đồng bộ

Không được `await`, không dùng được `window.confirm`. Hàm quyết định phải thuần
và nhanh.

---

## 3. Nguyên tắc thiết kế

**Hỏi chỉ khi thật sự có thay đổi.** Một hộp thoại hiện ra khi người dùng không
sửa gì sẽ bị học cách bấm qua mà không đọc — và rồi nó sẽ bị bấm qua đúng lúc
nó quan trọng. Thà bỏ sót một cảnh báo còn hơn hỏi thừa ba lần.

**Một nguồn sự thật cho "đã thay đổi".** Hiện mỗi editor tự ghép `isDirty ||
seoDirty || coverDirty || tr.dirty`. Cách ghép đó giữ nguyên, nhưng kết quả phải
chảy vào một chỗ.

**Rời đi là quyền của người dùng.** Hộp thoại đưa ra lựa chọn, không dựng tường.
Nút rời đi không được ẩn đi hay làm mờ.

---

## 4. Kiến trúc

```
                    ┌────────────────────────────────┐
                    │  UnsavedChangesProvider        │  ← đúng 1 ở gốc app
                    │  • sổ đăng ký các nguồn dirty  │
                    │  • useBlocker (duy nhất)       │
                    │  • beforeunload (duy nhất)     │
                    │  • render LeaveConfirmDialog   │
                    └────────────────────────────────┘
                       ▲                      ▲
         đăng ký/huỷ   │                      │  đăng ký/huỷ
                       │                      │
         ┌─────────────┴──────┐      ┌────────┴─────────────┐
         │ useUnsavedChanges  │      │ useUnsavedChanges    │
         │ trong ArticleEditor│      │ trong ProductEditor  │
         └────────────────────┘      └──────────────────────┘
```

### 4.1 Sổ đăng ký

Mỗi màn gọi một hook, truyền vào cờ dirty của mình. Hook ghi vào một `Map` trong
provider và tự gỡ khi unmount.

```ts
// src/hooks/useUnsavedChanges.ts
export function useUnsavedChanges(opts: {
  /** True khi có thay đổi chưa lưu. */
  when: boolean;
  /** Nhãn hiện trong hộp thoại, ví dụ "bài viết". Mặc định dùng câu chung. */
  what?: string;
}): void;
```

Provider gộp lại: `isDirty = [...registry.values()].some(Boolean)`.

Dùng `Map` chứ không dùng một boolean vì một trang có thể có nhiều nguồn cùng
lúc — ví dụ trang soạn bài có form chính *và* một hộp thoại chèn widget đang mở.

### 4.2 Blocker duy nhất

```ts
const blocker = useBlocker(({ currentLocation, nextLocation }) =>
  isDirty && currentLocation.pathname !== nextLocation.pathname,
);
```

So sánh `pathname` chứ không so sánh cả location: đổi query string (phân trang,
bộ lọc, chuyển tab ngôn ngữ) **không phải** là rời trang và không được hỏi.

Khi `blocker.state === "blocked"` → hiện `LeaveConfirmDialog`.
- "Rời trang" → `blocker.proceed()`
- "Huỷ" / Escape → `blocker.reset()`

### 4.3 `beforeunload`

Giữ nguyên `useUnsavedGuard` hiện có nhưng chuyển vào provider, nghe cùng một
`isDirty`. Xoá hook cũ khỏi 5 editor đang gọi trực tiếp.

### 4.4 Hộp thoại có form

Đây **không phải** điều hướng, nên không đi qua router. Cần cơ chế riêng:

```ts
// src/hooks/useDialogDismissGuard.ts
export function useDialogDismissGuard(opts: {
  when: boolean;
  onConfirmClose: () => void;
}): {
  /** Gắn vào <Dialog onOpenChange={...}> */
  handleOpenChange: (open: boolean) => void;
  /** Hộp thoại xác nhận, render ngay trong dialog cha. */
  confirmProps: { open: boolean; onOpenChange: (o: boolean) => void };
};
```

Chặn đúng ba lối ra của Radix: nút ✕, phím Escape, bấm ra ngoài. Cả ba đều đi
qua `onOpenChange(false)`.

---

## 5. "Thật sự có thay đổi" — yêu cầu số 1

Đây là phần dễ sai nhất, và là lý do tính năng này hay bị ghét.

### 5.1 Các bẫy đã biết của `react-hook-form`

| Bẫy | Hậu quả | Cách tránh |
| --- | --- | --- |
| `defaultValues` thiếu field | `isDirty` kẹt ở `true` vĩnh viễn, kể cả sau `reset()` | `defaultValues` phải liệt kê **đủ** mọi field |
| Gọi `reset()` trần sau khi lưu | Quay về giá trị cũ, không phải giá trị vừa lưu | `reset(dataTraVe)` trong `onSuccess` |
| Server chuẩn hoá dữ liệu | Baseline thành thứ chưa từng được lưu | Dùng response của server làm baseline |
| `keepDirtyValues` với object lồng | Có thể mất một phần giá trị mới | Tránh dùng với dữ liệu lồng nhau |

### 5.2 Quy tắc bắt buộc

1. **Sau khi lưu thành công, phải đặt lại mốc.** `form.reset(response)` — nếu
   không, lưu xong vẫn bị hỏi khi rời trang. Đây là lỗi làm người dùng ghét
   tính năng này nhất.

2. **So sánh theo giá trị, không theo tham chiếu**, với các nguồn viết tay
   (`seoDirty`, `coverDirty`, `tr.dirty`). Một mảng mới cùng nội dung không phải
   là thay đổi.

3. **Chuỗi rỗng và `null` là một.** Người dùng gõ rồi xoá hết phải quay về
   *không có thay đổi*. Đây là kiểu sai đã từng gặp trong dự án này ở
   `useEntityTranslation` — Tiptap bắn `onChange` lúc mount với `<p></p>` và bộ
   đếm tiến độ nhảy từ 0/5 lên 3/5 dù chưa ai gõ gì.

4. **Trình soạn thảo rich text phải so sánh phần CHỮ, không so sánh HTML.**
   Tiptap tự chuẩn hoá markup, nên HTML đổi mà nội dung không đổi. Dự án đã có
   sẵn `textOf()` trong `useEntityTranslation.ts` làm đúng việc này — dùng lại.

5. **Không tính trạng thái UI là thay đổi.** Mở/đóng accordion, chuyển tab, cuộn
   trang, focus — không phải dữ liệu.

### 5.3 Kiểm chứng

Không nhận là xong cho tới khi, với **mỗi** màn soạn thảo, chạy được chuỗi này
trên trình duyệt thật:

```
mở trang           → rời đi → KHÔNG hỏi
gõ 1 ký tự         → rời đi → CÓ hỏi
gõ rồi xoá hết     → rời đi → KHÔNG hỏi
lưu thành công     → rời đi → KHÔNG hỏi      ← hay sai nhất
lưu lỗi (409/422)  → rời đi → CÓ hỏi
chỉ đổi tab/filter →        → KHÔNG hỏi
```

---

## 6. Phạm vi — yêu cầu số 2

| Lối rời đi | Cơ chế | Có giao diện riêng? |
| --- | --- | --- |
| Link sidebar, breadcrumb, menu | `useBlocker` | ✅ hộp thoại của app |
| Nút "Quay lại" trong trang | `useBlocker` (đi qua `navigate()`) | ✅ |
| **Back / Forward trình duyệt** | `useBlocker`, `historyAction === "POP"` | ✅ |
| `navigate()` từ code | `useBlocker` | ✅ |
| Tải lại trang (F5) | `beforeunload` | ❌ hộp thoại trình duyệt |
| Đóng tab / cửa sổ | `beforeunload` | ❌ |
| Rời sang tên miền khác | `beforeunload` | ❌ |
| Gõ URL trực tiếp vào thanh địa chỉ | **không chặn được** | — |
| Đóng hộp thoại (✕ / Escape / bấm ngoài) | `useDialogDismissGuard` | ✅ |

Dòng "gõ URL trực tiếp" là giới hạn của History API, không phải thiếu sót — React
Router ghi nhận đây là hành vi mong đợi.

---

## 7. Giao diện

Dùng lại `ConfirmDialog` đang có. Không thêm thành phần mới.

```
        ┌──────────────────────────────┐
        │            ( ← )             │   icon = hành động sắp làm
        │                              │
        │    Rời trang khi chưa lưu?   │   title
        │  Những thay đổi chưa lưu sẽ  │   description
        │  bị mất. Bạn có thể huỷ để   │
        │  tiếp tục soạn bài.          │
        │                              │
        │  [ ✕ Huỷ ]      [ ← Rời trang ]│
        └──────────────────────────────┘
```

- **không** `destructive` — rời trang không phải xoá dữ liệu đã lưu
- nút huỷ ở trái, nút rời ở phải (theo bố cục footer chung)
- Escape = Huỷ, tức là ở lại — lựa chọn an toàn
- câu chữ đổi theo `what`: "bài viết" / "sản phẩm" / "thành viên"

Hộp thoại khi đóng popup dùng cùng thành phần, chỉ khác câu chữ.

---

## 8. Việc phải làm

| # | Việc | File |
| --- | --- | --- |
| 1 | `UnsavedChangesProvider` + sổ đăng ký | `src/app/` (mới) |
| 2 | `useUnsavedChanges` | `src/hooks/` (mới) |
| 3 | `useDialogDismissGuard` | `src/hooks/` (mới) |
| 4 | Gộp `beforeunload` vào provider, xoá hook cũ | `src/hooks/useUnsavedGuard.ts` (xoá) |
| 5 | Gắn provider vào `RouterProvider` | `src/main.tsx` |
| 6 | Chuyển 6 màn soạn thảo sang hook mới | `*Editor.tsx`, `MenuBuilder`, `LandingDesigner` |
| 7 | Bỏ hộp thoại viết tay trong `ArticleEditor` | `ArticleEditor.tsx` |
| 8 | Gắn guard cho 5 hộp thoại có form | `UserFormDialog`, `TagFormDialog`, `ItemFormDialog`, `CreateMenuDialog`, `GalleryPane` |
| 9 | Rà `reset(response)` sau khi lưu ở mọi editor | tất cả editor |
| 10 | Khoá dịch vi/en | `locales/*/translation.json` |

Thứ tự: 1–5 trước (hạ tầng, chưa đổi hành vi màn nào), rồi 6–8 từng màn một.

---

## 9. Kiểm thử

**Unit** — provider gộp nhiều nguồn, gỡ đăng ký khi unmount, không hỏi khi chỉ
đổi query string.

**Tích hợp** — mỗi editor chạy đủ 6 bước ở §5.3.

**Trình duyệt thật** — back/forward là thứ jsdom không mô phỏng được. Phải chạy
Playwright: `page.goBack()`, kiểm tra hộp thoại hiện ra, bấm Huỷ, rồi **kiểm tra
URL có bị lệch không** (§2.4). Đây là rủi ro lớn nhất và phải được đo, không
được suy luận.

**Kiểm thử đột biến** — bỏ `reset(response)` sau khi lưu ở một editor; test phải
đỏ. Nếu không đỏ thì test chưa bảo vệ được điều quan trọng nhất.

---

## 10. Những điều cố ý KHÔNG làm

- **Không tự lưu nháp vào `sessionStorage`.** React Router gợi ý cách này thay
  cho chặn điều hướng, và nó tốt hơn thật — nhưng nó là tính năng khác, cần
  quyết định về thời hạn lưu, xung đột nhiều tab, và dữ liệu nhạy cảm nằm trong
  trình duyệt. Đáng làm sau, không gộp vào đây.

- **Không chặn khi chỉ đổi query string.** Phân trang, lọc, chuyển tab ngôn ngữ
  đều không phải rời trang.

- **Không cố thống nhất giao diện cho `beforeunload`.** Trình duyệt không cho.

- **Không chặn đăng xuất.** Hết phiên hoặc chủ động đăng xuất thì phải đi được
  ngay; một hộp thoại chắn đường lúc đó là lỗi bảo mật, không phải tiện ích.

---

## Nguồn

- [useBlocker — React Router 6.30](https://reactrouter.com/6.30.3/hooks/use-blocker.md)
- [Decision record: useBlocker](https://github.com/remix-run/react-router/blob/main/decisions/0001-use-blocker.md)
- [Allow multiple blockers — Discussion #9978](https://github.com/remix-run/react-router/discussions/9978)
- [A router only supports one blocker at a time — Issue #12182](https://github.com/remix-run/react-router/issues/12182)
- [Direct URL change bypasses useBlocker — Issue #11088](https://github.com/remix-run/react-router/issues/11088)
- [Window: beforeunload event — MDN](https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event)
- [Chromium policy on JavaScript dialogs](https://developer.chrome.com/blog/dialogs-policy)
- [isDirty với defaultValues thiếu field — Issue #11541](https://redirect.github.com/react-hook-form/react-hook-form/issues/11541)
