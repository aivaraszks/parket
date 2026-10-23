import { TestBed } from '@angular/core/testing';
import { RELOAD_PAGE } from '../../load-error/designer-load-error';
import { PlanEditorLauncher } from './plan-editor-launcher';
import { PlanEditorLoadError } from './plan-editor-load-error';

describe('PlanEditorLoadError', () => {
  it('is a dialog that focuses Try again and closes on Escape', async () => {
    const launcher = { close: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        { provide: PlanEditorLauncher, useValue: launcher },
        { provide: RELOAD_PAGE, useValue: vi.fn() },
      ],
    });
    const fixture = TestBed.createComponent(PlanEditorLoadError);
    document.body.append(fixture.nativeElement);
    fixture.detectChanges();
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const box = el.querySelector('.box')!;
    expect(box.getAttribute('role')).toBe('dialog');
    expect(box.getAttribute('aria-modal')).toBe('true');
    expect(document.activeElement).toBe(el.querySelector('[data-retry]'));
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(launcher.close).toHaveBeenCalled();
    el.remove();
  });
});
