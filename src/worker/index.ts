/** Tiến trình worker riêng (dùng khi chạy Postgres thật, vd docker compose) */
import { ensureMigrated } from "@/lib/db";
import { startScheduler } from "./scheduler";

ensureMigrated().then(() => startScheduler({ runNow: true }));
