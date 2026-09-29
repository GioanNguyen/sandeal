/**
 * Nhập file CSV "Lấy link sản phẩm hàng loạt" của Shopee Affiliate từ dòng lệnh:
 *   npm run import:csv -- duong-dan/file1.csv [file2.csv ...]
 * Dùng PGlite thì tắt `npm run dev` trước (hoặc nhập qua nút “Nhập CSV Shopee” trong /admin).
 */
import { readFile } from "node:fs/promises";
import { closeDb } from "@/lib/db";
import { importShopeeCsv } from "@/lib/shopee-csv";

async function main(files: string[]) {
  if (!files.length) {
    console.error("Cách dùng: npm run import:csv -- <file.csv> [file2.csv ...]");
    process.exitCode = 1;
    return;
  }
  for (const f of files) {
    const r = await importShopeeCsv(await readFile(f, "utf8"));
    console.log(`[csv] ${f}: ${r.imported} sản phẩm (${r.created} mới, ${r.updated} cập nhật), ${r.noImage} chưa có ảnh`);
    for (const s of r.skipped) console.log(`  bỏ qua dòng ${s.line}: ${s.reason}`);
  }
}

main(process.argv.slice(2))
  .catch((err) => {
    console.error("[csv] lỗi:", (err as Error).message);
    process.exitCode = 1;
  })
  .then(closeDb)
  .then(() => process.exit());
