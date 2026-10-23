import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { SceneCommands } from '../scene/scene-commands';
import { ViewportStatus } from './viewport-status';

describe('ViewportStatus', () => {
  async function setup() {
    const fixture = TestBed.createComponent(ViewportStatus);
    const el = fixture.nativeElement as HTMLElement;
    return { fixture, el, commands: TestBed.inject(SceneCommands) };
  }

  it('keeps one persistent live region that announces the loading text', async () => {
    const { fixture, el, commands } = await setup();
    await fixture.whenStable();
    const region = el.querySelector('[role=status]')!;
    expect(region.textContent?.trim()).toBe('Preparing your room...');
    commands.setStatus('ready');
    await fixture.whenStable();
    expect(el.querySelector('[role=status]')).toBe(region);
    expect(el.querySelectorAll('[role=status]').length).toBe(1);
  });

  it('announces a paused display and clears the message when ready', async () => {
    const { fixture, el, commands } = await setup();
    await fixture.whenStable();
    commands.setStatus('context-lost');
    await fixture.whenStable();
    expect(el.querySelector('[role=status]')?.textContent?.trim()).toBe(
      'Display paused. Restoring...',
    );
    commands.setStatus('ready');
    await fixture.whenStable();
    expect(el.querySelector('[role=status]')?.textContent?.trim()).toBe('');
  });
});
