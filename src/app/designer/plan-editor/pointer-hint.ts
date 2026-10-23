/** First-use hint wording follows the primary pointer (UX spec, "First-use hints"). */
export class PointerHint {
  readonly touch = globalThis.matchMedia?.('(pointer: coarse)').matches ?? false;
  readonly text = this.touch
    ? 'Drag a corner or wall to reshape. Tap + to add a corner. Tap a wall to add a door or window.'
    : 'Drag corners and walls to reshape. Click + to add a corner. Select a wall to add a door or window.';
  readonly keyboard = this.touch ? '' : 'Tab to a corner or wall, then use the arrow keys.';
}
