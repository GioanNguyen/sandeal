import { test } from "node:test";
import assert from "node:assert/strict";
import { isBotUa, isPrefetch } from "./bots";

const real = [
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/480.0.0.0;FBBV/1;FBDV/iPhone15,2]",
  "Mozilla/5.0 (Linux; Android 13; RMX3630) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36 Zalo android/12100676 ZaloTheme/light ZaloLanguage/vn",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 coc_coc_browser/130.0.0",
];
const bots = [
  "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
  "meta-externalagent/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)",
  "TelegramBot (like TwitterBot)",
  "WhatsApp/2.23.20.0",
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm) Chrome/116 Safari/537.36",
  "Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Mobile Safari/537.36 Chrome-Lighthouse",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0.0.0 Safari/537.36",
  "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
  "Zalo-LinkPreview/1.0",
  "curl/8.4.0",
  "python-requests/2.31.0",
  "Go-http-client/2.0",
  "",
];

test("người thật (kể cả trình duyệt trong app Facebook, Zalo, Cốc Cốc) không bị coi là bot", () => {
  for (const ua of real) assert.equal(isBotUa(ua), false, ua);
});
test("bot xem trước link, bot tìm kiếm, công cụ đo tốc độ, thư viện HTTP bị loại", () => {
  for (const ua of bots) assert.equal(isBotUa(ua), true, ua);
  assert.equal(isBotUa(null), true);
});
test("tải trước trang không tính", () => {
  assert.equal(isPrefetch(new Headers({ "sec-purpose": "prefetch;prerender" })), true);
  assert.equal(isPrefetch(new Headers({ purpose: "prefetch" })), true);
  assert.equal(isPrefetch(new Headers({ accept: "text/html" })), false);
});
