(async () => {
  const input = document.getElementById("server");
  const msg = document.getElementById("msg");
  const { server } = await chrome.storage.sync.get("server");
  input.value = server || self.SAN_DEAL_DEFAULT_SERVER;
  document.getElementById("save").onclick = async () => {
    let url;
    try { url = new URL(input.value.trim()); } catch { msg.textContent = "Địa chỉ không hợp lệ."; return; }
    const origin = `${url.protocol}//${url.host}/*`;
    // Xin quyền gọi tới máy chủ mới (Chrome sẽ hỏi người dùng)
    const granted = await chrome.permissions.request({ origins: [origin] }).catch(() => false);
    if (!granted) { msg.textContent = "Cần cấp quyền truy cập máy chủ để tiện ích hoạt động."; return; }
    await chrome.storage.sync.set({ server: `${url.protocol}//${url.host}` });
    msg.textContent = "Đã lưu.";
  };
})();
