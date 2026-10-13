/**
 * The team section, the home page's own words and its artwork labels.
 *
 * Shape fixed by i18n/common.ts: Vietnamese is the source, English must cover
 * exactly the same keys or the build fails.
 *
 * A few values carry a leading or trailing space on purpose. They sit next to
 * another node in the markup — a count, a name, an icon — and the space is the
 * one the page already had; moving it into the JSX would split one text node
 * into two and change the HTML the server sends.
 */
export const vi = {
  // Team section
  "team.eyebrow": "ĐỘI NGŨ ZUKATEK",
  "team.product_eyebrow": "SẢN PHẨM ZUKATEK",
  "team.member_count": " thành viên",
  "team.profiles_title": "Gặp gỡ đội ngũ",
  "team.profiles_subtitle":
    "Khám phá hồ sơ, kỹ năng và sản phẩm từng thành viên tham gia.",
  "team.filter_label": "Lọc thành viên theo kỹ năng",
  "team.filter_all": "Tất cả thành viên",
  "team.list_label": "Danh sách thành viên ZUKATEK",
  "team.role_pending": "Chuyên môn đang cập nhật",
  "team.product_count": " sản phẩm tham gia",
  "team.view_profile": "Xem hồ sơ",
  "team.view_profile_of": "Xem hồ sơ {name}",
  "team.empty_filter": "Chưa có thành viên phù hợp.",
  "team.footnote_portraits":
    "Tên, chân dung và chuyên môn của từng thành viên đang được cập nhật.",
  "team.footnote_profiles":
    "Thông tin giới thiệu và chuyên môn sẽ được bổ sung trong hồ sơ thành viên.",

  // Member and product detail
  "team.role_soon": "Hồ sơ sắp cập nhật",
  "team.bio_soon":
    "Thông tin giới thiệu của thành viên sẽ sớm được bổ sung. Cùng quay lại để khám phá vai trò, góc nhìn và thế mạnh của mỗi người trong ZUKATEK.",
  "team.skills_title": "Kỹ năng & thế mạnh",
  "team.skills_empty": "Thông tin kỹ năng đang được cập nhật.",
  "team.products_title": "Sản phẩm tham gia",
  "team.products_empty": "Chưa có sản phẩm được công bố.",
  "team.copy_link": "Sao chép link giới thiệu của ",
  "team.copy_done": "Đã sao chép link hồ sơ. Bạn có thể gửi cho khách.",
  "team.copy_manual": "Sao chép link: {link}",
  "team.product_image_alt": "Giao diện {name}",
  "team.product_skills_title": "Kỹ năng trong sản phẩm",
  "team.demo_placeholder": "Mở link tạm",
  "team.demo_open": "Trải nghiệm sản phẩm",

  // Team globe artwork
  "team.globe_caption": "Minh họa đội ngũ Zukatek",
  "team.globe_art": "Địa cầu Zukatek và các nhân vật minh họa đội ngũ",
  "team.globe_open_profile": "Mở hồ sơ {name} trên địa cầu",

  // Home page: hero call to action and the three benefits
  "home.hero_cta": "Xem sản phẩm ",
  "home.hero_note": "Tìm hiểu đội ngũ phát triển sản phẩm",
  "home.benefit.team.title": "Đội ngũ phát triển",
  "home.benefit.team.body":
    "Tìm hiểu thành viên, kỹ năng và sản phẩm mỗi người tham gia.",
  "home.benefit.try.title": "Trải nghiệm trước khi mua",
  "home.benefit.try.body":
    "Xem tính năng và dùng thử các sản phẩm có bản demo.",
  "home.benefit.advice.title": "Tư vấn trực tiếp",
  "home.benefit.advice.body":
    "Liên hệ thành viên giới thiệu để được tư vấn lựa chọn sản phẩm.",

  // Home page: the product grid around the console's own copy
  "home.example_badge": "Danh mục minh họa",
  "home.example_note":
    "Tên và nội dung đang là mẫu thiết kế. Nút “Mở link tạm” dẫn đến example.com, chưa phải demo của ZUKATEK.",
  "home.categories_label": "Nhóm sản phẩm",
  "home.sample_unit": "mẫu minh họa",
  "home.product_unit": "sản phẩm",
  "home.category_all": "Tuyển chọn để khám phá",
  "home.browse_all": "Khám phá toàn bộ danh mục ",

  // Home page: the empty catalogue
  "home.empty.tag": "HÀNH TRÌNH MỚI BẮT ĐẦU",
  "home.empty.title": "Danh mục sản phẩm\nđang được cập nhật",
  "home.empty.body":
    "Sản phẩm được công bố sẽ có thông tin tính năng, đường dẫn trải nghiệm và thành viên phụ trách.",
  "home.empty.cta": "Nhận tư vấn sản phẩm ",

  // Hero artwork: the four product cards and what they show
  "hero.art.visual_label":
    "Minh họa các sản phẩm độc lập của Zukatek dành cho cá nhân, nhóm, hộ kinh doanh và doanh nghiệp",
  "hero.art.caption": "Minh họa hệ sinh thái sản phẩm Zukatek",
  "hero.art.individual.label": "Cá nhân",
  "hero.art.individual.detail": "Tập trung mỗi ngày",
  "hero.art.group.label": "Nhóm",
  "hero.art.group.detail": "Phối hợp công việc",
  "hero.art.shop.label": "Hộ kinh doanh",
  "hero.art.shop.detail": "Vận hành gọn gàng",
  "hero.art.business.label": "Doanh nghiệp",
  "hero.art.business.detail": "Theo dõi tổng quan",
  "hero.art.task.one": "Lên kế hoạch",
  "hero.art.task.two": "Hoàn thiện ý tưởng",
  "hero.art.task.three": "Sắp xếp công việc",
  "hero.art.board.todo": "CẦN LÀM",
  "hero.art.board.doing": "ĐANG LÀM",
  "hero.art.board.done": "HOÀN TẤT",
  "hero.art.receipt": "Phiếu bán hàng",
  "hero.art.footer": "Mỗi sản phẩm, một trải nghiệm riêng.",
} as const;

