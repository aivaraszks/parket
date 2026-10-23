import { Component, ElementRef, inject, input, model, output } from '@angular/core';

export interface TabDef {
  readonly id: string;
  readonly label: string;
}

export const tabId = (id: string): string => `designer-tab-${id}`;
export const panelId = (id: string): string => `designer-panel-${id}`;

/** ARIA tabs: roving tabindex, arrows move and activate, Home/End jump. */
@Component({
  selector: 'app-tab-list',
  template: `
    <div class="tablist" role="tablist" aria-label="Sections" (keydown)="onKeydown($event)">
      @for (tab of tabs(); track tab.id) {
        <button
          type="button"
          role="tab"
          class="tab"
          [id]="tabId(tab.id)"
          [attr.aria-selected]="tab.id === selected()"
          [attr.aria-controls]="tab.id === selected() ? panelId(tab.id) : null"
          [attr.tabindex]="tab.id === selected() ? 0 : -1"
          (click)="onClick(tab.id)"
        >
          {{ tab.label }}
        </button>
      }
    </div>
  `,
  styleUrl: './tab-list.scss',
})
export class TabList {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly tabs = input.required<readonly TabDef[]>();
  readonly selected = model.required<string>();
  /** A tab was chosen with a pointer or Enter/Space (not by arrow keys); emitted before the selection changes. */
  readonly tabClicked = output<string>();

  protected readonly tabId = tabId;
  protected readonly panelId = panelId;

  protected onClick(id: string): void {
    this.tabClicked.emit(id);
    this.selected.set(id);
  }

  protected onKeydown(event: KeyboardEvent): void {
    const tabs = this.tabs();
    const current = tabs.findIndex((tab) => tab.id === this.selected());
    let next: number;
    switch (event.key) {
      case 'ArrowRight':
        next = (current + 1) % tabs.length;
        break;
      case 'ArrowLeft':
        next = (current - 1 + tabs.length) % tabs.length;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = tabs.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    this.selected.set(tabs[next].id);
    this.host.nativeElement.querySelector<HTMLElement>(`#${tabId(tabs[next].id)}`)?.focus();
  }
}
