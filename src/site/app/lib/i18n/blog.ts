/**
 * The blog: its list, its article page and its cards.
 *
 * Shape fixed by i18n/common.ts: Vietnamese is the source, English must cover
 * exactly the same keys or the build fails.
 *
 * A few values end in a space — "Xem sản phẩm " and friends sit directly before
 * an arrow icon, and the space is part of the markup that was already there.
 * The masthead lead is split in two because a <br> breaks it; each half is its
 * own key so English can break where English wants to.
 */
export const vi = {
  "blog.a11y.breadcrumb": "Đường dẫn",
  "blog.breadcrumb_home": "Trang chủ",
  "blog.breadcrumb_article": "Bài viết",

  "blog.masthead_title": "Góc nhìn từ Zukatek",
  "blog.masthead_lead_1": "Chia sẻ kiến thức, kinh nghiệm và những câu chuyện",
  "blog.masthead_lead_2": " trong hành trình xây dựng sản phẩm số.",

  "blog.list_title": "Bài viết",
  "blog.search_results_title": "Kết quả tìm kiếm",
  "blog.search_label": "Tìm bài viết",
  "blog.search_placeholder": "Tìm bài viết…",
  "blog.a11y.search_submit": "Tìm kiếm bài viết",
  "blog.sort_label": "Sắp xếp bài viết",
  "blog.sort.newest": "Mới nhất",
  "blog.sort.oldest": "Cũ nhất",
  "blog.sort.title": "Tên A → Z",
  "blog.results_for": "Kết quả cho “{query}”",
  "blog.all_articles_summary": "Danh sách bài viết",
  "blog.clear_filters": "Xóa bộ lọc",
  "blog.more_title": "Khám phá thêm",
  "blog.all_title": "Tất cả bài viết",
  "blog.grid_subtitle": "Kiến thức được chia sẻ, giá trị được nối dài.",
  "blog.a11y.pagination": "Phân trang bài viết",
  "blog.a11y.prev_page": "Trang trước",
  "blog.a11y.next_page": "Trang sau",
  "blog.a11y.page": "Trang {n}",

  "blog.endnote_title": "Từ một ý tưởng, đến những điều hữu ích.",
  "blog.endnote_body": "Khám phá các sản phẩm được đội ngũ Zukatek xây dựng.",
  "blog.endnote_cta": "Xem sản phẩm ",

  "blog.empty.error_title": "Chưa thể tải bài viết",
  "blog.empty.filtered_title": "Chưa tìm thấy bài viết phù hợp",
  "blog.empty.title": "Những câu chuyện đang được viết",
  "blog.empty.error_body": "Vui lòng thử lại sau ít phút.",
  "blog.empty.filtered_body": "Thử từ khóa khác hoặc xem lại toàn bộ bài viết.",
  "blog.empty.body": "Ghé lại để đọc những chia sẻ mới từ đội ngũ Zukatek.",
  "blog.empty.retry": "Thử lại",
  "blog.empty.view_all": "Xem tất cả bài viết",

  "blog.home_lead":
    "Kiến thức, kinh nghiệm và những câu chuyện trong hành trình làm sản phẩm.",
  "blog.home_cta": "Khám phá Blog ",
  "blog.home_unavailable":
    "Chưa thể tải bài viết lúc này. Bạn có thể thử lại tại Blog.",
  "blog.home_empty": "Những câu chuyện từ Zukatek sẽ được chia sẻ tại đây.",
  "blog.home_visit": "Ghé thăm Blog ",

  "blog.card.latest": "BÀI VIẾT MỚI NHẤT",
  "blog.card.read": "Đọc bài viết ",

  "blog.article.missing_title": "Bài viết không còn khả dụng",
  "blog.article.missing_body":
    "Bài viết có thể đã được gỡ hoặc đường dẫn chưa chính xác.",
  "blog.article.back_cta": "Trở về Blog ",
  "blog.article.read_minutes": "{n} phút đọc",
  "blog.article.toc_title": "Trong bài viết này",
  "blog.a11y.toc": "Mục lục bài viết",
  "blog.article.share": "Chia sẻ bài viết",
  "blog.article.share_on": "Chia sẻ qua {network}",
  "blog.article.zalo_paste":
    "Liên kết đã được sao chép. Dán vào Zalo để chia sẻ.",
  "blog.article.copy_link": "Sao chép liên kết",
  "blog.article.copied": "Đã sao chép",
  "blog.article.copy_ok": "Liên kết đã được sao chép.",
  "blog.article.copy_fail": "Bạn có thể sao chép đường dẫn trên thanh địa chỉ.",
  "blog.article.empty_body": "Nội dung bài viết đang được cập nhật.",
  "blog.article.signoff": "Cảm ơn bạn đã đọc và đồng hành cùng Zukatek.",
  "blog.article.back_link": "← Trở về Blog",
  "blog.article.related_eyebrow": "ĐỌC TIẾP",
  "blog.article.related_title": "Có thể bạn quan tâm",
  "blog.article.related_all": "Tất cả bài viết ",
} as const;

