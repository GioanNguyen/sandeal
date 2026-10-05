/** Trạng thái dòng hoa hồng từ chữ của sàn (tiếng Việt / tiếng Anh). Tách riêng để adapter dùng được mà không kéo theo DB */
import { fold } from "./autocategory";

export type LineStatus = "pending" | "completed" | "cancelled";

/** Trạng thái từ chữ của sàn (tiếng Việt / tiếng Anh) */
export function lineStatus(raw: string | null | undefined): LineStatus {
  const s = fold(raw ?? "");
  if (/ huy | cancel| invalid| khong hop le | tra hang| hoan tien| refund| fraud| gian lan| bi tu choi| rejected| that bai| failed/.test(s)) return "cancelled";
  if (/ hoan thanh | da hoan tat| complete| settled| da thanh toan| paid /.test(s)) return "completed";
  return "pending";
}

