package conversation

import (
	"context"
	"strings"

	"github.com/velt/backend/internal/modules/ai/tools"
)

// systemBase is the assistant's standing brief.
//
// Two things here are NOT security controls and must not be mistaken for them:
// the price rule holds because no price data is ever put in context (there is
// none in the products module), and the "only what the tools return" rule holds
// because the tools are the only source of product facts. The text explains the
// behaviour; the architecture enforces it. See docs/domains/ai/README.md §4.
//
// The roster is the one place where the text is doing real work rather than
// describing it: list_members is the only source of people, but nothing stops
// a model answering from its own head instead of calling it — which is what
// happened once, inventing six members with placeholder names while the team
// had four. Naming the forbidden inventions is a weaker control than
// withholding the data, and it is the only one available here, so it is worth
// knowing that it is weaker.
const systemBase = `Bạn là trợ lý tư vấn của Zukatek — một nhóm làm phần mềm cho cá nhân, nhóm, hộ kinh doanh và doanh nghiệp tại Việt Nam.

CÁCH LÀM VIỆC
- Ngắn gọn, giọng người thật, không khoa trương.
- Khung chat hẹp (khoảng 360px). Được dùng **in đậm** và gạch đầu dòng; KHÔNG dùng bảng, không tiêu đề ###, không khối code.
- Hỏi lại để hiểu nhu cầu: quy mô, ngành, vấn đề đang gặp. Đừng chào hàng khi chưa biết họ cần gì.
- Được bàn chuyện nghiệp vụ chung (ví dụ quán ăn nên quản kho thế nào) rồi dẫn về sản phẩm phù hợp.

RÀNG BUỘC
- Mọi thông tin VỀ ZUKATEK — sản phẩm, đội ngũ, con người — phải lấy từ kết quả tool. Không có trong tool thì nói là chưa có thông tin.
- TUYỆT ĐỐI không tự nghĩ ra tên người, số lượng thành viên, vai trò hay kỹ năng. Dùng list_members; tool trả về bao nhiêu người thì đúng bấy nhiêu.
- Không bịa thông tin công ty (địa chỉ, năm thành lập, số khách hàng, khách hàng tiêu biểu). Không tool nào trả lời được những thứ đó.
- KHÔNG nói về giá, gói cước, chiết khấu hay điều kiện hợp đồng. Mỗi sản phẩm một hình thức khác nhau; nói khách để lại liên hệ để người phụ trách trao đổi.
- Không tư vấn pháp lý, thuế hay y tế.
- Không hứa tiến độ, không cam kết triển khai. Chỉ người thật mới hứa được.
- Không chê sản phẩm của đối thủ đích danh.
- Không chắc thì nói không chắc và đề nghị nối với người phụ trách.`

// buildSystem assembles the system prompt: the standing brief, the operator's
// optional persona text, and a compact index of the published catalog.
//
// The index is slug + name + summary only. It exists so the model knows what
// exists and never invents a product; detail comes from get_product. Shipping
// every field here would bloat each turn for facts most conversations never
// need.
// langRule pins the answer to the language the visitor is reading the site in.
//
// It is a separate block rather than a line inside systemBase because the brief
// itself stays Vietnamese in both cases: translating the whole standing brief
// would mean maintaining two copies of every rule, and the rules that matter
// (no prices, no invented people) would then drift apart. The instruction is
// written to be louder than the surrounding language so a Vietnamese brief does
// not drag an English answer back into Vietnamese.
//
// The visitor's own request wins: someone who writes "answer in English" in a
// Vietnamese page is asking for English, and refusing that would be obtuse.
func langRule(locale string) string {
	if strings.EqualFold(strings.TrimSpace(locale), "en") {
		return "\n\nLANGUAGE — OVERRIDES EVERYTHING BELOW\n" +
			"- The visitor is reading the English site. Write every reply in English.\n" +
			"- The brief that follows is written in Vietnamese. Do not copy its language; " +
			"follow its rules and answer in English.\n" +
			"- Exception: if the visitor asks in their message for another language, use that one.\n"
	}
	return "\n\nNGÔN NGỮ\n" +
		"- Khách đang đọc bản tiếng Việt. Trả lời bằng tiếng Việt.\n" +
		"- Ngoại lệ: nếu khách yêu cầu ngôn ngữ khác ngay trong tin nhắn thì theo yêu cầu đó.\n"
}

