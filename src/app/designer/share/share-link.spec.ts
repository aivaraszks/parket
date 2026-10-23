import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { DEFAULT_DESIGN } from '../state/design-defaults';
import { DesignState } from '../state/design-state';
import { ProjectIndex } from '../state/project-index';
import { Toasts } from '../ui/toasts';
import { decodeShare } from './share-codec';
import { ShareLink } from './share-link';

interface Env {
  coarse: boolean;
  share?: ReturnType<typeof vi.fn>;
  canShare?: () => boolean;
  writeText?: ReturnType<typeof vi.fn>;
}

function setup(env: Env, design = DEFAULT_DESIGN) {
  const navigator = {
    share: env.share,
    canShare: env.canShare,
    clipboard: env.writeText ? { writeText: env.writeText } : undefined,
  };
  const doc = {
    baseURI: 'https://x.test/parket/',
    defaultView: { navigator, matchMedia: () => ({ matches: env.coarse }) },
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: DOCUMENT, useValue: doc },
      { provide: DesignState, useValue: { activeId: () => 'pabcd1234', snapshot: () => design } },
      {
        provide: ProjectIndex,
        useValue: {
          projects: () => [{ id: 'pabcd1234', name: 'Kitchen', createdAt: 1, updatedAt: 1 }],
        },
      },
    ],
  });
  return { link: TestBed.inject(ShareLink), toasts: TestBed.inject(Toasts) };
}

describe('ShareLink', () => {
  it('opens the share sheet on a coarse pointer when canShare allows it', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const writeText = vi.fn();
    const { link, toasts } = setup({ coarse: true, share, canShare: () => true, writeText });
    await link.share();
    expect(writeText).not.toHaveBeenCalled();
    expect(share).toHaveBeenCalledTimes(1);
    const arg = share.mock.calls[0][0] as { title: string; url: string };
    expect(arg.title).toBe('Parket: Kitchen');
    expect(arg.url.startsWith('https://x.test/parket/#s=1.')).toBe(true);
    const decoded = await decodeShare(arg.url.slice(arg.url.indexOf('#s=') + 3));
    expect(decoded.ok && decoded.name).toBe('Kitchen');
    expect(toasts.current()).toBeNull();
  });

  it('copies on a fine pointer even when navigator.share exists', async () => {
    const share = vi.fn();
    const writeText = vi.fn().mockResolvedValue(undefined);
    const { link, toasts } = setup({ coarse: false, share, canShare: () => true, writeText });
    await link.share();
    expect(share).not.toHaveBeenCalled();
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(toasts.current()?.text).toBe('Link copied.');
  });

  it('copies on a coarse pointer when canShare says no', async () => {
    const share = vi.fn();
    const writeText = vi.fn().mockResolvedValue(undefined);
    const { link } = setup({ coarse: true, share, canShare: () => false, writeText });
    await link.share();
    expect(share).not.toHaveBeenCalled();
    expect(writeText).toHaveBeenCalled();
  });

  it('is silent when the user cancels the share sheet', async () => {
    const share = vi.fn().mockRejectedValue(new DOMException('cancelled', 'AbortError'));
    const writeText = vi.fn();
    const { link, toasts } = setup({ coarse: true, share, canShare: () => true, writeText });
    await link.share();
    expect(writeText).not.toHaveBeenCalled();
    expect(toasts.current()).toBeNull();
    expect(link.fallbackUrl()).toBeNull();
  });

  it('copies instead when the share sheet fails for another reason', async () => {
    const share = vi.fn().mockRejectedValue(new DOMException('no', 'NotAllowedError'));
    const writeText = vi.fn().mockResolvedValue(undefined);
    const { link, toasts } = setup({ coarse: true, share, canShare: () => true, writeText });
    await link.share();
    expect(toasts.current()?.text).toBe('Link copied.');
  });

  it('opens the fallback with the link when the clipboard fails, and closes it again', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    const { link, toasts } = setup({ coarse: false, writeText });
    await link.share();
    expect(link.fallbackUrl()).toMatch(/^https:\/\/x\.test\/parket\/#s=1\./);
    expect(toasts.current()).toBeNull();
    link.closeFallback();
    expect(link.fallbackUrl()).toBeNull();
  });

  it('opens the fallback when there is no clipboard at all', async () => {
    const { link } = setup({ coarse: false });
    await link.share();
    expect(link.fallbackUrl()).not.toBeNull();
  });

  it('shows an error toast and no link when the design is too big', async () => {
    let seed = 7;
    const noise = Array.from({ length: 12000 }, () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return String.fromCharCode(33 + (seed % 90));
    }).join('');
    const writeText = vi.fn();
    const { link, toasts } = setup(
      { coarse: false, writeText },
      { ...DEFAULT_DESIGN, species: noise },
    );
    await link.share();
    expect(writeText).not.toHaveBeenCalled();
    expect(toasts.current()).toMatchObject({
      text: 'This design is too big to share as a link.',
      kind: 'error',
    });
    expect(link.busy()).toBe(false);
  });
});
