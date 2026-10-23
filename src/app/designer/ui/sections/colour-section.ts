import { Component, computed, effect, inject, untracked } from '@angular/core';
import { SurfaceRef } from '../../plan/paint';
import { ColouringState } from '../../state/colouring-state';
import { DesignState } from '../../state/design-state';
import { DOOR_COLOURS, paletteName, SKIRTING_COLOURS, WALL_PAINTS } from '../../state/palettes';
import { ColorPreset } from '../../state/species';
import { ColourAnnouncer } from '../colour-announcer';
import { ColourConfirm } from '../colour-confirm';
import { SurfaceList } from '../surface-list';
import { doorIds, findItem, SurfaceItem, surfaceItems } from '../surface-model';
import { SwatchGroup } from '../swatch-group';
import { Toasts } from '../toasts';

const UNDO_TOAST_MS = 8000;

/** What the palette needs for the selected surface. */
interface Target {
  readonly item: SurfaceItem;
  readonly presets: readonly ColorPreset[];
  /** Current colour; null = the default swatch. */
  readonly value: string | null;
  readonly defaultLabel: string | null;
  readonly customLabel: string;
  /** The "default" state in words, for the value line and the announcements. */
  readonly defaultText: string;
}

function list(names: readonly string[]): string {
  return names.length < 2
    ? (names[0] ?? '')
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

@Component({
  selector: 'app-colour-section',
  imports: [SurfaceList, SwatchGroup],
  templateUrl: './colour-section.html',
  styleUrl: './colour-section.scss',
})
export class ColourSection {
  protected readonly state = inject(DesignState);
  protected readonly colouring = inject(ColouringState);
  private readonly confirm = inject(ColourConfirm);
  private readonly announcer = inject(ColourAnnouncer);
  private readonly toasts = inject(Toasts);

  protected readonly items = computed(() =>
    surfaceItems(this.state.roomShape(), this.state.mode() === 'simple', {
      paint: this.state.paint(),
      wallColor: this.state.wallColor(),
      doorColor: this.state.doorColor(),
    }),
  );
  protected readonly noDoors = computed(() => doorIds(this.state.roomShape()).length === 0);

  protected readonly target = computed<Target | null>(() => {
    const item = findItem(this.items(), this.colouring.selected());
    if (!item) {
      return null;
    }
    const ref = item.ref;
    const wallColor = this.state.wallColor();
    switch (ref.kind) {
      case 'walls':
        return this.make(item, WALL_PAINTS, wallColor, null, 'Custom wall colour', '');
      case 'wall':
        return this.make(
          item,
          WALL_PAINTS,
          item.hex !== wallColor ? item.hex : null,
          'Same as other walls',
          `Custom colour for ${item.name}`,
          'the same as other walls',
        );
      case 'ceiling':
        return this.make(
          item,
          WALL_PAINTS,
          this.state.ceilingColor(),
          null,
          'Custom ceiling colour',
          '',
        );
      case 'skirting':
        return this.make(
          item,
          SKIRTING_COLOURS,
          this.state.skirtingColor(),
          'Match walls',
          'Custom skirting colour',
          'matching the walls',
        );
      case 'doors':
        return this.make(
          item,
          DOOR_COLOURS,
          this.state.doorColor(),
          'Auto',
          'Custom colour for all doors',
          'automatic',
        );
      case 'door': {
        const own = this.state.plan()?.openings.find((o) => o.id === ref.id)?.color ?? null;
        return this.make(
          item,
          DOOR_COLOURS,
          own,
          'Auto',
          `Custom colour for ${item.name}`,
          'automatic',
        );
      }
    }
  });

  /** One line under the palette: the current colour in words. */
  protected readonly valueLine = computed(() => {
    const t = this.target();
    if (!t) {
      return '';
    }
    if (t.value === null) {
      return t.item.ref.kind === 'skirting'
        ? 'Skirting matches the walls.'
        : `${t.item.subject} ${t.item.ref.kind === 'doors' ? 'are' : 'is'} ${t.defaultText}.`;
    }
    const name = paletteName(t.value);
    if (!name) {
      return `Custom: ${t.value}`;
    }
    const plural = t.item.ref.kind === 'walls' || t.item.ref.kind === 'doors';
    return `${t.item.subject} ${plural ? 'are' : 'is'} ${name}.`;
  });
  protected readonly customHex = computed(() => {
    const t = this.target();
    return t?.value && !paletteName(t.value) && !t.presets.some((p) => p.hex === t.value)
      ? t.value
      : null;
  });
  protected readonly paintsDoor = computed(() => {
    const kind = this.target()?.item.ref.kind;
    return kind === 'door' || kind === 'doors';
  });
  /** An "All walls" pick will ask first, so a custom colour waits until the picker closes. */
  protected readonly confirmsWalls = computed(
    () => this.colouring.selected()?.kind === 'walls' && this.state.hasAccentWalls(),
  );

  constructor() {
    // Colour is open: a selection always exists. It falls back to "All walls" when the selected
    // surface is gone (the room shape changed) or was never set.
    effect(() => {
      const selected = this.colouring.selected();
      if (selected === null || !findItem(this.items(), selected)) {
        untracked(() => this.colouring.select({ kind: 'walls' }, 'list'));
      }
    });
    // A tap in 3D made this selection: say so (focus stays on the canvas).
    let seen = untracked(() => this.colouring.lastTap());
    effect(() => {
      const taps = this.colouring.lastTap();
      if (taps !== seen) {
        seen = taps;
        untracked(() => this.announceSelection());
      }
    });
  }

  private announceSelection(): void {
    const item = findItem(this.items(), this.colouring.selected());
    if (item) {
      this.announcer.say(`${item.label.replace(' (window)', '')} selected.`);
    }
  }

  private make(
    item: SurfaceItem,
    presets: readonly ColorPreset[],
    value: string | null,
    defaultLabel: string | null,
    customLabel: string,
    defaultText: string,
  ): Target {
    return { item, presets, value, defaultLabel, customLabel, defaultText };
  }

  protected onPick(hex: string | null): void {
    const t = this.target();
    if (!t) {
      return;
    }
    const ref = t.item.ref;
    if (ref.kind === 'walls' && hex !== null && this.state.hasAccentWalls()) {
      this.askAllWalls(hex);
      return;
    }
    this.state.setSurfaceColor(ref, hex);
    this.colouring.markColourPicked();
    this.announce(t, hex);
  }

  private announce(t: Target, hex: string | null): void {
    const subject = t.item.subject;
    if (hex === null) {
      const text =
        t.item.ref.kind === 'skirting'
          ? 'Skirting: matches the walls.'
          : `${subject}: ${t.defaultText.replace(/^the /, '')}.`;
      this.announcer.say(text);
      return;
    }
    const name = paletteName(hex);
    if (name) {
      this.announcer.say(`${subject}: ${name}.`);
    } else {
      this.announcer.sayLater(`${subject}: custom colour ${hex.slice(1)}`);
    }
  }

  private askAllWalls(hex: string): void {
    const accents = this.items().filter(
      (item) => item.ref.kind === 'wall' && item.hex !== this.state.wallColor(),
    );
    const names = accents.map((item) => item.name);
    let body: string;
    if (names.length === 0) {
      body = 'Some walls have their own colours. They will all become this colour.';
    } else if (names.length > 3) {
      body = `${names.length} walls have their own colours. They will all become this colour.`;
    } else if (names.length === 1) {
      body = `${names[0]} has its own colour. It will become this colour.`;
    } else {
      body = `${list(names)} have their own colours. They will all become this colour.`;
    }
    const before = {
      base: this.state.wallColor(),
      accents: accents.map((item) => ({ ref: item.ref, hex: item.hex })),
    };
    this.confirm.ask({
      body,
      onConfirm: () => {
        this.state.setSurfaceColor({ kind: 'walls' }, hex);
        this.colouring.markColourPicked();
        const mode = this.state.mode();
        const shape = this.state.roomShape();
        this.announcer.say(
          `All walls: ${paletteName(hex) ?? `custom colour ${hex.slice(1)}`}. Accent walls cleared.`,
        );
        this.toasts.show('All walls changed.', {
          durationMs: UNDO_TOAST_MS,
          action: { label: 'Undo', run: () => this.restoreWalls(before) },
          keepWhile: () =>
            this.state.mode() === mode &&
            this.state.roomShape() === shape &&
            this.state.wallColor() === hex &&
            !this.state.hasAccentWalls(),
        });
      },
    });
  }

  private restoreWalls(before: {
    base: string;
    accents: readonly { ref: SurfaceRef; hex: string }[];
  }): void {
    this.state.setSurfaceColors([
      { ref: { kind: 'walls' }, hex: before.base },
      ...before.accents.map((accent) => ({ ref: accent.ref, hex: accent.hex })),
    ]);
  }
}
