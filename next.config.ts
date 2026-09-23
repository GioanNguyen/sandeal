import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Docker build đặt NEXT_OUTPUT=standalone để đóng gói gọn
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  images: { unoptimized: true },
  // Font cho ảnh chia sẻ (Open Graph) được đọc từ đĩa lúc chạy
  outputFileTracingIncludes: { "/**/opengraph-image*": ["./src/assets/fonts/**"] },
  serverExternalPackages: ["@electric-sql/pglite", "pg", "node-cron", "nodemailer"],
};

export default nextConfig;
