/**
 * The contact form, the message it composes, and the chat widget.
 *
 * Shape fixed by i18n/common.ts: Vietnamese is the source, English must cover
 * exactly the same keys or the build fails.
 *
 * The e-mail body is one key per LINE (contact.brief.*), joined with "\n" by
 * the component. A translator can reword a line without touching the layout,
 * and a language that needs a different order still gets the same blank lines
 * in the same places.
 */
export const vi = {
  "contact.eyebrow": "TƯ VẤN & MUA SẢN PHẨM",
  "contact.channel_member": "Tư vấn cùng {name}",
  "contact.channel_team": "Tư vấn sản phẩm ZUKATEK",
  "contact.zalo": "Liên hệ qua Zalo ↗",
  "contact.channel_pending":
    "Kênh liên hệ sẽ sớm được cập nhật. Bạn có thể gửi lời nhắn cho người đã giới thiệu ZUKATEK.",

  "contact.form_title": "Nhận tư vấn sản phẩm",
  "contact.form_intro": "Chọn sản phẩm và chia sẻ nhu cầu của bạn.",
  "contact.form_intro_offline":
    "Chuẩn bị nội dung hỏi mua sản phẩm để gửi cho người đã giới thiệu ZUKATEK.",

  // The trailing space in each label separates it from the required marker.
  "contact.name_label": "Tên của bạn ",
  "contact.name_placeholder": "Nhập họ và tên",
  "contact.email_label": "Email ",
  "contact.person_label": "Người tư vấn",
  "contact.person_team": "Đội ngũ ZUKATEK",
  "contact.product_label": "Sản phẩm bạn quan tâm",
  "contact.product_any": "Tôi cần tư vấn lựa chọn",
  "contact.product_example": " · Minh họa",
  "contact.audience_legend": "Bạn mua sản phẩm cho",
  "contact.message_label": "Bạn cần tư vấn điều gì? ",
  "contact.message_placeholder":
    "Tên sản phẩm, tính năng cần dùng, số người sử dụng hoặc câu hỏi về giá…",
  "contact.submit": "Gửi yêu cầu",
  "contact.note_email":
    "Xem lại lời nhắn rồi gửi qua ứng dụng email. Biểu mẫu không tự gửi.",
  "contact.note_offline":
    "Lời nhắn được tạo trên thiết bị để bạn sao chép hoặc tải về; chưa được gửi đến ZUKATEK.",
  "contact.sending": "Đang gửi...",
  "contact.sent":
    "Đã gửi. Chúng tôi sẽ liên hệ lại với bạn trong thời gian sớm nhất.",
  "contact.send_failed":
    "Chưa gửi được. Bạn có thể sao chép hoặc tải lời nhắn bên dưới rồi gửi qua email.",
  "contact.note_send":
    "Gửi trực tiếp đến ZUKATEK. Chúng tôi phản hồi qua email bạn điền ở trên.",
  "contact.recaptcha_notice": "Trang này được bảo vệ bởi reCAPTCHA; áp dụng",
  "contact.recaptcha_privacy": "Chính sách bảo mật",
  "contact.recaptcha_terms": "Điều khoản dịch vụ của Google",
  "contact.required": "Vui lòng nhập nội dung trước khi tiếp tục.",

  "contact.brief_eyebrow": "TƯ VẤN SẢN PHẨM ZUKATEK",
  "contact.brief_title": "Yêu cầu tư vấn của bạn",
  "contact.brief_intro_email":
    "Xem lại nội dung, sau đó chọn gửi qua email. Ứng dụng email sẽ mở để bạn hoàn tất việc gửi.",
  "contact.brief_intro_offline":
    "Bạn có thể sao chép hoặc tải về. Lời nhắn chưa được gửi đến ZUKATEK.",
  "contact.copy": "Sao chép",
  "contact.download": "Tải lời nhắn",
  "contact.send_mail": "Gửi qua email",
  "contact.mail_subject": "Tư vấn mua sản phẩm ZUKATEK",
  "contact.copied": "Đã sao chép lời nhắn.",
  "contact.copy_manual": "Bạn có thể chọn nội dung và sao chép thủ công.",
  "contact.downloaded":
    "Đã tải lời nhắn về thiết bị. Nội dung chưa được gửi đến ZUKATEK.",

  // One key per line of the e-mail body.
  "contact.brief.greeting": "Xin chào ZUKATEK,",
  "contact.brief.name": "Tôi là: {name}",
  "contact.brief.email": "Email: {email}",
  "contact.brief.audience": "Mua sản phẩm cho: {audience}",
  "contact.brief.product": "Sản phẩm quan tâm: {product}",
  "contact.brief.product_example": " (mẫu minh họa)",
  "contact.brief.product_any": "Cần tư vấn lựa chọn",
  "contact.brief.consultant": "Người tư vấn: {name}",
  "contact.brief.referrer": "Được giới thiệu bởi: {name}",
  "contact.brief.question": "Câu hỏi về sản phẩm:",
  "contact.brief.closing":
    "Mong nhận được tư vấn về tính năng, giá và cách sử dụng.",

  "chat.title": "Trò chuyện với ZUKATEK",
  // Shown before any conversation exists, so opening the widget costs no
  // request. The server writes the SAME wording as the first message once the
  // visitor actually writes — see greeting() in conversation/prompt.go. If one
  // side changes, the bubble appears to rewrite itself on the first send.
  "chat.greeting":
    "Chào bạn! Bạn đang cần giải quyết việc gì để mình gợi ý cho đúng?",
  "chat.greeting_referred":
    "Chào bạn! Bạn đang xem Zukatek qua giới thiệu của {name}. Bạn đang cần giải quyết việc gì để mình gợi ý cho đúng?",
  "chat.status_human": "Bạn đang nói chuyện với người phụ trách",
  "chat.status_waiting": "Đang chờ người phụ trách…",
  "chat.status_bot": "Tìm sản phẩm phù hợp với bạn",
  "chat.minimize": "Thu nhỏ chatbox",
  "chat.launcher_close": "Thu nhỏ chatbox ZUKATEK",
  "chat.launcher_open": "Mở chatbox ZUKATEK",
  "chat.degraded_badge": "RÚT GỌN",
  "chat.degraded_note":
    "Trợ lý đang trả lời rút gọn · Người phụ trách vẫn hỗ trợ được",
  "chat.log_label": "Nội dung trò chuyện",
  "chat.suggestions_label": "Câu hỏi gợi ý",
  "chat.suggestion_team": "Tôi cần quản lý công việc nhóm",
  "chat.suggestion_trial": "Có bản dùng thử không?",
  "chat.suggestion_human": "Cho tôi gặp người phụ trách",

  "chat.speaker_visitor": "Bạn",
  "chat.speaker_staff": "ZUKATEK · Người phụ trách",
  "chat.speaker_system": "ZUKATEK",
  "chat.speaker_assistant": "Trợ lý ZUKATEK",
  "chat.speaker_assistant_short": "ZUKATEK · Trả lời rút gọn",

  "chat.handoff_joined": "Đã có người phụ trách",
  "chat.handoff_waiting": "Đang chờ…",
  "chat.handoff_ask": "Gặp người thật",
  // The trailing space separates the link text from the arrow icon.
  "chat.contact_direct": "Liên hệ trực tiếp ",

  "chat.input_label": "Nhập tin nhắn",
  "chat.placeholder_human": "Nhắn cho người phụ trách…",
  "chat.placeholder_bot": "Hỏi ZUKATEK về sản phẩm…",
  "chat.send": "Gửi tin nhắn",
  "chat.footer": "Hỗ trợ sản phẩm từ ZUKATEK",

  "chat.error_connect": "Chưa kết nối được trợ lý. Bạn thử lại sau nhé.",
  "chat.error_turn_limit":
    "Cuộc trò chuyện đã dài. Bạn để lại liên hệ để bên mình chủ động gọi lại nhé.",
  "chat.error_send": "Chưa gửi được tin nhắn. Bạn thử lại giúp mình.",
  "chat.error_no_staff":
    "Hiện không có ai trực. Bạn để lại số điện thoại hoặc Zalo, bên mình liên hệ lại sớm.",
  "chat.error_handoff":
    "Chưa chuyển được. Bạn thử lại hoặc liên hệ trực tiếp bên dưới.",
} as const;

