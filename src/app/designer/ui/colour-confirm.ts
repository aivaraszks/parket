import { Service, signal } from '@angular/core';

export interface ColourConfirmRequest {
  /** Dialog body. */
  readonly body: string;
  readonly onConfirm: () => void;
}

/**
 * The in-app "Change all walls?" question. The Surfaces tab asks; the designer shell shows the
 * dialog (so the rest of the page can be made inert) and answers.
 */
@Service()
export class ColourConfirm {
  private readonly _pending = signal<ColourConfirmRequest | null>(null);

  readonly pending = this._pending.asReadonly();

  ask(request: ColourConfirmRequest): void {
    this._pending.set(request);
  }

  confirm(): void {
    const request = this._pending();
    this._pending.set(null);
    request?.onConfirm();
  }

  cancel(): void {
    this._pending.set(null);
  }
}
