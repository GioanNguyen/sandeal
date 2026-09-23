/** npm run db:migrate – áp dụng các migration trong thư mục drizzle/ */
import { ensureMigrated } from "@/lib/db";

ensureMigrated()
  .then(() => {
    console.log("[db] migrate xong");
    process.exit(0);
  })
  .catch((err) => {
    console.error("[db] migrate lỗi:", err);
    process.exit(1);
  });
