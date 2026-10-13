import type { SiteContent } from "../types";

// Bổ sung nội dung thật tại đây. Các trường trống có trạng thái chờ cập nhật.
export const content: SiteContent = {
  brand: "ZUKATEK",
  email: "",
  zalo: "", // URL liên hệ Zalo, nếu có.
  showProductExamples: true, // Chỉ dùng mẫu minh họa khi products trống. Đặt false để ẩn mẫu.
  members: Array.from({ length: 4 }, (_, i) => ({
    id: `member-${i + 1}`,
    name: `Thành viên ${String(i + 1).padStart(2, "0")}`,
    role: "",
    bio: "",
    skills: [],
    image: "",
    links: [], // { label: 'GitHub', url: 'https://...' }
    email: "", // Kênh công khai để khách liên hệ với người giới thiệu.
    zalo: "",
    color: ["blue", "purple", "orange", "green"][i],
  })),
  // Ví dụ cấu trúc khi đã có sản phẩm:
  // { id: '...', name: '...', summary: '...', description: '...',
  //   category: 'Cộng tác', audience: 'Nhóm', featured: true, createdAt: '2026-10-09',
  //   status: 'Đã ra mắt', image: 'assets/...', url: 'https://...',
  //   demoUrl: 'https://san-pham.ten-mien-team.vn', demoAccess: 'Không cần đăng nhập',
  //   demoInstructions: ['Chọn một dữ liệu mẫu', 'Thử tính năng chính'],
  //   forwardReferral: true, // Chỉ bật khi ứng dụng demo hỗ trợ nhận query ref.
  //   skills: ['...'], memberIds: ['member-1'] }
  products: [],
};
