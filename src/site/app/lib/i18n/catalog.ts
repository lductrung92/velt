/**
 * The product catalogue and a single product's page.
 *
 * Shape fixed by i18n/common.ts: Vietnamese is the source, English must cover
 * exactly the same keys or the build fails.
 *
 * The Vietnamese column is copied byte for byte out of the markup it replaced,
 * trailing spaces included: a label that sat right next to an icon keeps the
 * space that separated them, because JSX only produces one text node there and
 * a second one would change the HTML.
 *
 * `catalog.*` is the list, its filters and the cards; `product.*` is the single
 * product page. The two prices and the breadcrumb are the same words in both
 * places, so they are written once under `catalog.`.
 *
 * Lifecycle, audience and platform CODES are translated in common.ts.
 */
export const vi = {
  "catalog.breadcrumb": "Đường dẫn",
  "catalog.breadcrumb_home": "Trang chủ",
  "catalog.breadcrumb_products": "Sản phẩm",

  "catalog.hero_eyebrow": "HỆ SINH THÁI ZUKATEK",
  "catalog.hero_title": "Khám phá sản phẩm ZUKATEK",
  "catalog.hero_body":
    "Xem tính năng, mở bản trải nghiệm và liên hệ tư vấn trước khi mua.",
  "catalog.search_label": "Tìm sản phẩm",
  "catalog.search_placeholder": "Tìm sản phẩm…",
  "catalog.search_clear": "Xóa tìm kiếm",

  "catalog.example_note_title": "Danh mục minh họa",
  "catalog.example_note_body":
    "Các mẫu dùng để giới thiệu bố cục, chưa phải sản phẩm được ZUKATEK công bố.",

  "catalog.category_label": "Danh mục",
  "catalog.categories_label": "Lọc theo nhóm sản phẩm",
  "catalog.categories_all": "Tất cả",

  "catalog.showing_examples": "Hiển thị {from}–{to} trong {total} mẫu minh họa",
  "catalog.showing_products": "Hiển thị {from}–{to} trong {total} sản phẩm",
  "catalog.no_matches": "0 sản phẩm phù hợp",

  "catalog.status_label": "Trạng thái",
  "catalog.status_all": "Tất cả trạng thái",
  "catalog.sort_label": "Sắp xếp",
  "catalog.sort_featured": "Ưu tiên nổi bật",
  "catalog.sort_newest": "Mới nhất",
  "catalog.sort_name": "Tên A → Z",

  "catalog.empty_title": "Chưa tìm thấy sản phẩm phù hợp",
  "catalog.empty_body": "Thử một từ khóa khác hoặc bỏ bớt bộ lọc.",
  "catalog.empty_reset": "Xóa bộ lọc",

  "catalog.pagination_label": "Trang danh mục sản phẩm",
  "catalog.page_previous": "Trang trước",
  "catalog.page_next": "Trang sau",
  "catalog.page_number": "Trang {n}",

  "catalog.help_title": "Chưa tìm được điều bạn cần?",
  "catalog.help_body":
    "Hỏi ZUKATEK về tính năng, giá và cách sử dụng sản phẩm.",
  "catalog.help_cta": "Liên hệ",

  "catalog.visual_alt": "Giao diện {name}",
  "catalog.card_example": "Minh họa",
  "catalog.price_example": "Thông tin mẫu · chưa mở bán",
  "catalog.price_contact": "Liên hệ để nhận báo giá",
  "catalog.card_demo_placeholder": "Mở link tạm",
  "catalog.card_demo": "Trải nghiệm",
  "catalog.card_demo_placeholder_aria": "Mở link tạm cho {name}",
  "catalog.card_demo_aria": "Trải nghiệm {name}",
  "catalog.card_no_demo": "Chưa có bản demo",
  "catalog.card_demo_note": "Mở bản trải nghiệm trong tab mới",
  "catalog.card_detail": "Chi tiết ",
  "catalog.card_view_aria": "Xem {name}",

  "product.notfound_title": "Chưa tìm thấy sản phẩm",
  "product.notfound_body":
    "Sản phẩm có thể chưa được công bố hoặc đường dẫn đã thay đổi.",
  "product.notfound_cta": "Về danh mục sản phẩm",

  "product.example_note_title": "Mẫu minh họa",
  "product.example_note_body":
    "Đây là ví dụ bố cục, chưa phải sản phẩm được ZUKATEK công bố.",

  "product.demo_placeholder": "Mở link tạm",
  "product.demo": "Trải nghiệm sản phẩm",
  "product.contact_cta": "Tư vấn mua sản phẩm ",

  "product.demo_panel_placeholder_title": "Liên kết tạm để xem bố cục",
  "product.demo_panel_title": "Trải nghiệm trước khi mua",
  "product.demo_panel_placeholder_body":
    "Đường dẫn example.com chỉ dùng để kiểm tra nút mở trang riêng, chưa phải bản demo của ZUKATEK.",
  "product.demo_panel_body":
    "Mở trang trải nghiệm riêng để kiểm tra các tính năng của sản phẩm.",
  "product.demo_panel_none":
    "Sản phẩm này chưa có bản trải nghiệm công khai. Liên hệ ZUKATEK để được tư vấn.",

  "product.about_title": "Về sản phẩm",
  "product.skills_title": "Kỹ năng trong sản phẩm",

  "product.members_title": "Thành viên tham gia",
  "product.member_role": "Thành viên ZUKATEK",
  "product.members_example":
    "Thông tin thành viên sẽ xuất hiện cùng sản phẩm thực tế.",
  "product.members_pending": "Thông tin thành viên đang được cập nhật.",

  "product.related_title": "Khám phá thêm",
  "product.related_link": "Xem cùng nhóm ",
  "product.unavailable_title": "Tạm thời chưa tải được sản phẩm",
  "product.unavailable_body":
    "Bạn vui lòng thử lại sau ít phút hoặc quay về danh mục sản phẩm.",
  "product.gallery_image": "Giao diện sản phẩm",
  "product.image_unavailable": "Chưa tải được ảnh",
  "product.gallery_previous": "Ảnh trước",
  "product.gallery_next": "Ảnh tiếp theo",
  "product.gallery_eyebrow": "GIAO DIỆN SẢN PHẨM",
  "product.gallery_title": "Khám phá từng góc nhìn",
  "product.device_label": "Chọn khung trình bày ảnh",
  "product.device_phone": "Điện thoại",
  "product.device_tablet": "Máy tính bảng",
  "product.device_desktop": "Desktop",
  "product.hero_devices": "Giao diện trên các thiết bị",
  "product.gallery_expand": "Xem ảnh đầy đủ",
  "product.gallery_original": "Mở ảnh gốc trong tab mới",
  "product.gallery_choose": "Thư viện ảnh sản phẩm",
  "product.gallery_select": "Xem ảnh {number}: {caption}",
  "product.image_alt": "Giao diện {name}",
  "product.try_now": "Trải nghiệm ngay",
  "product.contact_short": "Nhận tư vấn",
  "product.available_on": "Sử dụng trên",
  "product.contents": "Nội dung trang sản phẩm",
  "product.gallery_nav": "Hình ảnh",
  "product.experience_nav": "Cách trải nghiệm",
  "product.highlights_title": "Điểm nổi bật",
  "product.videos_title": "Video giới thiệu",
  "product.video_number": "Video {number}",
  "product.info_title": "Thông tin sản phẩm",
  "product.status_label": "Trạng thái",
  "product.audience_label": "Dành cho",
  "product.platform_label": "Nền tảng",
  "product.version_label": "Phiên bản",
  "product.released_label": "Ngày ra mắt",
  "product.website": "Website sản phẩm",
  "product.technology_title": "Công nghệ sử dụng",
  "product.developers_title": "Đội ngũ phát triển",
  "product.experience_eyebrow": "BẮT ĐẦU TRẢI NGHIỆM",
  "product.experience_title": "Bắt đầu với {name}",
  "product.ask_advice": "Liên hệ tư vấn",
} as const;

