(async () => {
  const base = await self.sanDealServer();
  document.getElementById("home").href = base + "/";
  document.getElementById("f").onsubmit = (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: `${base}/kiem-tra-gia?url=${encodeURIComponent(document.getElementById("u").value)}` });
  };
  const { contribute } = await chrome.storage.sync.get("contribute");
  document.getElementById("contrib").textContent = contribute === true ? "Góp giá ẩn danh: đang bật. Cảm ơn bạn!" : "Góp giá ẩn danh: đang tắt (bật trong Tuỳ chọn).";
  // Phiên bản đang dùng + báo khi trang Săn Deal có bản mới hơn
  const mine = chrome.runtime.getManifest().version;
  const ver = document.getElementById("ver");
  ver.textContent = `Phiên bản ${mine}`;
  const newer = (a, b) => {
    const x = a.split(".").map(Number), y = b.split(".").map(Number);
    for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
    return false;
  };
  try {
    const res = await fetch(`${base}/downloads/san-deal-extension.json`, { cache: "no-store" });
    const info = await res.json();
    if (info.version && newer(info.version, mine)) {
      const a = document.createElement("a");
      a.className = "link";
      a.target = "_blank";
      a.href = `${base}/tien-ich`;
      a.textContent = `Có bản mới ${info.version} – tải về`;
      a.style.fontWeight = "700";
      ver.textContent = `Phiên bản ${mine} · `;
      ver.append(a);
    } else if (info.version) {
      ver.textContent = `Phiên bản ${mine} (mới nhất)`;
    }
  } catch (e) {}

  // Cập nhật ảnh hàng loạt (quản trị viên)
  const st = document.getElementById("b-status"), cnt = document.getElementById("b-count");
  const startBtn = document.getElementById("b-start"), stopBtn = document.getElementById("b-stop");
  const show = (s) => {
    if (!s) return;
    st.textContent = s.status || "";
    cnt.textContent = `Đã cập nhật ${s.ok || 0} · không đọc được ${s.fail || 0} · hôm nay ${s.day?.n || 0} món${s.remaining != null ? ` · còn ~${s.remaining} món thiếu ảnh` : ""}`;
    startBtn.hidden = !!s.running;
    stopBtn.hidden = !s.running;
    startBtn.textContent = s.ok || s.fail ? "Tiếp tục" : "Bắt đầu";
    if (s.running) document.getElementById("batch").open = true;
  };
  // Chỉ hiện với trình duyệt đang đăng nhập tài khoản quản trị (hoặc khi đang chạy dở); người dùng thường không thấy mục này
  const box = document.getElementById("batch");
  const refresh = () =>
    chrome.runtime
      .sendMessage({ type: "batch-status" })
      .then((r) => {
        if (!r?.ok) return;
        box.hidden = !(r.admin || r.state?.running);
        if (!box.hidden) show(r.state);
      })
      .catch(() => 0);
  startBtn.onclick = async () => {
    startBtn.disabled = true;
    st.textContent = "Đang kiểm tra…";
    const r = await chrome.runtime.sendMessage({ type: "batch-start" }).catch((e) => ({ ok: false, error: String(e) }));
    startBtn.disabled = false;
    if (!r?.ok) { st.textContent = r?.error || "Lỗi"; return; }
    show(r.state);
  };
  stopBtn.onclick = async () => {
    const r = await chrome.runtime.sendMessage({ type: "batch-stop" }).catch(() => null);
    if (r?.ok) show(r.state);
  };
  refresh();
  setInterval(refresh, 2000);
})();
