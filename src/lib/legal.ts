/** Thông tin dùng chung cho trang Chính sách bảo mật và Điều khoản sử dụng */

/** Ngày cập nhật nội dung chính sách/điều khoản (đổi khi sửa nội dung) */
export const LEGAL_UPDATED = "02/10/2026";

/** Email nhận câu hỏi và yêu cầu xoá dữ liệu: CONTACT_EMAIL, không có thì email quản trị đầu tiên */
export function contactEmail(): string | null {
  const c = process.env.CONTACT_EMAIL?.trim();
  if (c && c.includes("@")) return c;
  const admin = (process.env.ADMIN_EMAILS || "").split(",").map((s) => s.trim()).find((s) => s.includes("@"));
  return admin ?? null;
}