export const en: Record<keyof typeof vi, string> = {
  "team.eyebrow": "THE ZUKATEK TEAM",
  "team.product_eyebrow": "ZUKATEK PRODUCTS",
  "team.member_count": " members",
  "team.profiles_title": "Meet the team",
  "team.profiles_subtitle":
    "Browse each member's profile, their skills and the products they work on.",
  "team.filter_label": "Filter members by skill",
  "team.filter_all": "All members",
  "team.list_label": "ZUKATEK team members",
  "team.role_pending": "Role coming soon",
  "team.product_count": " products",
  "team.view_profile": "View profile",
  "team.view_profile_of": "View {name}'s profile",
  "team.empty_filter": "No members match that skill yet.",
  "team.footnote_portraits":
    "Names, portraits and areas of expertise are still being added for each member.",
  "team.footnote_profiles":
    "Introductions and areas of expertise will be added to the member profiles.",

  "team.role_soon": "Profile coming soon",
  "team.bio_soon":
    "An introduction to this member is on the way. Come back to see the role, the perspective and the strengths each person brings to ZUKATEK.",
  "team.skills_title": "Skills & strengths",
  "team.skills_empty": "Skills are still being added.",
  "team.products_title": "Products worked on",
  "team.products_empty": "No products announced yet.",
  "team.copy_link": "Copy the referral link for ",
  "team.copy_done": "Profile link copied. You can send it to a customer.",
  "team.copy_manual": "Copy this link: {link}",
  "team.product_image_alt": "The {name} interface",
  "team.product_skills_title": "Skills used in this product",
  "team.demo_placeholder": "Open sample link",
  "team.demo_open": "Try the product",

  "team.globe_caption": "An illustration of the Zukatek team",
  "team.globe_art":
    "A globe with illustrated figures standing for the Zukatek team",
  "team.globe_open_profile": "Open {name}'s profile on the globe",

  "home.hero_cta": "See the products ",
  "home.hero_note": "Meet the team behind the products",
  "home.benefit.team.title": "The people who build it",
  "home.benefit.team.body":
    "Meet the members, their skills and the products each one works on.",
  "home.benefit.try.title": "Try before you buy",
  "home.benefit.try.body":
    "See what each product does and try the ones that have a demo.",
  "home.benefit.advice.title": "Advice, in person",
  "home.benefit.advice.body":
    "Talk to the member who referred you about which product fits you best.",

  "home.example_badge": "Sample catalogue",
  "home.example_note":
    "These names and descriptions are placeholders. The “Open sample link” button goes to example.com, not to a real ZUKATEK demo.",
  "home.categories_label": "Product categories",
  "home.sample_unit": "samples",
  "home.product_unit": "products",
  "home.category_all": "A selection to explore",
  "home.browse_all": "Browse the full catalogue ",

  "home.empty.tag": "THE JOURNEY IS JUST BEGINNING",
  "home.empty.title": "The product catalogue\nis on its way",
  "home.empty.body":
    "Every product we publish will come with its features, a link to try it and the members behind it.",
  "home.empty.cta": "Ask us about a product ",

  "hero.art.visual_label":
    "An illustration of Zukatek's separate products for individuals, teams, small businesses and companies",
  "hero.art.caption": "An illustration of the Zukatek product family",
  "hero.art.individual.label": "Individual",
  "hero.art.individual.detail": "Focus, every day",
  "hero.art.group.label": "Team",
  "hero.art.group.detail": "Work in step",
  "hero.art.shop.label": "Small business",
  "hero.art.shop.detail": "Run it neatly",
  "hero.art.business.label": "Company",
  "hero.art.business.detail": "See the whole picture",
  "hero.art.task.one": "Make a plan",
  "hero.art.task.two": "Finish the idea",
  "hero.art.task.three": "Sort out the work",
  "hero.art.board.todo": "TO DO",
  "hero.art.board.doing": "IN PROGRESS",
  "hero.art.board.done": "DONE",
  "hero.art.receipt": "Sales receipt",
  "hero.art.footer": "Every product, an experience of its own.",
};
