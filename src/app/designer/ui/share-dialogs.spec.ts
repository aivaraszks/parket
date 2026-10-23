import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_DESIGN } from '../state/design-defaults';
import { ShareFallbackDialog } from './share-fallback-dialog';
import { describeShared, SharedLinkDialog } from './shared-link-dialog';

@Component({
  imports: [ShareFallbackDialog, SharedLinkDialog],
  template: `
    @if (kind() === 'fallback') {
      <app-share-fallback-dialog [url]="url" name="Kitchen" (closed)="closed()" />
    } @else if (kind() === 'prompt') {
      <app-shared-link-dialog
        summary="“Kitchen”, simple room, 20.00 m²."
        [atLimit]="atLimit()"
        (confirmed)="confirmed()"
        (cancelled)="cancelled()"
      />
    }
  `,
})
class Host {
  readonly kind = signal<'fallback' | 'prompt' | 'none'>('none');
  readonly atLimit = signal(false);
  readonly url = 'https://example.test/parket/#s=1.abc';
  readonly closed = vi.fn();
  readonly confirmed = vi.fn();
  readonly cancelled = vi.fn();
}

describe('share dialogs', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  async function open(kind: 'fallback' | 'prompt', atLimit = false) {
    const opener = document.createElement('button');
    opener.setAttribute('data-trigger', kind === 'fallback' ? 'share' : 'projects');
    document.body.appendChild(opener);
    opener.focus();
    const fixture = TestBed.createComponent(Host);
    document.body.appendChild(fixture.nativeElement);
    fixture.componentInstance.atLimit.set(atLimit);
    fixture.componentInstance.kind.set(kind);
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    return { fixture, host: fixture.componentInstance, el, opener };
  }

  const press = (key: string, shiftKey = false) => {
    const event = new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true });
    document.dispatchEvent(event);
    return event;
  };

  describe('fallback', () => {
    it('is a labelled dialog with a read-only link field that starts selected', async () => {
      const { el } = await open('fallback');
      const dialog = el.querySelector('[role=dialog]')!;
      expect(dialog.getAttribute('aria-modal')).toBe('true');
      const field = el.querySelector<HTMLInputElement>('#share-fallback-link')!;
      expect(el.querySelector('label[for="share-fallback-link"]')?.textContent).toBe('Share link');
      expect(field.readOnly).toBe(true);
      expect(field.value).toBe('https://example.test/parket/#s=1.abc');
      expect(document.activeElement).toBe(field);
      expect(field.selectionEnd).toBe(field.value.length);
      expect(el.querySelector('#share-fallback-body')?.textContent).toContain('share Kitchen.');
    });

    it('Tab cycles field and Close; Escape and Close emit closed', async () => {
      const { el, host } = await open('fallback');
      const field = el.querySelector<HTMLElement>('#share-fallback-link')!;
      const close = el.querySelector<HTMLElement>('.btn')!;
      close.focus();
      expect(press('Tab').defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(field);
      press('Escape');
      close.click();
      expect(host.closed).toHaveBeenCalledTimes(2);
    });

    it('returns focus to the Share chip', async () => {
      const { fixture, host, opener } = await open('fallback');
      vi.useFakeTimers();
      host.kind.set('none');
      fixture.detectChanges();
      opener.blur();
      vi.runAllTimers();
      expect(document.activeElement).toBe(opener);
      vi.useRealTimers();
    });
  });

  describe('shared-link prompt', () => {
    it('is an alertdialog with the summary and starts on Cancel', async () => {
      const { el } = await open('prompt');
      const dialog = el.querySelector('[role=alertdialog]')!;
      expect(dialog.getAttribute('aria-modal')).toBe('true');
      expect(el.querySelector('#shared-link-title')?.textContent).toBe('Open shared design?');
      const body = el.querySelector('#shared-link-body')!.textContent!;
      expect(body).toContain('“Kitchen”, simple room, 20.00 m².');
      expect(body).toContain('Your projects stay as they are.');
      expect(document.activeElement?.textContent?.trim()).toBe('Cancel');
    });

    it('Add confirms, Cancel and Escape cancel', async () => {
      const { el, host } = await open('prompt');
      const [cancel, add] = Array.from(el.querySelectorAll<HTMLElement>('.btn'));
      expect(add.textContent?.trim()).toBe('Add as new project');
      add.click();
      expect(host.confirmed).toHaveBeenCalledTimes(1);
      cancel.click();
      press('Escape');
      expect(host.cancelled).toHaveBeenCalledTimes(2);
    });

    it('keeps Tab inside the dialog (both directions)', async () => {
      const { el } = await open('prompt');
      const [cancel, add] = Array.from(el.querySelectorAll<HTMLElement>('.btn'));
      add.focus();
      expect(press('Tab').defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(cancel);
      expect(press('Tab', true).defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(add);
    });

    it('at the limit: Add is aria-disabled, does nothing and the reason is shown', async () => {
      const { el, host } = await open('prompt', true);
      const add = el.querySelector<HTMLElement>('[data-add]')!;
      expect(add.getAttribute('aria-disabled')).toBe('true');
      expect(el.querySelector('.warn')?.textContent).toContain(
        'You have 50 projects. Delete one to add this design.',
      );
      add.click();
      expect(host.confirmed).not.toHaveBeenCalled();
    });
  });

  describe('describeShared', () => {
    it('names the design, its kind and area as plain text', () => {
      const text = describeShared('<b>Kitchen</b>', DEFAULT_DESIGN);
      expect(text).toMatch(/^“<b>Kitchen<\/b>”, simple room, \d+\.\d{2} m²\.$/);
      expect(describeShared(null, DEFAULT_DESIGN)).toContain('“Shared design”');
    });
  });
});
