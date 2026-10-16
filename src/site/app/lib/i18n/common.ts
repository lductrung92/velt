/**
 * The words the shell says: the skip link, the navigation's spoken labels, the
 * referral banner, the page titles search engines read, and the code tables
 * that turn an API value into something a reader understands.
 *
 * Vietnamese is the source. Every string here was in the markup before it was
 * in this table, copied across unchanged — the page it produces has to be the
 * page that was already there.
 */
export const vi = {
  "listing.filters": "Bộ lọc",
  "listing.filters_active": "Bộ lọc, {count} lựa chọn đang áp dụng",
  "listing.filters_done": "Xong",
  "listing.view_label": "Kiểu hiển thị",
  "listing.view_grid": "Dạng lưới",
  "listing.view_list": "Dạng danh sách",
  "a11y.skip": "Đến nội dung chính",
  "a11y.brand_home": "ZUKATEK — về đầu trang",
  "a11y.nav_main": "Điều hướng chính",
  "a11y.nav_mobile": "Điều hướng trên điện thoại",
  "a11y.menu_open": "Mở menu",
  "a11y.menu_close": "Đóng menu",
  "a11y.close_dialog": "Đóng cửa sổ",
  "a11y.language": "{language} — chọn ngôn ngữ",

  "referral.intro": "Hồ sơ ZUKATEK được giới thiệu bởi",
  "referral.cta": "Trao đổi cùng người giới thiệu ↗",

  "seo.home_title": "ZUKATEK — Đội ngũ phát triển & sản phẩm số",
  "seo.blog_title": "Blog — Góc nhìn từ Zukatek",
  "seo.article_title": "{title} — Zukatek Journal",
  "seo.catalog_title": "Sản phẩm — ZUKATEK",
  "seo.product_title": "{name} — ZUKATEK",
  "seo.product_example_suffix": " · Minh họa",
  "seo.notfound_title": "Không tìm thấy — ZUKATEK",
  "seo.blog_description":
    "Kiến thức, kinh nghiệm và những câu chuyện trong hành trình xây dựng sản phẩm số của Zukatek.",
  "seo.default_description":
    "ZUKATEK cung cấp sản phẩm số cho cá nhân, nhóm và doanh nghiệp. Xem đội ngũ, khám phá sản phẩm và liên hệ tư vấn trước khi mua.",

  "noscript.note":
    "Vui lòng bật JavaScript để sử dụng bộ lọc, hồ sơ thành viên, biểu mẫu và chatbox.",

  // Codes the API sends. The site shows a word; it never compares one.
  "catalog.lifecycle.idea": "Ý tưởng",
  "catalog.lifecycle.building": "Đang phát triển",
  "catalog.lifecycle.launched": "Đã ra mắt",
  "catalog.audience.individual": "Cá nhân",
  "catalog.audience.team": "Nhóm",
  "catalog.audience.business": "Doanh nghiệp",
  "catalog.platform.web": "Web",
  "catalog.platform.ios": "iOS",
  "catalog.platform.android": "Android",
  "catalog.platform.desktop": "Desktop",
  "catalog.other": "Khác",
} as const;

export const en: Record<keyof typeof vi, string> = {
  "listing.filters": "Filters",
  "listing.filters_active": "Filters, {count} options applied",
  "listing.filters_done": "Done",
  "listing.view_label": "Display layout",
  "listing.view_grid": "Grid view",
  "listing.view_list": "List view",
  "a11y.skip": "Skip to main content",
  "a11y.brand_home": "ZUKATEK — back to top",
  "a11y.nav_main": "Main navigation",
  "a11y.nav_mobile": "Mobile navigation",
  "a11y.menu_open": "Open menu",
  "a11y.menu_close": "Close menu",
  "a11y.close_dialog": "Close dialog",
  "a11y.language": "{language} — choose a language",

  "referral.intro": "This ZUKATEK profile was shared with you by",
  "referral.cta": "Talk to the person who referred you ↗",

  "seo.home_title": "ZUKATEK — Product team & digital products",
  "seo.blog_title": "Blog — Views from Zukatek",
  "seo.article_title": "{title} — Zukatek Journal",
  "seo.catalog_title": "Products — ZUKATEK",
  "seo.product_title": "{name} — ZUKATEK",
  "seo.product_example_suffix": " · Sample",
  "seo.notfound_title": "Not found — ZUKATEK",
  "seo.blog_description":
    "Knowledge, experience and stories from Zukatek's work building digital products.",
  "seo.default_description":
    "ZUKATEK builds digital products for individuals, teams and companies. Meet the team, explore the products and ask for advice before you buy.",

  "noscript.note":
    "Please enable JavaScript to use the filters, member profiles, forms and chat.",

  "catalog.lifecycle.idea": "Idea",
  "catalog.lifecycle.building": "In development",
  "catalog.lifecycle.launched": "Launched",
  "catalog.audience.individual": "Individuals",
  "catalog.audience.team": "Teams",
  "catalog.audience.business": "Companies",
  "catalog.platform.web": "Web",
  "catalog.platform.ios": "iOS",
  "catalog.platform.android": "Android",
  "catalog.platform.desktop": "Desktop",
  "catalog.other": "Other",
};
