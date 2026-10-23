import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { loadDesigner } from '../app.routes';
import { DesignerLoadError, RELOAD_PAGE } from './designer-load-error';

describe('DesignerLoadError', () => {
  it('shows the message and reloads on Try again', async () => {
    const reload = vi.fn();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: RELOAD_PAGE, useValue: reload }],
    });
    const fixture = TestBed.createComponent(DesignerLoadError);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('h1')?.textContent).toBe("Couldn't load the designer");
    expect(el.querySelector('a')?.getAttribute('href')).toBe('/');
    el.querySelector('button')!.click();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('is used when the designer chunk fails to load', async () => {
    const failing = () => Promise.reject(new Error('Failed to fetch dynamically imported module'));
    expect(await loadDesigner(failing)).toBe(DesignerLoadError);
  });

  it('returns the designer when the chunk loads', async () => {
    class Fake {}
    expect(await loadDesigner(() => Promise.resolve({ Designer: Fake as never }))).toBe(Fake);
  });
});
