import { BrowserWindow } from "electron";

export function publishRendererEvent<Value>(channel: string, value: Value) {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(channel, value);
    }
  }
}

export function focusFirstWindow() {
  const window = BrowserWindow.getAllWindows()[0];

  if (!window) {
    return;
  }
  if (window.isMinimized()) {
    window.restore();
  }
  window.show();
  window.focus();
}
