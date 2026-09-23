import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Docker build đặt NEXT_OUTPUT=standalone để đóng gói gọn
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  images: { unoptimized: true },
  serverExternalPackages: ["@electric-sql/pglite", "pg", "node-cron", "nodemailer"],
};

export default nextConfig;
