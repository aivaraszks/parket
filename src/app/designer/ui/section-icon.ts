import { Component, input } from '@angular/core';
import { SectionId } from './section-id';

/** Inline SVG icons for the dock and tray (docs/design/components/dock.md, section 8). */
@Component({
  selector: 'app-section-icon',
  template: `
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      @switch (id()) {
        @case ('room') {
          <path class="f" d="M4 4h10v6h6v10H4z" />
        }
        @case ('floor') {
          <path class="f" d="M4 6h16v12H4z" />
          <path d="M4 10h16M4 14h16M10 6v4M15 10v4M8 14v4" />
        }
        @case ('colour') {
          <path
            class="f"
            d="M12 3.5c3.2 3.8 5.5 6.6 5.5 9.5a5.5 5.5 0 0 1-11 0c0-2.9 2.3-5.7 5.5-9.5z"
          />
          <path d="M9.5 14a2.8 2.8 0 0 0 2 2.4" />
        }
        @case ('light') {
          <path class="f" d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z" />
          <path
            d="M12 2.5V5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"
          />
        }
        @case ('estimate') {
          <path
            class="f"
            d="M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"
          />
          <path d="M8.5 7.5h7M9 12h.01M12 12h.01M15 12h.01M9 16h.01M12 16h.01M15 16h.01" />
        }
      }
    </svg>
  `,
  styles: `
    :host {
      display: inline-flex;
      width: var(--dock-icon-size);
      height: var(--dock-icon-size);
    }
    svg {
      width: 100%;
      height: 100%;
      stroke-width: var(--dock-icon-stroke);
    }
    :host(.filled) .f {
      fill: currentColor;
      fill-opacity: 0.28;
    }
  `,
})
export class SectionIcon {
  readonly id = input.required<SectionId>();
}
