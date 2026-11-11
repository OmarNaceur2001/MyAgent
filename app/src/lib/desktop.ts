// Bridge to Electron (see electron/preload.cjs). Window controls only:
// the UI is never given access to files or the system.
// In a normal browser (npm run web) these calls fall back gracefully.

type DesktopApi = {
  openMain: () => void;
  companionMenu: () => void;
  setCompanionHover: (hovering: boolean) => void;
  moveCompanion: (x: number, y: number) => void;
  companionDragEnd: () => void;
  selectFolder: () => Promise<string | null>;
  getAgentToken: () => Promise<string | null>;
  onTalkShortcut: (cb: () => void) => () => void;
};

declare global {
  interface Window {
    myagent?: DesktopApi;
  }
}

export const desktop: DesktopApi = {
  openMain: () => (window.myagent ? window.myagent.openMain() : window.open("?view=main", "_blank")),
  companionMenu: () => window.myagent?.companionMenu(),
  setCompanionHover: (h) => window.myagent?.setCompanionHover(h),
  moveCompanion: (x, y) => window.myagent?.moveCompanion(x, y),
  companionDragEnd: () => window.myagent?.companionDragEnd(),
  selectFolder: () => window.myagent?.selectFolder() ?? Promise.resolve(null),
  getAgentToken: () => window.myagent?.getAgentToken() ?? Promise.resolve(null),
  onTalkShortcut: (cb) => window.myagent?.onTalkShortcut(cb) ?? (() => {}),
};

export const isDesktop = () => !!window.myagent;
