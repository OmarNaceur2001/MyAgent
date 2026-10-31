// Bridge to Electron (see electron/preload.cjs). Window controls only:
// the UI is never given access to files or the system.
// In a normal browser (npm run web) these calls fall back gracefully.

type DesktopApi = {
  openMain: () => void;
  companionMenu: () => void;
  setCompanionHover: (hovering: boolean) => void;
  moveCompanion: (x: number, y: number) => void;
  companionDragEnd: () => void;
  onTalkShortcut: (cb: () => void) => () => void;
};

declare global {
  interface Window {
    mimo?: DesktopApi;
  }
}

export const desktop: DesktopApi = {
  openMain: () => (window.mimo ? window.mimo.openMain() : window.open("?view=main", "_blank")),
  companionMenu: () => window.mimo?.companionMenu(),
  setCompanionHover: (h) => window.mimo?.setCompanionHover(h),
  moveCompanion: (x, y) => window.mimo?.moveCompanion(x, y),
  companionDragEnd: () => window.mimo?.companionDragEnd(),
  onTalkShortcut: (cb) => window.mimo?.onTalkShortcut(cb) ?? (() => {}),
};

export const isDesktop = () => !!window.mimo;
