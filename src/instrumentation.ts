/**
 * Chạy khi server Next.js khởi động. Import có điều kiện theo đúng mẫu của Next.js
 * để bản build cho Edge runtime không kéo theo các module chỉ có ở Node (fs, pg, pglite...).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startup } = await import("./instrumentation-node");
    await startup();
  }
}
