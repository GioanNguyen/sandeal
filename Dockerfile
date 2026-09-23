# ---- build ----
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# ---- runtime (dùng chung cho web, worker, migrate) ----
FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000 TZ=Asia/Ho_Chi_Minh
COPY --from=build /app /app
USER node
EXPOSE 3000
CMD ["npm", "start"]
