const KEY = 'parket.visited.v1';

/** True the first time it is called in this browser; remembers the visit. Storage failures count as a return visit. */
export function consumeFirstVisit(): boolean {
  try {
    if (globalThis.localStorage.getItem(KEY)) {
      return false;
    }
    globalThis.localStorage.setItem(KEY, '1');
    return true;
  } catch {
    return false;
  }
}
