/** npm run db:migrate – áp dụng các migration trong thư mục drizzle/ */
import { closeDb, ensureMigrated } from "@/lib/db";

ensureMigrated()
  .then(closeDb)
  .then(() => {
    console.log("[db] migrate xong");
    process.exit(0);
  })
  .catch((err) => {
    console.error("[db] migrate lỗi:", err);
    process.exit(1);
  });