export const en: Record<keyof typeof vi, string> = {
  "contact.eyebrow": "ADVICE & BUYING",
  "contact.channel_member": "Talk to {name}",
  "contact.channel_team": "ZUKATEK product advice",
  "contact.zalo": "Message us on Zalo ↗",
  "contact.channel_pending":
    "A contact channel will be added soon. In the meantime you can send your message to the person who introduced you to ZUKATEK.",

  "contact.form_title": "Ask for product advice",
  "contact.form_intro": "Choose a product and tell us what you need.",
  "contact.form_intro_offline":
    "Write your enquiry here, then send it to the person who introduced you to ZUKATEK.",

  "contact.name_label": "Your name ",
  "contact.name_placeholder": "Enter your full name",
  "contact.email_label": "Email ",
  "contact.person_label": "Advisor",
  "contact.person_team": "The ZUKATEK team",
  "contact.product_label": "Product you are interested in",
  "contact.product_any": "I would like help choosing",
  "contact.product_example": " · Sample",
  "contact.audience_legend": "You are buying for",
  "contact.message_label": "What would you like to know? ",
  "contact.message_placeholder":
    "The product, the features you need, how many people will use it, or a question about pricing…",
  "contact.submit": "Send enquiry",
  "contact.note_email":
    "Review the message, then send it from your e-mail app. The form does not send anything itself.",
  "contact.note_offline":
    "The message is prepared on your device for you to copy or download; nothing is sent to ZUKATEK.",
  "contact.sending": "Sending...",
  "contact.sent": "Sent. We will get back to you as soon as we can.",
  "contact.send_failed":
    "That did not send. You can copy or download the message below and e-mail it instead.",
  "contact.note_send":
    "Sent straight to ZUKATEK. We reply to the e-mail address above.",
  "contact.recaptcha_notice": "This site is protected by reCAPTCHA; the Google",
  "contact.recaptcha_privacy": "Privacy Policy",
  "contact.recaptcha_terms": "Terms of Service apply",
  "contact.required": "Please fill this in before continuing.",

  "contact.brief_eyebrow": "ZUKATEK PRODUCT ADVICE",
  "contact.brief_title": "Your product enquiry",
  "contact.brief_intro_email":
    "Review the message, then choose to send it by e-mail. Your e-mail app will open so you can finish sending it.",
  "contact.brief_intro_offline":
    "You can copy it or download it. The message has not been sent to ZUKATEK.",
  "contact.copy": "Copy",
  "contact.download": "Download the message",
  "contact.send_mail": "Send by e-mail",
  "contact.mail_subject": "Product enquiry for ZUKATEK",
  "contact.copied": "Message copied.",
  "contact.copy_manual": "You can select the text and copy it yourself.",
  "contact.downloaded":
    "The message has been downloaded to your device. Nothing has been sent to ZUKATEK.",

  "contact.brief.greeting": "Hello ZUKATEK,",
  "contact.brief.name": "My name: {name}",
  "contact.brief.email": "Email: {email}",
  "contact.brief.audience": "Buying for: {audience}",
  "contact.brief.product": "Product I am interested in: {product}",
  "contact.brief.product_example": " (sample product)",
  "contact.brief.product_any": "I would like help choosing",
  "contact.brief.consultant": "Advisor: {name}",
  "contact.brief.referrer": "Referred by: {name}",
  "contact.brief.question": "My question about the product:",
  "contact.brief.closing":
    "I would like advice on the features, the price and how to use it.",

  "chat.title": "Chat with ZUKATEK",
  "chat.greeting":
    "Hello! What are you trying to solve, so I can point you to the right thing?",
  "chat.greeting_referred":
    "Hello! You arrived at Zukatek through {name}. What are you trying to solve, so I can point you to the right thing?",
  "chat.status_human": "You are talking to one of our team",
  "chat.status_waiting": "Waiting for someone from the team…",
  "chat.status_bot": "Find the product that fits you",
  "chat.minimize": "Minimise the chat",
  "chat.launcher_close": "Minimise the ZUKATEK chat",
  "chat.launcher_open": "Open the ZUKATEK chat",
  "chat.degraded_badge": "SHORT ANSWERS",
  "chat.degraded_note":
    "The assistant is giving short answers · Our team can still help",
  "chat.log_label": "Conversation",
  "chat.suggestions_label": "Suggested questions",
  "chat.suggestion_team": "I need to manage my team's work",
  "chat.suggestion_trial": "Is there a trial version?",
  "chat.suggestion_human": "Put me through to someone",

  "chat.speaker_visitor": "You",
  "chat.speaker_staff": "ZUKATEK · Our team",
  "chat.speaker_system": "ZUKATEK",
  "chat.speaker_assistant": "ZUKATEK assistant",
  "chat.speaker_assistant_short": "ZUKATEK · Short answers",

  "chat.handoff_joined": "Someone from the team has joined",
  "chat.handoff_waiting": "Waiting…",
  "chat.handoff_ask": "Talk to a person",
  "chat.contact_direct": "Contact us directly ",

  "chat.input_label": "Type a message",
  "chat.placeholder_human": "Message the team…",
  "chat.placeholder_bot": "Ask ZUKATEK about a product…",
  "chat.send": "Send message",
  "chat.footer": "Product support from ZUKATEK",

  "chat.error_connect":
    "Could not connect to the assistant. Please try again later.",
  "chat.error_turn_limit":
    "This conversation has run long. Leave your details and we will get back to you.",
  "chat.error_send": "The message did not go through. Please try again.",
  "chat.error_no_staff":
    "Nobody is on duty right now. Leave your phone number or Zalo and we will get back to you soon.",
  "chat.error_handoff":
    "We could not transfer you. Please try again, or contact us directly below.",
};
