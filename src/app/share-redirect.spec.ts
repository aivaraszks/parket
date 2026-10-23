import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes, shareLinkRedirect } from './app.routes';

@Component({ template: 'home' })
class Home {}

@Component({ template: 'designer' })
class DesignerStub {}

describe('shareLinkRedirect guard', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: '', canActivate: [shareLinkRedirect], component: Home },
          { path: 'designer', component: DesignerStub },
        ]),
      ],
    });
  });

  it('is on the landing route of the real table', () => {
    const landing = routes.find((r) => r.path === '')!;
    expect(landing.canActivate).toContain(shareLinkRedirect);
  });

  it('redirects a share fragment to /designer and keeps the fragment', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/#s=1.abc');
    const router = TestBed.inject(Router);
    expect(router.url).toBe('/designer#s=1.abc');
  });

  it('leaves the landing page alone without s= (plain, other fragment, none)', async () => {
    const harness = await RouterTestingHarness.create();
    for (const url of ['/', '/#other', '/#x=s=1']) {
      await harness.navigateByUrl(url);
      expect(TestBed.inject(Router).url).toBe(url);
    }
  });
});
