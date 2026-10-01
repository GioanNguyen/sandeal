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
ENV NODE_ENV=production PORT=3000 TZ=Asia/Ho_Chi_Minh IMAGE_MODEL_DIR=/models
COPY --from=build /app /app
# Mô hình nhận diện ảnh (Tìm bằng ảnh) tải về đây, gắn volume để không tải lại mỗi lần build
RUN mkdir -p /models && chown node:node /models
USER node
EXPOSE 3000
CMD ["npm", "start"]
