import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TabList } from './tab-list';

@Component({
  imports: [TabList],
  template: `<app-tab-list
    [tabs]="tabs"
    [(selected)]="selected"
    (tabClicked)="clicked.push($event)"
  />`,
})
class Host {
  readonly tabs = [
    { id: 'room', label: 'Room' },
    { id: 'floor', label: 'Floor' },
    { id: 'estimate', label: 'Estimate' },
  ];
  readonly selected = signal('room');
  readonly clicked: string[] = [];
}

function setup() {
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const tabs = () => Array.from(el.querySelectorAll<HTMLButtonElement>('[role=tab]'));
  const press = (key: string) => {
    tabs()
      .find((tab) => tab.tabIndex === 0)!
      .dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    fixture.detectChanges();
  };
  return { fixture, host: fixture.componentInstance, tabs, press };
}

describe('TabList', () => {
  it('renders a tablist with one selected tab and a roving tabindex', () => {
    const { tabs } = setup();
    expect(tabs().map((t) => t.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false']);
    expect(tabs().map((t) => t.tabIndex)).toEqual([0, -1, -1]);
    // Only the selected tab points at a panel that exists in the DOM.
    expect(tabs()[0].getAttribute('aria-controls')).toBe('designer-panel-room');
    expect(tabs()[1].getAttribute('aria-controls')).toBeNull();
  });

  it('selects a tab on click and reports the click', () => {
    const { fixture, host, tabs } = setup();
    tabs()[2].click();
    fixture.detectChanges();
    expect(host.selected()).toBe('estimate');
    expect(host.clicked).toEqual(['estimate']);
  });

  it('moves with arrow keys, wrapping, and activates and focuses the new tab', () => {
    const { host, press } = setup();
    press('ArrowRight');
    expect(host.selected()).toBe('floor');
    press('ArrowLeft');
    press('ArrowLeft');
    expect(host.selected()).toBe('estimate');
    expect(host.clicked).toEqual([]);
  });

  it('jumps with Home and End', () => {
    const { host, press } = setup();
    press('End');
    expect(host.selected()).toBe('estimate');
    press('Home');
    expect(host.selected()).toBe('room');
  });
});