export const en: Record<keyof typeof vi, string> = {
  "catalog.breadcrumb": "Breadcrumb",
  "catalog.breadcrumb_home": "Home",
  "catalog.breadcrumb_products": "Products",

  "catalog.hero_eyebrow": "THE ZUKATEK ECOSYSTEM",
  "catalog.hero_title": "Explore ZUKATEK products",
  "catalog.hero_body":
    "See what each one does, open a trial and ask for advice before you buy.",
  "catalog.search_label": "Search products",
  "catalog.search_placeholder": "Search products…",
  "catalog.search_clear": "Clear search",

  "catalog.example_note_title": "Sample catalogue",
  "catalog.example_note_body":
    "These samples are here to show the layout; they are not products ZUKATEK has announced.",

  "catalog.category_label": "Category",
  "catalog.categories_label": "Filter by product group",
  "catalog.categories_all": "All",

  "catalog.showing_examples": "Showing {from}–{to} of {total} samples",
  "catalog.showing_products": "Showing {from}–{to} of {total} products",
  "catalog.no_matches": "No products match",

  "catalog.status_label": "Status",
  "catalog.status_all": "All statuses",
  "catalog.sort_label": "Sort by",
  "catalog.sort_featured": "Featured first",
  "catalog.sort_newest": "Newest",
  "catalog.sort_name": "Name A → Z",

  "catalog.empty_title": "No products match your search",
  "catalog.empty_body": "Try another keyword, or drop one of the filters.",
  "catalog.empty_reset": "Clear filters",

  "catalog.pagination_label": "Product catalogue pages",
  "catalog.page_previous": "Previous page",
  "catalog.page_next": "Next page",
  "catalog.page_number": "Page {n}",

  "catalog.help_title": "Not finding what you need?",
  "catalog.help_body":
    "Ask ZUKATEK about features, pricing and how a product is used.",
  "catalog.help_cta": "Contact us",

  "catalog.visual_alt": "{name} interface",
  "catalog.card_example": "Sample",
  "catalog.price_example": "Sample listing · not on sale yet",
  "catalog.price_contact": "Contact us for a quote",
  "catalog.card_demo_placeholder": "Open sample link",
  "catalog.card_demo": "Try it",
  "catalog.card_demo_placeholder_aria": "Open the sample link for {name}",
  "catalog.card_demo_aria": "Try {name}",
  "catalog.card_no_demo": "No demo yet",
  "catalog.card_demo_note": "Opens the trial in a new tab",
  "catalog.card_detail": "Details ",
  "catalog.card_view_aria": "View {name}",

  "product.notfound_title": "Product not found",
  "product.notfound_body":
    "This product may not be published yet, or its address may have changed.",
  "product.notfound_cta": "Back to the catalogue",

  "product.example_note_title": "Sample product",
  "product.example_note_body":
    "This is a layout example, not a product ZUKATEK has announced.",

  "product.demo_placeholder": "Open sample link",
  "product.demo": "Try the product",
  "product.contact_cta": "Talk to us about buying ",

  "product.demo_panel_placeholder_title": "A sample link, to show the layout",
  "product.demo_panel_title": "Try it before you buy",
  "product.demo_panel_placeholder_body":
    "The example.com address only exists to test the button that opens a product's own site; it is not a ZUKATEK demo.",
  "product.demo_panel_body":
    "Open the product's own trial site and put its features to the test.",
  "product.demo_panel_none":
    "This product has no public trial yet. Contact ZUKATEK and we will talk you through it.",

  "product.about_title": "About the product",
  "product.skills_title": "Skills behind the product",

  "product.members_title": "Who worked on it",
  "product.member_role": "ZUKATEK team member",
  "product.members_example":
    "The people behind it will appear alongside the real product.",
  "product.members_pending": "We are still adding the people behind it.",

  "product.related_title": "Explore further",
  "product.related_link": "See the same group ",
  "product.unavailable_title": "This product is temporarily unavailable",
  "product.unavailable_body":
    "Please try again in a few minutes or return to the product catalogue.",
  "product.gallery_image": "Product interface",
  "product.image_unavailable": "Image could not be loaded",
  "product.gallery_previous": "Previous image",
  "product.gallery_next": "Next image",
  "product.gallery_eyebrow": "PRODUCT INTERFACE",
  "product.gallery_title": "Explore every perspective",
  "product.device_label": "Choose an image presentation frame",
  "product.device_phone": "Phone",
  "product.device_tablet": "Tablet",
  "product.device_desktop": "Desktop",
  "product.hero_devices": "The interface on each device",
  "product.gallery_expand": "View full image",
  "product.gallery_original": "Open original image in a new tab",
  "product.gallery_choose": "Product image gallery",
  "product.gallery_select": "View image {number}: {caption}",
  "product.image_alt": "{name} interface",
  "product.try_now": "Try it now",
  "product.contact_short": "Get advice",
  "product.available_on": "Available on",
  "product.contents": "Product page contents",
  "product.gallery_nav": "Gallery",
  "product.experience_nav": "Getting started",
  "product.highlights_title": "Highlights",
  "product.videos_title": "Product videos",
  "product.video_number": "Video {number}",
  "product.info_title": "Product information",
  "product.status_label": "Status",
  "product.audience_label": "Designed for",
  "product.platform_label": "Platform",
  "product.version_label": "Version",
  "product.released_label": "Release date",
  "product.website": "Product website",
  "product.technology_title": "Built with",
  "product.developers_title": "Development team",
  "product.experience_eyebrow": "GET STARTED",
  "product.experience_title": "Get started with {name}",
  "product.ask_advice": "Contact us for advice",
};