func buildSystem(ctx context.Context, catalog tools.CatalogPort, persona, locale string) string {
	var b strings.Builder
	b.WriteString(systemBase)
	b.WriteString(langRule(locale))

	if p := strings.TrimSpace(persona); p != "" {
		b.WriteString("\n\nGHI CHÚ RIÊNG\n")
		b.WriteString(p)
	}

	b.WriteString("\n\nDANH MỤC SẢN PHẨM ĐÃ CÔNG BỐ\n")
	items, err := catalog.SearchPublished(ctx, "", 50)
	if err != nil || len(items) == 0 {
		// Saying so beats leaving the model to guess. An empty catalog is a
		// real state right now: Zukatek has not published anything yet.
		b.WriteString("(chưa có sản phẩm nào được công bố — nói thật điều này với khách " +
			"và mời họ để lại liên hệ)")
		return b.String()
	}
	for _, it := range items {
		b.WriteString("- ")
		b.WriteString(it.Slug)
		b.WriteString(" — ")
		b.WriteString(it.Name)
		if it.Summary != "" {
			b.WriteString(": ")
			b.WriteString(it.Summary)
		}
		b.WriteString("\n")
	}
	b.WriteString("\nDùng get_product(slug) để lấy chi tiết trước khi mô tả một sản phẩm.")
	return b.String()
}

// scriptedReply is the fallback when the assistant cannot run: disabled, no API
// key, or over the daily budget. It mirrors the keyword bot the site already
// ships so a degraded conversation still goes somewhere useful.
//
// Keeping this on the server rather than leaving it to the client means the
// transcript stays complete — a conversation that happened in degraded mode is
// still readable later.
// The keyword lists stay bilingual rather than being split per locale: a
// visitor on the English site may still type "giá", and matching on both costs
// nothing. Only the ANSWER follows the locale, which is the part the visitor
// reads.
func scriptedReply(text, locale string) string {
	q := strings.ToLower(text)
	has := func(words ...string) bool {
		for _, w := range words {
			if strings.Contains(q, w) {
				return true
			}
		}
		return false
	}
	en := strings.EqualFold(strings.TrimSpace(locale), "en")
	switch {
	case has("giá", "gia ", "bao nhiêu", "báo giá", "chi phí", "price", "cost", "how much"):
		if en {
			return "Pricing and terms differ per product, so someone on the team has to confirm them. " +
				"Leave your name and a phone number or Zalo and we will get back to you."
		}
		return "Giá và điều kiện sử dụng khác nhau theo từng sản phẩm nên cần người phụ trách xác nhận. " +
			"Bạn để lại tên và số điện thoại hoặc Zalo, bên mình liên hệ lại nhé."
	case has("demo", "dùng thử", "trải nghiệm", "thử", "try", "trial"):
		if en {
			return "Where a product has a public trial, its detail page carries the button that opens it. " +
				"Have a look under Products."
		}
		return "Sản phẩm nào có bản dùng thử công khai thì trang chi tiết sẽ có nút mở bản trải nghiệm. " +
			"Bạn xem mục Sản phẩm giúp mình nhé."
	case has("liên hệ", "gặp", "nhân viên", "tư vấn", "người thật", "contact", "human", "someone"):
		if en {
			return "Leave your name and one way to reach you (phone or Zalo) and the person in charge " +
				"will message you directly."
		}
		return "Bạn để lại tên và một cách liên hệ (số điện thoại hoặc Zalo), " +
			"người phụ trách sẽ chủ động nhắn lại cho bạn."
	case has("sản phẩm", "giải pháp", "phần mềm", "app", "product", "software", "solution"):
		if en {
			return "Tell me where the work is getting stuck and roughly how big the team is, " +
				"and I will suggest a direction."
		}
		return "Bạn mô tả giúp mình đang gặp khó ở khâu nào và quy mô thế nào, " +
			"mình sẽ gợi ý hướng phù hợp."
	default:
		if en {
			return "The assistant is running in reduced mode right now and cannot handle every question. " +
				"Leave your name and a way to reach you and someone will take it from here."
		}
		return "Hiện trợ lý đang ở chế độ trả lời rút gọn nên chưa xử lý được mọi câu hỏi. " +
			"Bạn để lại tên và cách liên hệ, người phụ trách sẽ trao đổi trực tiếp với bạn."
	}
}

// greeting is the opening line. It names the referring member when there is
// one, because the point of the ?ref= link is that the visitor knows who to ask.
// The wording is duplicated on the site, in src/site/app/lib/i18n/contact.ts
// under chat.greeting*. That is deliberate: the widget shows a greeting before
// any conversation exists, so the first bubble costs no request and leaves no
// row behind. When the visitor finally writes, the server persists this copy as
// the real first message — the two must read the same or the bubble appears to
// rewrite itself. Change one, change the other.
func greeting(referrerName, locale string) string {
	if strings.EqualFold(strings.TrimSpace(locale), "en") {
		if referrerName != "" {
			return "Hello! You arrived at Zukatek through " + referrerName +
				". What are you trying to solve, so I can point you to the right thing?"
		}
		return "Hello! What are you trying to solve, so I can point you to the right thing?"
	}
	if referrerName != "" {
		return "Chào bạn! Bạn đang xem Zukatek qua giới thiệu của " + referrerName +
			". Bạn đang cần giải quyết việc gì để mình gợi ý cho đúng?"
	}
	return "Chào bạn! Bạn đang cần giải quyết việc gì để mình gợi ý cho đúng?"
}
