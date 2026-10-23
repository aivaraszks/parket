import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { SurfacePaint } from '../plan/paint';
import { RoomShape } from '../plan/room-shape';
import { ColouringState } from '../state/colouring-state';
import { SurfaceList } from './surface-list';
import { surfaceItems } from './surface-model';

const SHAPE: RoomShape = {
  outline: [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    { x: 4, y: 3 },
  ],
  wallIds: ['w1', 'w2', 'w3'],
  height: 2.5,
  openings: [
    { id: 'o1', kind: 'door', wall: 0, start: 1, end: 2, bottom: 0, top: 2 },
    { id: 'o2', kind: 'window', wall: 1, start: 1, end: 2, bottom: 1, top: 2 },
    { id: 'o3', kind: 'door', wall: 2, start: 1, end: 2, bottom: 0, top: 2 },
  ],
};

const PAINT: SurfacePaint = {
  base: '#efe9df',
  walls: { w1: '#efe9df', w2: '#34445a', w3: '#efe9df' },
  skirting: { w1: '#efe9df', w2: '#34445a', w3: '#efe9df' },
  doors: { o1: '#9a7049', o3: '#f2eee6' },
  ceiling: '#f7f5f0',
};

const items = (simple = false) =>
  surfaceItems(SHAPE, simple, { paint: PAINT, wallColor: '#efe9df', doorColor: null });

@Component({
  imports: [SurfaceList],
  template: `<app-surface-list [items]="items" />`,
})
class Host {
  items = items();
}

function setup() {
  TestBed.resetTestingModule();
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const colouring = TestBed.inject(ColouringState);
  colouring.select({ kind: 'walls' }, 'list');
  fixture.detectChanges();
  return { fixture, el, colouring };
}

describe('surfaceItems', () => {
  it('lists walls, doors only for door openings, then ceiling and skirting', () => {
    expect(items().map((i) => i.label)).toEqual([
      'All walls',
      'Wall 1',
      'Wall 2',
      'Wall 3',
      'All doors',
      'Door 1',
      'Door 2',
      'Ceiling',
      'Skirting',
    ]);
  });

  it('marks the window wall in simple mode and uses the resolved colours', () => {
    expect(items(true)[1].label).toBe('Wall 1 (window)');
    expect(items()[2].hex).toBe('#34445a');
    expect(items().find((i) => i.label === 'Door 2')?.ref).toEqual({ kind: 'door', id: 'o3' });
  });
});

describe('SurfaceList', () => {
  const names = (el: HTMLElement, group: string) =>
    Array.from(el.querySelectorAll<HTMLInputElement>(`[aria-label="${group}"] input`)).map(
      (i) => i.getAttribute('aria-label') ?? i.closest('label')!.textContent!.trim(),
    );

  it('has a What row and a Which row, each its own radio group', () => {
    const { el } = setup();
    expect(names(el, 'What to colour')).toEqual(['Walls', 'Doors', 'Ceiling', 'Skirting']);
    expect(names(el, 'Which one')).toEqual(['All walls', 'Wall 1', 'Wall 2', 'Wall 3']);
    const radioNames = new Set(
      Array.from(el.querySelectorAll<HTMLInputElement>('input')).map((i) => i.name),
    );
    expect(radioNames.size).toBe(2);
  });

  it('selects through ColouringState; a list selection does not count as a 3D tap', () => {
    const { fixture, el, colouring } = setup();
    el.querySelector<HTMLInputElement>('[aria-label="Wall 2"]')!.click();
    fixture.detectChanges();
    expect(colouring.selected()).toEqual({ kind: 'wall', id: 'w2' });
    expect(colouring.lastTap()).toBe(0);
    expect(el.querySelectorAll('[aria-label="Which one"] input:checked').length).toBe(1);
  });

  it('switches the Which row to doors and shows the check on the checked What chip only', () => {
    const { fixture, el, colouring } = setup();
    colouring.select({ kind: 'door', id: 'o3' }, 'tap');
    fixture.detectChanges();
    expect(names(el, 'Which one')).toEqual(['All doors', 'Door 1', 'Door 2']);
    expect(el.querySelectorAll('.check').length).toBe(1);
    expect(
      el
        .querySelector<HTMLInputElement>('[aria-label="Which one"] input:checked')
        ?.getAttribute('aria-label'),
    ).toBe('Door 2');
  });

  it('keeps the Which row for ceiling with a note and no chips', () => {
    const { fixture, el, colouring } = setup();
    colouring.select({ kind: 'ceiling' }, 'list');
    fixture.detectChanges();
    expect(names(el, 'Which one')).toEqual([]);
    expect(el.querySelector('.note')?.textContent).toBe('Whole ceiling.');
  });
});
