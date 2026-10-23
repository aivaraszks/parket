// DEBUG ONLY (dock-redesign framing spike), kept until the device fps check. Delete this file and
// its call in floor-scene.ts afterwards.
// Active only with `?frame=debug`. Keys: F toggles a 40% bottom inset on a full-screen canvas,
// H toggles today's model (canvas resized to the top 60%) for comparison.
import { FrameInsets, NO_INSETS } from './frame-insets';

interface DebugTarget {
  host: HTMLElement;
  setFrame(insets: FrameInsets): void;
  [key: string]: unknown;
}

const isTyping = (t: EventTarget | null): boolean =>
  t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

export function installFrameDebug(target: DebugTarget): () => void {
  if (
    typeof location === 'undefined' ||
    new URLSearchParams(location.search).get('frame') !== 'debug'
  ) {
    return () => undefined;
  }
  const stage = target.host.parentElement ?? target.host;
  stage.style.inset = '0';
  let framed = false;
  let half = false;
  const apply = (): void => {
    stage.style.inset = half ? '0 0 40% 0' : '0';
    target.setFrame(framed ? { ...NO_INSETS, bottom: stage.clientHeight * 0.4 } : NO_INSETS);
  };
  const onKey = (e: KeyboardEvent): void => {
    if (isTyping(e.target)) return;
    if (e.key === 'F' || e.key === 'f') framed = !framed;
    else if (e.key === 'H' || e.key === 'h') half = !half;
    else return;
    apply();
  };
  const w = window as unknown as Record<string, unknown>;
  w['__frameDebug'] = {
    ...target,
    toggleFrame: () => onKey(new KeyboardEvent('keydown', { key: 'f' })),
    toggleHalf: () => onKey(new KeyboardEvent('keydown', { key: 'h' })),
  };
  window.addEventListener('keydown', onKey);
  return () => {
    window.removeEventListener('keydown', onKey);
    delete w['__frameDebug'];
  };
}
