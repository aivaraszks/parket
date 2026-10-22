import { TestBed } from '@angular/core/testing';
import { Landing } from './landing';

describe('Landing', () => {
  it('renders an accessible "parket" heading', async () => {
    const fixture = TestBed.createComponent(Landing);
    await fixture.whenStable();
    const h1 = (fixture.nativeElement as HTMLElement).querySelector('h1');
    expect(h1?.getAttribute('aria-label')).toBe('parket');
    // 6 letter cells + the decorative shine copy
    expect(h1?.querySelectorAll(':scope > [aria-hidden="true"]').length).toBe(7);
  });
});
