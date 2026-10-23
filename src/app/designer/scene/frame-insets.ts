/** Pixels of the canvas covered by UI chrome (CSS px). Dependency-free on purpose (no import cycles). */
export interface FrameInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const NO_INSETS: FrameInsets = { top: 0, right: 0, bottom: 0, left: 0 };
