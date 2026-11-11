// The only bridge between the UI and Electron. It exposes window controls,
// nothing else: no file system, no shell, no Node.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("myagent", {
  openMain: () => ipcRenderer.send("myagent:open-main"),
  companionMenu: () => ipcRenderer.send("myagent:companion-menu"),
  setCompanionHover: (hovering) => ipcRenderer.send("myagent:companion-hover", !!hovering),
  moveCompanion: (x, y) => ipcRenderer.send("myagent:companion-move", Number(x), Number(y)),
  companionDragEnd: () => ipcRenderer.send("myagent:companion-drag-end"),
  selectFolder: () => ipcRenderer.invoke("myagent:select-folder"),
  getAgentToken: () => ipcRenderer.invoke("myagent:agent-token"),
  // Ctrl+Shift+Space (global shortcut) → toggle listening
  onTalkShortcut: (cb) => {
    const handler = () => cb();
    ipcRenderer.on("myagent:talk", handler);
    return () => ipcRenderer.removeListener("myagent:talk", handler);
  },
});
