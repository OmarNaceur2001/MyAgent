// The only bridge between the UI and Electron. It exposes window controls,
// nothing else: no file system, no shell, no Node.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("mimo", {
  openMain: () => ipcRenderer.send("mimo:open-main"),
  companionMenu: () => ipcRenderer.send("mimo:companion-menu"),
  setCompanionHover: (hovering) => ipcRenderer.send("mimo:companion-hover", !!hovering),
  moveCompanion: (x, y) => ipcRenderer.send("mimo:companion-move", Number(x), Number(y)),
  companionDragEnd: () => ipcRenderer.send("mimo:companion-drag-end"),
  // Ctrl+Shift+Space (global shortcut) → toggle listening
  onTalkShortcut: (cb) => {
    const handler = () => cb();
    ipcRenderer.on("mimo:talk", handler);
    return () => ipcRenderer.removeListener("mimo:talk", handler);
  },
});
