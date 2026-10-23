import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ColouringState } from '../state/colouring-state';
import { ColourAnnouncer } from './colour-announcer';
import { ColourHint } from './colour-hint';

@Component({ imports: [ColourHint], template: `<app-colour-hint [available]="available" />` })
class Host {
  available = true;
}

function setup() {
  TestBed.resetTestingModule();
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return { fixture, el, colouring: TestBed.inject(ColouringState) };
}

describe('ColourHint', () => {
  beforeEach(() => localStorage.removeItem('parket.colourHint.v1'));

  it('shows only while Colour is open and announces once, after the tray heading', () => {
    vi.useFakeTimers();
    const { fixture, el, colouring } = setup();
    expect(el.textContent!.trim()).toBe('');
    colouring.setColourOpen(true);
    fixture.detectChanges();
    expect(el.textContent).toContain('Tap a wall, skirting or the ceiling.');
    const announcer = TestBed.inject(ColourAnnouncer);
    expect(announcer.message()).toBe('');
    vi.advanceTimersByTime(600);
    expect(announcer.message()).toBe('Tap a wall, skirting or the ceiling.');
    colouring.setColourOpen(false);
    fixture.detectChanges();
    expect(el.textContent!.trim()).toBe('');
    vi.useRealTimers();
  });

  it('is retired for good by the first 3D tap', () => {
    const { fixture, el, colouring } = setup();
    colouring.setColourOpen(true);
    fixture.detectChanges();
    expect(el.textContent!.trim()).not.toBe('');
    colouring.select({ kind: 'walls' }, 'list');
    fixture.detectChanges();
    expect(el.textContent!.trim()).not.toBe('');
    colouring.select({ kind: 'wall', id: 's0' }, 'tap');
    fixture.detectChanges();
    expect(el.textContent!.trim()).toBe('');
    expect(localStorage.getItem('parket.colourHint.v1')).not.toBeNull();
    const again = setup();
    again.colouring.setColourOpen(true);
    again.fixture.detectChanges();
    expect(again.el.textContent!.trim()).toBe('');
  });

  it('is not shown without a 3D view', () => {
    TestBed.resetTestingModule();
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.available = false;
    fixture.detectChanges();
    TestBed.inject(ColouringState).setColourOpen(true);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent!.trim()).toBe('');
  });
});