export const en: Record<keyof typeof vi, string> = {
  "blog.a11y.breadcrumb": "Breadcrumb",
  "blog.breadcrumb_home": "Home",
  "blog.breadcrumb_article": "Article",

  "blog.masthead_title": "Views from Zukatek",
  "blog.masthead_lead_1": "Knowledge, experience and the stories behind",
  "blog.masthead_lead_2": " the digital products we build.",

  "blog.list_title": "Articles",
  "blog.search_results_title": "Search results",
  "blog.search_label": "Search articles",
  "blog.search_placeholder": "Search articles…",
  "blog.a11y.search_submit": "Search articles",
  "blog.sort_label": "Sort articles",
  "blog.sort.newest": "Newest first",
  "blog.sort.oldest": "Oldest first",
  "blog.sort.title": "Title A → Z",
  "blog.results_for": "Results for “{query}”",
  "blog.all_articles_summary": "All articles",
  "blog.clear_filters": "Clear filters",
  "blog.more_title": "More to read",
  "blog.all_title": "All articles",
  "blog.grid_subtitle": "Knowledge shared is value carried further.",
  "blog.a11y.pagination": "Article pagination",
  "blog.a11y.prev_page": "Previous page",
  "blog.a11y.next_page": "Next page",
  "blog.a11y.page": "Page {n}",

  "blog.endnote_title": "From an idea to something genuinely useful.",
  "blog.endnote_body": "Explore the products the Zukatek team has built.",
  "blog.endnote_cta": "See the products ",

  "blog.empty.error_title": "We couldn't load the articles",
  "blog.empty.filtered_title": "No articles match that search",
  "blog.empty.title": "The stories are still being written",
  "blog.empty.error_body": "Please try again in a few minutes.",
  "blog.empty.filtered_body": "Try another keyword, or browse every article.",
  "blog.empty.body": "Come back soon for the latest from the Zukatek team.",
  "blog.empty.retry": "Try again",
  "blog.empty.view_all": "View all articles",

  "blog.home_lead":
    "Knowledge, experience and the stories behind the products we build.",
  "blog.home_cta": "Explore the blog ",
  "blog.home_unavailable":
    "We couldn't load the articles right now. You can try again on the blog.",
  "blog.home_empty": "Stories from Zukatek will appear here.",
  "blog.home_visit": "Visit the blog ",

  "blog.card.latest": "LATEST ARTICLE",
  "blog.card.read": "Read the article ",

  "blog.article.missing_title": "This article is no longer available",
  "blog.article.missing_body":
    "It may have been taken down, or the link may not be quite right.",
  "blog.article.back_cta": "Back to the blog ",
  "blog.article.read_minutes": "{n} min read",
  "blog.article.toc_title": "In this article",
  "blog.a11y.toc": "Article contents",
  "blog.article.share": "Share this article",
  "blog.article.share_on": "Share via {network}",
  "blog.article.zalo_paste": "Link copied. Paste it into Zalo to share.",
  "blog.article.copy_link": "Copy link",
  "blog.article.copied": "Copied",
  "blog.article.copy_ok": "The link has been copied.",
  "blog.article.copy_fail": "You can copy the address from the address bar.",
  "blog.article.empty_body": "This article is being updated.",
  "blog.article.signoff":
    "Thanks for reading, and for travelling with Zukatek.",
  "blog.article.back_link": "← Back to the blog",
  "blog.article.related_eyebrow": "KEEP READING",
  "blog.article.related_title": "You might also like",
  "blog.article.related_all": "All articles ",
};
