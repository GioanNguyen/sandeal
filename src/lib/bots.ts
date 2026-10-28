/**
 * Nhận ra lượt truy cập không phải người thật – dùng chung cho lượt bấm "Mua" (/go), lượt xem, người đang online, đo tốc độ.
 * Gồm: bot tìm kiếm, bot xem trước link khi dán vào Facebook / Messenger / Zalo / Telegram / Slack…, công cụ đo tốc độ,
 * thư viện gọi HTTP (curl, python…), trình duyệt không giao diện.
 * Không chặn trình duyệt trong app (Facebook "FBAN/FBAV", Zalo "ZaloTheme"…): đó là người thật bấm link trong app.
 */
const BOT_UA =
  /bot\b|bot\/|crawl|spider|slurp|preview|externalhit|facebookcatalog|meta-externalagent|meta-externalfetcher|whatsapp|skypeuripreview|discord|slack|linkedin|embedly|quora link|pinterest\/|vkshare|lighthouse|pagespeed|gtmetrix|headless|phantomjs|puppeteer|playwright|selenium|curl\/|wget\/|python-|python\/|aiohttp|httpx|axios\/|node-fetch|undici|got \(|okhttp|java\/|go-http-client|libwww|scrapy|feedfetcher|validator|monitor|uptime|pingdom|statuscake|ahrefs|semrush|mj12|dotbot|petalbot|bytespider|yandex|baiduspider|sogou|coccocbot|applebot|google-inspectiontool|googleother|google-read-aloud|zalo.*(bot|crawl|preview|link)/i;

export const isBotUa = (ua: string | null | undefined) => !ua || ua.length < 10 || BOT_UA.test(ua);

/** Trình duyệt tải trước trang (prefetch / prerender) – không phải người bấm */
export const isPrefetch = (h: Headers) => /prefetch|prerender/i.test(`${h.get("sec-purpose") ?? ""} ${h.get("purpose") ?? ""} ${h.get("x-moz") ?? ""} ${h.get("x-purpose") ?? ""}`);
