import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { PROJECTS_INDEX_KEY } from '../designer/state/project-meta';
import { Landing } from './landing';

describe('Landing', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });
  afterEach(() => localStorage.clear());

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

  describe('with saved projects', () => {
    function seed(names: string[], activeId = 'pabcd0001'): void {
      const projects = names.map((name, i) => ({
        id: `pabcd000${i + 1}`,
        name,
        createdAt: 1,
        updatedAt: 1,
      }));
      projects.forEach((p) => localStorage.setItem(`parket.project.${p.id}`, '{}'));
      localStorage.setItem(PROJECTS_INDEX_KEY, JSON.stringify({ activeId, projects }));
    }

    async function setup() {
      const fixture = TestBed.createComponent(Landing);
      await fixture.whenStable();
      const el = fixture.nativeElement as HTMLElement;
      return { el, links: Array.from(el.querySelectorAll('a')), cta: el.querySelector('.cta')! };
    }

    it('puts Continue first, then Design your floor opening a new project, then the count', async () => {
      seed(['Kitchen', 'Hall', 'Attic']);
      const { el, links } = await setup();
      expect(links.length).toBe(2);
      expect(links[0].textContent?.replace(/\s+/g, ' ').trim()).toBe('Continue: Kitchen');
      expect(links[0].getAttribute('href')).toBe('/designer');
      expect(links[0].classList.contains('primary')).toBe(true);
      expect(links[1].textContent?.trim()).toBe('Design your floor');
      expect(links[1].getAttribute('href')).toBe('/designer?new=1');
      expect(el.querySelector('.meta')?.textContent?.trim()).toBe('3 projects on this device');
    });

    it('uses the singular for one project', async () => {
      seed(['Kitchen']);
      const { el } = await setup();
      expect(el.querySelector('.meta')?.textContent?.trim()).toBe('1 project on this device');
    });

    it('renders the project name as text, never as HTML', async () => {
      seed(['<b id="x">Bold</b>']);
      const { el } = await setup();
      expect(el.querySelector('#x')).toBeNull();
      expect(el.querySelector('.name')?.textContent).toBe('<b id="x">Bold</b>');
    });

    it('shows only the original call to action on a first visit or with corrupt data', async () => {
      localStorage.setItem(PROJECTS_INDEX_KEY, '{not json');
      const { el, links } = await setup();
      expect(links.length).toBe(1);
      expect(links[0].getAttribute('href')).toBe('/designer');
      expect(el.querySelector('.meta')).toBeNull();
    });
  });
});
