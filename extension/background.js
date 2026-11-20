// Tapeline background: opens the editor window and forwards right-click assertions to the page.
const EDITOR = 'editor.html';
const MENU = [
  ['assertText', 'Assert text'],
  ['assertElementPresent', 'Assert element present'],
  ['assertValue', 'Assert value (inputs)'],
  ['waitForElementVisible', 'Wait for element visible'],
  ['storeText', 'Store text in a variable'],
  ['assertTitle', 'Assert page title'],
];

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'tapeline', title: 'Tapeline', contexts: ['all'], visible: false });
    for (const [id, title] of MENU) chrome.contextMenus.create({ id: 'tapeline:' + id, parentId: 'tapeline', title, contexts: ['all'] });
  });
});

async function openEditor(tab) {
  const { editorWindowId } = await chrome.storage.session.get('editorWindowId');
  if (editorWindowId) {
    try {
      await chrome.windows.update(editorWindowId, { focused: true });
      return;
    } catch { /* closed */ }
  }
  const url = chrome.runtime.getURL(EDITOR) + (tab?.id && /^https?:/.test(tab.url || '') ? `?tab=${tab.id}` : '');
  const win = await chrome.windows.create({ url, type: 'popup', width: 1100, height: 760 });
  await chrome.storage.session.set({ editorWindowId: win.id });
}

chrome.action.onClicked.addListener((tab) => { openEditor(tab); });

chrome.windows.onRemoved.addListener(async (id) => {
  const { editorWindowId } = await chrome.storage.session.get('editorWindowId');
  if (id === editorWindowId) {
    await chrome.storage.session.remove('editorWindowId');
    chrome.contextMenus.update('tapeline', { visible: false }).catch(() => {});
  }
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const id = String(info.menuItemId);
  if (!id.startsWith('tapeline:') || !tab?.id) return;
  chrome.tabs.sendMessage(tab.id, { type: 'tapeline:assert', kind: id.slice('tapeline:'.length) }, { frameId: info.frameId || 0 }).catch(() => {});
});
