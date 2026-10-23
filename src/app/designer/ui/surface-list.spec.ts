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
  template: `<app-surface-list [items]="items" [noDoors]="false" />`,
})
class Host {
  items = items();
}

function setup() {
  TestBed.resetTestingModule();
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return { fixture, el, colouring: TestBed.inject(ColouringState) };
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
  it('has one fieldset per section with radio chips', () => {
    const { el } = setup();
    expect(Array.from(el.querySelectorAll('legend')).map((l) => l.textContent)).toEqual([
      'Walls',
      'Doors',
      'Other',
    ]);
    expect(el.querySelectorAll('input[type=radio]').length).toBe(9);
    const names = new Set(
      Array.from(el.querySelectorAll<HTMLInputElement>('input')).map((i) => i.name),
    );
    expect(names.size).toBe(3);
  });

  it('describes each chip by its colour name', () => {
    const { el } = setup();
    const wall2 = Array.from(el.querySelectorAll('label.item')).find((l) =>
      l.textContent!.includes('Wall 2'),
    )!;
    const input = wall2.querySelector('input')!;
    const description = el.querySelector(`#${input.getAttribute('aria-describedby')}`);
    expect(description?.textContent).toBe('Navy');
  });

  it('selects through ColouringState and shows the check on the selected chip only', () => {
    const { fixture, el, colouring } = setup();
    const chip = (label: string) =>
      Array.from(el.querySelectorAll('label.item')).find((l) => l.textContent!.includes(label))!;
    chip('Door 2').querySelector('input')!.click();
    fixture.detectChanges();
    expect(colouring.selected()).toEqual({ kind: 'door', id: 'o3' });
    expect(el.querySelectorAll('.check').length).toBe(1);
    expect(chip('Door 2').querySelector('.check')).not.toBeNull();
    expect(chip('Door 2').querySelector<HTMLInputElement>('input')!.checked).toBe(true);
    // A list selection does not count as a 3D tap.
    expect(colouring.lastTap()).toBe(0);
  });

  it('follows a selection made elsewhere (a 3D tap)', () => {
    const { fixture, el, colouring } = setup();
    colouring.select({ kind: 'wall', id: 'w3' }, 'tap');
    fixture.detectChanges();
    const checked = Array.from(el.querySelectorAll<HTMLInputElement>('input:checked'));
    expect(checked.length).toBe(1);
    expect(checked[0].closest('label')!.textContent).toContain('Wall 3');
  });
});
