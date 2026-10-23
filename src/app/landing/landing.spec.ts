import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { Landing } from './landing';

describe('Landing', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideRouter([])] }));

  it('renders an accessible "parket" heading', async () => {
    const fixture = TestBed.createComponent(Landing);
    await fixture.whenStable();
    const h1 = (fixture.nativeElement as HTMLElement).querySelector('h1');
    expect(h1?.getAttribute('aria-label')).toBe('parket');
    // 6 letter cells + the decorative shine copy
    expect(h1?.querySelectorAll(':scope > [aria-hidden="true"]').length).toBe(7);
  });

  describe('call to action', () => {
    async function setup() {
      const fixture = TestBed.createComponent(Landing);
      await fixture.whenStable();
      const el = fixture.nativeElement as HTMLElement;
      return { fixture, el, cta: el.querySelector<HTMLElement>('.cta')! };
    }

    it('links to /designer with the label "Design your floor"', async () => {
      const { el } = await setup();
      const link = el.querySelector('a')!;
      expect(link.textContent?.trim()).toBe('Design your floor');
      expect(link.getAttribute('href')).toBe('/designer');
    });

    it('waits for the opening sequence (not revealed by default)', async () => {
      const { cta } = await setup();
      expect(cta.classList.contains('revealed')).toBe(false);
    });

    it('is revealed early by a tap', async () => {
      const { fixture, cta } = await setup();
      document.dispatchEvent(new Event('pointerdown'));
      await fixture.whenStable();
      expect(cta.classList.contains('revealed')).toBe(true);
    });

    it('stays focusable while hidden, so the first Tab reaches it', async () => {
      const { el, cta } = await setup();
      const link = el.querySelector<HTMLElement>('a')!;
      expect(cta.hasAttribute('inert')).toBe(false);
      expect(cta.getAttribute('aria-hidden')).toBeNull();
      expect(getComputedStyle(cta).visibility).not.toBe('hidden');
      expect(link.tabIndex).toBe(0);
    });

    it('is revealed early by a key press', async () => {
      const { fixture, cta } = await setup();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
      await fixture.whenStable();
      expect(cta.classList.contains('revealed')).toBe(true);
    });
  });
});
