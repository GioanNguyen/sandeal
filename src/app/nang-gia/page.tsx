import { redirect } from "next/navigation";
import { currentRaisePage } from "@/lib/salepages";

export const dynamic = "force-dynamic";

/** /nang-gia -> bảng của đợt sale đang diễn ra / sắp tới */
export default function RaiseIndex() {
  redirect(`/nang-gia/${currentRaisePage().slug}`);
}
