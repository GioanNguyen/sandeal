import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { PLATFORMS } from "@/lib/format";
import { listCategories } from "@/lib/queries";
import { nextSale } from "@/lib/sales";
import { getSubscription } from "@/lib/subscription";
import { botUsername } from "@/lib/telegram";
import { matchingDeals } from "@/worker/digest";
import { DealGrid } from "@/components/DealGrid";
import { Icon } from "@/components/Icon";

export const metadata = { title: "Sở thích & thông báo", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function PreferencesPage({ searchParams }: { searchParams: Promise<{ saved?: string; tg?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/account/so-thich");
  const { saved, tg } = await searchParams;
  const [s, categories] = await Promise.all([getSubscription(user.id), listCategories()]);
  const preview = (await matchingDeals(user.id, s, new Date(), 5)).map((p) => ({ ...p, low30: null }));
  const sale = nextSale(new Date(), true);
  const hasBot = !!botUsername();

  return (
    <>
      <nav className="tabs" aria-label="Tài khoản">
        <Link href="/account">Theo dõi giá</Link>
        <Link href="/account/so-thich" aria-current="page">Sở thích & thông báo</Link>
      </nav>
      <h1 className="page-title">Săn deal theo sở thích</h1>
      <p className="page-sub">Chọn thứ bạn quan tâm, mỗi sáng chúng tôi gửi những deal giảm thật khớp nhất. Không gửi trùng.</p>
      {saved && <p className="form-msg save" role="status" style={{ marginBottom: 12 }}><Icon name="check" size={16} /> Đã lưu sở thích.</p>}

      <div className="prefs">
        <form className="panel stack" method="post" action="/api/subscription">
          <h2><Icon name="sparkles" /> Bạn muốn săn gì?</h2>
          <div className="field">
            <label htmlFor="kw">Từ khoá (cách nhau bởi dấu phẩy)</label>
            <input id="kw" className="input" name="keywords" defaultValue={s.keywords} placeholder="tai nghe, kem chống nắng, nồi chiên" />
          </div>
          <fieldset className="checks">
            <legend>Danh mục</legend>
            {categories.map((c) => (
              <label key={c.slug} className="check">
                <input type="checkbox" name="categories" value={c.name} defaultChecked={s.categories.includes(c.name)} /> {c.name}
              </label>
            ))}
          </fieldset>
          <fieldset className="checks">
            <legend>Sàn</legend>
            {Object.entries(PLATFORMS).map(([k, v]) => (
              <label key={k} className="check">
                <input type="checkbox" name="platforms" value={k} defaultChecked={s.platforms.includes(k)} />
                <span className="dot" style={{ background: v.color }} aria-hidden="true" /> {v.label}
              </label>
            ))}
            <small className="muted">Không chọn = tất cả</small>
          </fieldset>
          <div className="row" style={{ gap: 12 }}>
            <div className="field">
              <label htmlFor="minDrop">Giảm thật tối thiểu</label>
              <select id="minDrop" className="select" name="minDrop" defaultValue={String(s.minDrop)}>
                {[5, 10, 15, 20, 30, 40].map((n) => <option key={n} value={n}>{n}%</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="maxPrice">Giá tối đa (đ)</label>
              <input id="maxPrice" className="input" name="maxPrice" inputMode="numeric" defaultValue={s.maxPrice ?? ""} placeholder="Không giới hạn" />
            </div>
          </div>

          <h2 style={{ marginTop: 8 }}><Icon name="bell" /> Nhận thông báo qua</h2>
          <label className="toggle"><input type="checkbox" name="emailDigest" defaultChecked={s.emailDigest} /> <span><b>Email mỗi sáng</b><small>Gửi tới {user.email}</small></span></label>
          <label className="toggle">
            <input type="checkbox" name="telegramDigest" defaultChecked={s.telegramDigest} disabled={!s.telegramChatId} />
            <span><b>Telegram mỗi sáng</b><small>{s.telegramChatId ? "Đã kết nối" : "Kết nối Telegram ở bên cạnh trước"}</small></span>
          </label>
          <label className="toggle"><input type="checkbox" name="saleReminder" defaultChecked={s.saleReminder} /> <span><b>Nhắc trước ngày sale lớn</b><small>20h tối hôm trước, gần nhất: {sale.name}</small></span></label>
          <button className="btn btn-primary" type="submit"><Icon name="check" size={16} /> Lưu sở thích</button>
        </form>

        <div>
          <section className="panel">
            <h2><Icon name="send" /> Telegram</h2>
            {s.telegramChatId ? (
              <>
                <p className="muted" style={{ fontSize: 14 }}>Đã kết nối. Deal và nhắc sale sẽ gửi vào Telegram của bạn.</p>
                <form method="post" action="/api/telegram/unlink"><button className="btn btn-ghost">Ngắt kết nối</button></form>
              </>
            ) : hasBot ? (
              <>
                <p className="muted" style={{ fontSize: 14 }}>Bấm nút, Telegram sẽ mở bot Săn Deal. Bấm <b>Start</b> là xong.</p>
                <form method="post" action="/api/telegram/link"><button className="btn btn-primary"><Icon name="send" size={16} /> Kết nối Telegram</button></form>
              </>
            ) : (
              <p className="muted" style={{ fontSize: 14 }}>
                {tg === "off" ? "Chưa bật. " : ""}Quản trị viên cần đặt <code>TELEGRAM_BOT_TOKEN</code> và <code>TELEGRAM_BOT_USERNAME</code> để dùng tính năng này.
              </p>
            )}
          </section>
          <section className="panel">
            <h2><Icon name="flame" /> Xem trước bản tin</h2>
            <p className="muted" style={{ fontSize: 14, marginTop: 0 }}>Deal khớp sở thích hiện tại (lưu xong để cập nhật).</p>
            {preview.length ? <DealGrid items={preview} /> : <p className="muted">Chưa có deal khớp. Thử giảm mức giảm tối thiểu hoặc bớt từ khoá.</p>}
          </section>
        </div>
      </div>
    </>
  );
}
