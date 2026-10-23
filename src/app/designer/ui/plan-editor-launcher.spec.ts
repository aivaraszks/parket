import { Location } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { PlanEditorLauncher } from './plan-editor-launcher';

describe('PlanEditorLauncher', () => {
  let router: { navigateByUrl: ReturnType<typeof vi.fn> };
  let location: { back: ReturnType<typeof vi.fn> };
  let launcher: PlanEditorLauncher;

  beforeEach(() => {
    router = { navigateByUrl: vi.fn(() => Promise.resolve(true)) };
    location = { back: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: router },
        { provide: Location, useValue: location },
      ],
    });
    launcher = TestBed.inject(PlanEditorLauncher);
  });

  it('opens the editor route', () => {
    launcher.open();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/designer/plan');
  });

  it('goes back when it opened the editor, like the back button', () => {
    launcher.open();
    launcher.close();
    expect(location.back).toHaveBeenCalledTimes(1);
    expect(router.navigateByUrl).toHaveBeenCalledTimes(1);
  });

  it('replaces the entry when the editor was reloaded or reopened by forward', () => {
    launcher.close();
    expect(location.back).not.toHaveBeenCalled();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/designer', { replaceUrl: true });
    launcher.open();
    launcher.closed();
    launcher.close();
    expect(location.back).not.toHaveBeenCalled();
  });
});
