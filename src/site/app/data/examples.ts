import type { Product } from "../types";

// Mẫu thiết kế, không phải sản phẩm hoặc năng lực đã công bố của ZUKATEK.
export const examples: Product[] = [
  [
    "Bảng công việc",
    "Cộng tác",
    "Một không gian minh họa để sắp xếp công việc và theo dõi tiến độ của nhóm.",
    "Nhóm",
  ],
  [
    "Sổ ghi chú",
    "Công cụ cá nhân",
    "Ví dụ về một công cụ lưu ý tưởng, ghi chú và những điều cần nhớ.",
    "Cá nhân",
  ],
  [
    "Lịch hẹn",
    "Quản lý & vận hành",
    "Mẫu giao diện quản lý lịch hẹn và tổ chức các cuộc gặp trong ngày.",
    "Doanh nghiệp",
  ],
  [
    "Trợ lý tài liệu",
    "AI & tự động hóa",
    "Minh họa ý tưởng tìm kiếm và tổng hợp thông tin trong tài liệu.",
    "Cá nhân, Nhóm",
  ],
  [
    "Không gian dự án",
    "Cộng tác",
    "Mẫu sản phẩm kết nối tài liệu, thảo luận và các đầu việc của một dự án.",
    "Nhóm",
  ],
  [
    "Theo dõi chi tiêu",
    "Công cụ cá nhân",
    "Ví dụ về cách trình bày thu chi, mục tiêu và ngân sách cá nhân.",
    "Cá nhân",
  ],
  [
    "Danh bạ khách hàng",
    "Quản lý & vận hành",
    "Mẫu danh mục thông tin và lịch sử trao đổi với khách hàng.",
    "Doanh nghiệp",
  ],
  [
    "Luồng tự động",
    "AI & tự động hóa",
    "Minh họa cách kết nối các bước lặp lại thành một quy trình.",
    "Nhóm, Doanh nghiệp",
  ],
  [
    "Kho tri thức",
    "Cộng tác",
    "Ví dụ về nơi nhóm cùng chia sẻ hướng dẫn và kiến thức.",
    "Nhóm",
  ],
  [
    "Thói quen mỗi ngày",
    "Công cụ cá nhân",
    "Mẫu công cụ theo dõi thói quen và các mục tiêu nhỏ mỗi ngày.",
    "Cá nhân",
  ],
  [
    "Theo dõi kho",
    "Quản lý & vận hành",
    "Minh họa bố cục quản lý danh mục hàng hóa và biến động tồn kho.",
    "Doanh nghiệp",
  ],
  [
    "Tóm tắt cuộc họp",
    "AI & tự động hóa",
    "Ví dụ về một ý tưởng tổng hợp nội dung và các việc cần làm sau cuộc họp.",
    "Nhóm",
  ],
  [
    "Lịch của nhóm",
    "Cộng tác",
    "Mẫu lịch chung để theo dõi hoạt động và thời gian của nhóm.",
    "Nhóm",
  ],
  [
    "Bộ sưu tập ý tưởng",
    "Công cụ cá nhân",
    "Ví dụ về một nơi lưu liên kết, hình ảnh và nguồn cảm hứng.",
    "Cá nhân",
  ],
  [
    "Quản lý yêu cầu",
    "Quản lý & vận hành",
    "Mẫu công cụ tổ chức các yêu cầu và theo dõi trạng thái xử lý.",
    "Doanh nghiệp",
  ],
  [
    "Tìm kiếm thông minh",
    "AI & tự động hóa",
    "Minh họa ý tưởng tìm thông tin trong một không gian làm việc.",
    "Cá nhân, Nhóm",
  ],
].map(([name, category, summary, audience], index) => ({
  id: `example-${index + 1}`,
  name,
  category,
  summary,
  audience,
  description: `${summary} Đây là dữ liệu minh họa cho bố cục danh mục nhiều sản phẩm, chưa phải sản phẩm được ZUKATEK công bố.`,
  // Lifecycle CODES, as the API sends them — the card picks the word.
  status: ["launched", "building", "idea"][index % 3],
  featured: index < 6,
  example: true,
  skills: [],
  memberIds: [],
  demoUrl: "https://example.com",
  demoPlaceholder: true,
  demoAccess: "Link tạm · chưa có bản demo",
}));
