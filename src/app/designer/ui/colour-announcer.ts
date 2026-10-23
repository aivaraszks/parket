import { Service, signal } from '@angular/core';

const DEBOUNCE_MS = 500;
/** A repeated message is cleared first so the live region reads it again. */
const REPEAT_GAP_MS = 60;

/** Text for the polite live region in the designer (Colour mode messages). */
@Service()
export class ColourAnnouncer {
  private readonly _message = signal('');
  private timer: ReturnType<typeof setTimeout> | undefined;
  private repeatTimer: ReturnType<typeof setTimeout> | undefined;

  readonly message = this._message.asReadonly();

  /** Announce now. */
  say(text: string): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    clearTimeout(this.repeatTimer);
    this.repeatTimer = undefined;
    if (text !== '' && text === this._message()) {
      this._message.set('');
      this.repeatTimer = setTimeout(() => this._message.set(text), REPEAT_GAP_MS);
    } else {
      this._message.set(text);
    }
  }

  /** Announce once the messages stop coming (a custom colour drag announces once). */
  sayLater(text: string): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.say(text), DEBOUNCE_MS);
  }
}
