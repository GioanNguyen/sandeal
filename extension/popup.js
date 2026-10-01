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
})();
