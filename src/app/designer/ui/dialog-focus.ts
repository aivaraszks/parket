const FOCUSABLE = 'button, input, a[href]';

/** Keep Tab inside `host` (same behaviour as the colour confirm dialog). */
export function trapTab(event: Event, host: HTMLElement, doc: Document, home?: HTMLElement): void {
  if (event.defaultPrevented) {
    return;
  }
  const keyboard = event as KeyboardEvent;
  const items = Array.from(host.querySelectorAll<HTMLElement>(FOCUSABLE));
  const first = items[0];
  const last = items[items.length - 1];
  if (!first) {
    return;
  }
  const active = doc.activeElement;
  if (!active || !host.contains(active) || active === home) {
    keyboard.preventDefault();
    (keyboard.shiftKey ? last : first).focus();
  } else if (keyboard.shiftKey && active === first) {
    keyboard.preventDefault();
    last.focus();
  } else if (!keyboard.shiftKey && active === last) {
    keyboard.preventDefault();
    first.focus();
  }
}

/** Focus that landed outside the dialog goes back to `target`. */
export function pullFocusBack(event: Event, host: HTMLElement, target: HTMLElement | null): void {
  const node = event.target as Node | null;
  if (node && !host.contains(node)) {
    target?.focus();
  }
}

/** Return focus to the first of `preferred` that exists, else the opener, once the (inert) page behind is live again. */
export function restoreFocus(
  doc: Document,
  preferred: string | readonly string[],
  opener: HTMLElement | null,
): void {
  const selectors = typeof preferred === 'string' ? [preferred] : preferred;
  setTimeout(() => {
    const found = selectors.map((s) => doc.querySelector<HTMLElement>(s)).find((el) => el);
    const target = found ?? opener;
    if (target?.isConnected) {
      target.focus();
    }
  });
}
