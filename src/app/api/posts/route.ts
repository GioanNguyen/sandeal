import { redirectTo } from "@/lib/redirect";
import { getCurrentUser } from "@/lib/auth";
import { shareDeal } from "@/lib/community";
import { allow } from "@/lib/ratelimit";

/** Chia sẻ deal (form thường) */
export async function POST(req: Request) {
  const back = (q: string) => redirectTo(`/cong-dong?${q}`, 303);
  const user = await getCurrentUser();
  if (!user) return redirectTo("/login?next=/cong-dong", 303);
  const f = await req.formData();
  if (f.get("website")) return back("tab=new");
  if (!(await allow(`post:${user.id}`, 10, 86400))) return back(`error=${encodeURIComponent("Mỗi ngày chia sẻ tối đa 10 deal.")}`);
  const r = await shareDeal(user.id, String(f.get("url") ?? ""), String(f.get("note") ?? ""));
  if (!r.ok) return back(`error=${encodeURIComponent(r.error)}`);
  return back(r.existed ? `tab=new&existed=${r.productId}` : "tab=new&posted=1");
}
