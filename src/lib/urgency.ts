export type Level = "calm" | "soon" | "urgent" | "critical" | "ended";

/** Mức khẩn cấp theo thời gian còn lại (dùng chung server & client) */
export function levelOf(msLeft: number): Level {
  if (msLeft <= 0) return "ended";
  if (msLeft < 3_600_000) return "critical"; // < 1 giờ
  if (msLeft < 3 * 3_600_000) return "urgent"; // < 3 giờ
  if (msLeft < 24 * 3_600_000) return "soon"; // < 24 giờ
  return "calm";
}

