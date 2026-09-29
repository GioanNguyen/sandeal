/**
 * Xoá dữ liệu mẫu (SOURCES=mock và npm run seed) để bắt đầu với dữ liệu thật:
 * sản phẩm "mock-*" (kèm lịch sử giá, lượt xem, bình chọn… xoá theo), lượt bấm vào các món đó, mã giảm giá mẫu,
 * đơn hàng/hoa hồng mẫu, người dùng demo và từ khoá tìm kiếm mẫu. Dữ liệu thật không bị đụng tới.
 */
import { sql } from "drizzle-orm";
import { enabledAdapters } from "@/adapters";
import { db, ensureMigrated } from "./db";

const SEED_SEARCHES = ["tai nghe", "nồi chiên", "kem chống nắng", "sạc dự phòng", "serum", "bàn phím", "giày chạy bộ"];

export interface ClearReport {
  products: number;
  clicks: number;
  vouchers: number;
  conversions: number;
  users: number;
  searches: number;
}

export async function clearMockData(): Promise<ClearReport> {
  if (enabledAdapters().some((a) => a.name === "mock")) {
    throw new Error('Nguồn mẫu vẫn đang bật: đổi SOURCES trong .env (vd SOURCES="none") và khởi động lại web trước, nếu không lần đồng bộ sau sẽ tạo lại dữ liệu mẫu.');
  }
  await ensureMigrated();
  const mockProducts = sql`select id from products where external_id like 'mock-%' or name like '%(dữ liệu mẫu #%'`;
  return db.transaction(async (tx) => {
    const n = async (q: ReturnType<typeof sql>) => ((await tx.execute(q)).rows as unknown[]).length;
    return {
      clicks: await n(sql`delete from clicks where product_id in (${mockProducts}) returning id`),
      products: await n(sql`delete from products where id in (${mockProducts}) returning id`),
      vouchers: await n(sql`delete from vouchers where source = 'mock' returning id`),
      conversions: await n(sql`delete from conversions where source = 'mock' returning id`),
      users: await n(sql`delete from users where email like '%@sandeal.local' returning id`),
      searches: await n(sql`delete from search_log where results = 3 and q in (${sql.join(SEED_SEARCHES.map((q) => sql`${q}`), sql`, `)}) returning id`),
    };
  });
}
