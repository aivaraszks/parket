import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { DEFAULT_DESIGN } from '../state/design-defaults';
import { ProjectIndex } from '../state/project-index';
import { Projects, ProjectsResult } from '../state/projects';
import { Toasts } from '../ui/toasts';
import { encodeShare } from './share-codec';
import { IncomingShare } from './incoming-share';

function setup(hash: string, addShared: ProjectsResult = { ok: true, id: 'pabcd1234' }) {
  const location = { hash, pathname: '/parket/designer', search: '?a=1' };
  const replaceState = vi.fn((_state: unknown, _title: string, url: string) => {
    location.hash = url.includes('#') ? url.slice(url.indexOf('#')) : '';
  });
  const doc = { location, defaultView: { location, history: { state: { n: 1 }, replaceState } } };
  const add = vi.fn().mockReturnValue(addShared);
  TestBed.configureTestingModule({
    providers: [
      { provide: DOCUMENT, useValue: doc },
      { provide: Projects, useValue: { addShared: add } },
      {
        provide: ProjectIndex,
        useValue: {
          projects: () => [{ id: 'pabcd1234', name: 'Kitchen 2', createdAt: 1, updatedAt: 1 }],
        },
      },
    ],
  });
  return {
    incoming: TestBed.inject(IncomingShare),
    toasts: TestBed.inject(Toasts),
    add,
    replaceState,
    location,
  };
}

describe('IncomingShare', () => {
  it('does nothing without a share fragment', async () => {
    const { incoming, replaceState } = setup('#other');
    expect(incoming.hasLink()).toBe(false);
    await incoming.read();
    expect(incoming.pending()).toBeNull();
    expect(replaceState).not.toHaveBeenCalled();
  });

  it('decodes a valid link into a pending prompt and leaves the hash until answered', async () => {
    const token = await encodeShare(DEFAULT_DESIGN, 'Kitchen');
    const { incoming, replaceState } = setup(`#s=${token}`);
    await incoming.read();
    expect(incoming.pending()?.name).toBe('Kitchen');
    expect(replaceState).not.toHaveBeenCalled();
  });

  it('accept adds the project, toasts, and clears the hash keeping path and query', async () => {
    const token = await encodeShare(DEFAULT_DESIGN, 'Kitchen');
    const { incoming, toasts, add, replaceState, location } = setup(`#s=${token}`);
    await incoming.read();
    incoming.accept();
    expect(add).toHaveBeenCalledWith('Kitchen', expect.objectContaining({ mode: 'simple' }));
    expect(toasts.current()?.text).toBe('Added “Kitchen 2”.');
    expect(replaceState).toHaveBeenCalledWith({ n: 1 }, '', '/parket/designer?a=1');
    expect(location.hash).toBe('');
    expect(incoming.pending()).toBeNull();
  });

  it('accept closes the prompt and clears the hash when the project could not be added', async () => {
    const token = await encodeShare(DEFAULT_DESIGN, 'Kitchen');
    const { incoming, replaceState } = setup(`#s=${token}`, { ok: false, reason: 'limit' });
    await incoming.read();
    incoming.accept();
    expect(incoming.pending()).toBeNull();
    expect(replaceState).toHaveBeenCalled();
  });

  it('also resets the router, so a hash set while the designer is open stays gone', async () => {
    const token = await encodeShare(DEFAULT_DESIGN, 'Kitchen');
    const { incoming } = setup(`#s=${token}`);
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    vi.spyOn(router, 'url', 'get').mockReturnValue('/designer#s=1.x');
    await incoming.read();
    vi.useFakeTimers();
    incoming.decline();
    vi.advanceTimersByTime(300);
    vi.useRealTimers();
    expect(navigate).toHaveBeenCalledWith(
      [],
      expect.objectContaining({ queryParamsHandling: 'preserve', replaceUrl: true }),
    );
  });

  it('resets the router for a broken link too, and leaves it alone when it has no hash', async () => {
    const { incoming } = setup('#s=1.AAAA_broken');
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const url = vi.spyOn(router, 'url', 'get').mockReturnValue('/designer#s=1.AAAA_broken');
    vi.useFakeTimers();
    await incoming.read();
    vi.advanceTimersByTime(300);
    expect(navigate).toHaveBeenCalledTimes(1);
    url.mockReturnValue('/designer');
    navigate.mockClear();
    incoming.decline();
    vi.advanceTimersByTime(300);
    vi.useRealTimers();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('decline changes nothing but clears the hash', async () => {
    const token = await encodeShare(DEFAULT_DESIGN, 'Kitchen');
    const { incoming, toasts, add, location } = setup(`#s=${token}`);
    await incoming.read();
    incoming.decline();
    expect(add).not.toHaveBeenCalled();
    expect(toasts.current()).toBeNull();
    expect(location.hash).toBe('');
    expect(incoming.pending()).toBeNull();
  });

  it('shows an error toast and clears the hash for a broken link', async () => {
    const { incoming, toasts, location } = setup('#s=1.%%%');
    await incoming.read();
    expect(toasts.current()).toMatchObject({
      text: 'This link is broken or incomplete.',
      kind: 'error',
    });
    expect(incoming.pending()).toBeNull();
    expect(location.hash).toBe('');
  });

  it('explains a link made by a newer version', async () => {
    const { incoming, toasts, location } = setup('#s=2.abcd');
    await incoming.read();
    expect(toasts.current()?.text).toContain('newer version of Parket');
    expect(location.hash).toBe('');
  });
});
