export const searchShortcutLabel = (): string =>
  typeof navigator !== "undefined" && /Macintosh|Mac OS X|iPhone|iPad/.test(navigator.userAgent)
    ? "⌘ K"
    : "Ctrl K"
