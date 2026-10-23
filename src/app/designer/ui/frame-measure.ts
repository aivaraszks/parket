import type { FrameInsets } from '../scene/frame-insets';

export interface FrameParts {
  /** The designer host (the full-screen area). */
  host: HTMLElement;
  /** The top bar. */
  topBar: HTMLElement | null;
  /** The element holding the tray and the dock / rail. */
  chrome: HTMLElement | null;
}

/**
 * The strips of the full-screen view covered by UI, in CSS px: the top bar, and the dock + open
 * tray (phone, bottom) or rail + open column (wide screens, right). Layout sizes only, so a CSS
 * slide animation (transform) does not change them.
 */
export function measureFrame(parts: FrameParts, vertical: boolean): FrameInsets {
  const hostBox = parts.host.getBoundingClientRect();
  const top = parts.topBar
    ? Math.max(0, Math.round(parts.topBar.getBoundingClientRect().bottom - hostBox.top))
    : 0;
  const chrome = parts.chrome;
  return {
    top,
    left: 0,
    right: vertical && chrome ? chrome.offsetWidth : 0,
    bottom: !vertical && chrome ? chrome.offsetHeight : 0,
  };
}

/** Height changes below this (More toggled, an error line appearing) do not re-frame the room. */
export const MIN_REFRAME_PX = 24;

/**
 * True when the camera should keep its frame: the same section is open and only the covered
 * height moved a little, so nothing shifts under the finger. Section changes, the top bar, the
 * rail and window resizes always re-frame.
 */
export function isMinorReframe(
  prev: FrameInsets,
  next: FrameInsets,
  sectionChanged: boolean,
): boolean {
  return (
    !sectionChanged &&
    prev.top === next.top &&
    prev.left === next.left &&
    prev.right === next.right &&
    Math.abs(prev.bottom - next.bottom) < MIN_REFRAME_PX
  );
}
