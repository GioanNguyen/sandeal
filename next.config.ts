import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Docker build đặt NEXT_OUTPUT=standalone để đóng gói gọn
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  images: { unoptimized: true },
  // Font + logo cho ảnh chia sẻ (Open Graph) được đọc từ đĩa lúc chạy
  outputFileTracingIncludes: {
    "/**/opengraph-image*": ["./src/assets/fonts/**", "./src/assets/logo-sandeal.png"],
    "/api/share-image/*": ["./src/assets/fonts/**"],
    // Tìm bằng ảnh: onnxruntime-node được nạp động (createRequire) nên bộ đóng gói không tự thấy.
    // Chỉ chép thư viện máy của đúng hệ điều hành/CPU đang build (cả gói ~300 MB cho mọi nền tảng).
    "/api/image-search": [
      "./node_modules/onnxruntime-node/package.json",
      "./node_modules/onnxruntime-node/dist/**",
      `./node_modules/onnxruntime-node/bin/napi-v*/${process.platform}/${process.arch}/**`,
      "./node_modules/onnxruntime-common/**",
    ],
  },
  serverExternalPackages: ["@electric-sql/pglite", "pg", "node-cron", "nodemailer", "@huggingface/transformers", "onnxruntime-node", "sharp"],
};

export default nextConfig;
