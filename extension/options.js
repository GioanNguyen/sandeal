(async () => {
  // Bản phát hành: máy chủ cố định, chỉ hiện để xem, không có ô sửa
  if (self.SAN_DEAL_LOCKED) {
    document.getElementById("server-edit").remove();
    document.getElementById("server-fixed").hidden = false;
    document.getElementById("server-name").textContent = new URL(self.SAN_DEAL_DEFAULT_SERVER).host;
  } else {
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
  }
  const box = document.getElementById("contribute");
  const cmsg = document.getElementById("cmsg");
  const { contribute, contributeV } = await chrome.storage.sync.get(["contribute", "contributeV"]);
  box.checked = contribute === true && contributeV === 2;
  box.onchange = async () => {
    await chrome.storage.sync.set({ contribute: box.checked, contributeV: 2 });
    cmsg.textContent = box.checked ? "Đã bật góp giá. Cảm ơn bạn!" : "Đã tắt góp giá.";
  };
})();
