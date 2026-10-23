const KEY = 'parket.plan-hint.v1';

/** Whether the first-use hint was already dismissed in this browser. Storage failures: not seen. */
export function hintSeen(): boolean {
  try {
    return globalThis.localStorage.getItem(KEY) !== null;
  } catch {
    return false;
  }
}

export function markHintSeen(): void {
  try {
    globalThis.localStorage.setItem(KEY, '1');
  } catch {
    // Not remembered: the hint shows again next time.
  }
}
