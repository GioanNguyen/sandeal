/** Giá quá ngần này ngày chưa cập nhật là "giá cũ" (đặt riêng để observe.ts dùng được mà không vòng import với extqueue.ts) */
export const STALE_PRICE_DAYS = () => Math.max(1, Number(process.env.STALE_PRICE_DAYS) || 3);
