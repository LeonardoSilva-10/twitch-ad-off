chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    enabled: true
  }, () => console.log("[Twitch Ad Muter] Default settings stored"));
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg.type !== "string") return;

  switch (msg.type) {
    case "toggleEnabled":
      chrome.storage.local.get({ enabled: true }, (res) => {
        const newEnabled = !res.enabled;
        chrome.storage.local.set({ enabled: newEnabled }, () => {
          chrome.tabs.query({ url: "*://*.twitch.tv/*" }, (tabs) => {
            for (const t of tabs) {
              chrome.tabs.sendMessage(t.id, {
                type: "updateOptions",
                options: { enabled: newEnabled }
              });
            }
          });
          sendResponse({ enabled: newEnabled });
        });
      });
      return true;

    default:
      console.log("[Twitch Ad Muter] Unknown message:", msg);
  }
});
