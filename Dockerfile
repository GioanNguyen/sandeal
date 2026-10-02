# ---- build ----
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# ---- runtime (dùng chung cho web, worker, migrate) ----
FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000 TZ=Asia/Ho_Chi_Minh IMAGE_MODEL_DIR=/models REELS_DIR=/reels
# ffmpeg: dựng video Reels tự động
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
COPY --from=build /app /app
# Mô hình nhận diện ảnh (Tìm bằng ảnh) tải về đây, gắn volume để không tải lại mỗi lần build; /reels: video Reels tạm
RUN mkdir -p /models /reels && chown node:node /models /reels
USER node
EXPOSE 3000
CMD ["npm", "start"]
