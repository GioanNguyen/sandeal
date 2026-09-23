(async () => {
  const { server } = await chrome.storage.sync.get("server");
  const base = (server || self.SAN_DEAL_DEFAULT_SERVER).replace(/\/$/, "");
  document.getElementById("home").href = base + "/";
  document.getElementById("f").onsubmit = (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: `${base}/kiem-tra-gia?url=${encodeURIComponent(document.getElementById("u").value)}` });
  };
})();
