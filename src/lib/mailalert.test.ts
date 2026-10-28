/** Gửi mail lỗi: ghi vào "Việc định kỳ", lỗi 2 lần liền thì mở sự cố (Quản trị › Hôm nay), kèm cách sửa */
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL = "memory://";
process.env.SITE_URL = "http://test.local";
process.env.ADMIN_EMAILS = "admin@test.vn";
process.env.TELEGRAM_BOT_TOKEN = "";
// Cổng 1 trên máy: không có máy chủ mail -> ECONNREFUSED ngay
process.env.SMTP_URL = "smtp://127.0.0.1:1";

test("gửi mail lỗi 2 lần liền: mở sự cố có cách sửa; không báo lồng nhau", async () => {
  const dbm = await import("./db");
  await dbm.ensureMigrated();
  const { sendMail, mailErrorText } = await import("./mail");
  const ops = await import("./ops");
  await assert.rejects(sendMail("khach@test.vn", "Link đăng nhập", "<p>x</p>"));
  let job = (await ops.jobStates()).find((j) => j.name === "mail");
  assert.equal(job?.state?.fails, 1);
  assert.equal((await ops.openAlerts()).length, 0, "lỗi 1 lần: chưa báo");
  await assert.rejects(sendMail("khach@test.vn", "Link đăng nhập", "<p>x</p>"));
  job = (await ops.jobStates()).find((j) => j.name === "mail");
  assert.equal(job?.state?.fails, 2, "báo sự cố (gửi email cho quản trị cũng lỗi) không bị đếm lồng thêm");
  const alerts = await ops.openAlerts();
  assert.equal(alerts.length, 1);
  assert.match(alerts[0].title, /Gửi email/);
  assert.match(alerts[0].detail, /ECONNREFUSED/);
  assert.match(alerts[0].detail, /cổng 465\/587/);

  const auth = Object.assign(new Error("Invalid login: 535-5.7.8 Username and Password not accepted."), { code: "EAUTH", responseCode: 535 });
  assert.match(mailErrorText(auth), /^EAUTH 535: .*App Password/);
});
