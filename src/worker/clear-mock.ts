/** npm run db:clear-mock – xoá dữ liệu mẫu (đổi SOURCES khỏi "mock" trước; PGlite: tắt npm run dev trước) */
import { closeDb } from "@/lib/db";
import { clearMockData } from "@/lib/clear-mock";

clearMockData()
  .then((r) => console.log("[db] Đã xoá dữ liệu mẫu:", r))
  .catch((err) => {
    console.error("[db]", (err as Error).message);
    process.exitCode = 1;
  })
  .then(closeDb)
  .then(() => process.exit());
