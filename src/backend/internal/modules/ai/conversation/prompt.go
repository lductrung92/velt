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
- Trả lời bằng tiếng Việt, ngắn gọn, giọng người thật, không khoa trương.
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
func buildSystem(ctx context.Context, catalog tools.CatalogPort, persona string) string {
	var b strings.Builder
	b.WriteString(systemBase)

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
func scriptedReply(text string) string {
	q := strings.ToLower(text)
	has := func(words ...string) bool {
		for _, w := range words {
			if strings.Contains(q, w) {
				return true
			}
		}
		return false
	}
	switch {
	case has("giá", "gia ", "bao nhiêu", "báo giá", "chi phí"):
		return "Giá và điều kiện sử dụng khác nhau theo từng sản phẩm nên cần người phụ trách xác nhận. " +
			"Bạn để lại tên và số điện thoại hoặc Zalo, bên mình liên hệ lại nhé."
	case has("demo", "dùng thử", "trải nghiệm", "thử"):
		return "Sản phẩm nào có bản dùng thử công khai thì trang chi tiết sẽ có nút mở bản trải nghiệm. " +
			"Bạn xem mục Sản phẩm giúp mình nhé."
	case has("liên hệ", "gặp", "nhân viên", "tư vấn", "người thật"):
		return "Bạn để lại tên và một cách liên hệ (số điện thoại hoặc Zalo), " +
			"người phụ trách sẽ chủ động nhắn lại cho bạn."
	case has("sản phẩm", "giải pháp", "phần mềm", "app"):
		return "Bạn mô tả giúp mình đang gặp khó ở khâu nào và quy mô thế nào, " +
			"mình sẽ gợi ý hướng phù hợp."
	default:
		return "Hiện trợ lý đang ở chế độ trả lời rút gọn nên chưa xử lý được mọi câu hỏi. " +
			"Bạn để lại tên và cách liên hệ, người phụ trách sẽ trao đổi trực tiếp với bạn."
	}
}

// greeting is the opening line. It names the referring member when there is
// one, because the point of the ?ref= link is that the visitor knows who to ask.
func greeting(referrerName string) string {
	if referrerName != "" {
		return "Chào bạn! Bạn đang xem Zukatek qua giới thiệu của " + referrerName +
			". Bạn đang cần giải quyết việc gì để mình gợi ý cho đúng?"
	}
	return "Chào bạn! Bạn đang cần giải quyết việc gì để mình gợi ý cho đúng?"
}
