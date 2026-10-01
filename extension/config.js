// Địa chỉ web Săn Deal mặc định (script build sẽ thay bằng SITE_URL)
self.SAN_DEAL_DEFAULT_SERVER = "http://localhost:3000";
// true = bản phát hành: luôn dùng đúng máy chủ trên, người dùng không đổi được trong Tuỳ chọn
self.SAN_DEAL_LOCKED = false;
/** Máy chủ đang dùng: bản phát hành luôn là máy chủ cố định, bỏ qua giá trị lưu trong trình duyệt */
self.sanDealServer = async function () {
  if (self.SAN_DEAL_LOCKED) return self.SAN_DEAL_DEFAULT_SERVER.replace(/\/$/, "");
  const { server } = await chrome.storage.sync.get("server");
  return (server || self.SAN_DEAL_DEFAULT_SERVER).replace(/\/$/, "");
};
