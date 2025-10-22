document.addEventListener('DOMContentLoaded', async () => {
    const enabledEl = document.getElementById('enabled');
    const applyBtn = document.getElementById('apply');
  
    const state = await new Promise(resolve => chrome.storage.local.get({
      enabled: true
    }, resolve));
  
    enabledEl.checked = !!state.enabled;
  
    applyBtn.addEventListener('click', async () => {
      const options = {
        enabled: enabledEl.checked
      };
      chrome.storage.local.set(options, () => {
        chrome.tabs.query({ url: '*://*.twitch.tv/*' }, (tabs) => {
          for (const t of tabs) {
            chrome.tabs.sendMessage(t.id, { type: 'updateOptions', options });
          }
        });
        window.close();
      });
    });
  });
  