import { Component, model } from '@angular/core';
import { EstimateSummary } from './estimate-summary';
import { panelId, tabId, TabDef, TabList } from './tab-list';
import { EstimateTab } from './tabs/estimate-tab';
import { FloorTab } from './tabs/floor-tab';
import { LightTab } from './tabs/light-tab';
import { RoomTab } from './tabs/room-tab';
import { SurfacesTab } from './tabs/surfaces-tab';

export type SheetStop = 'peek' | 'half' | 'full';
export type TabId = 'room' | 'surfaces' | 'floor' | 'light' | 'estimate';

export const TABS: readonly (TabDef & { id: TabId })[] = [
  { id: 'room', label: 'Room' },
  { id: 'surfaces', label: 'Surfaces' },
  { id: 'floor', label: 'Floor' },
  { id: 'light', label: 'Light' },
  { id: 'estimate', label: 'Estimate' },
];

const STOPS: readonly SheetStop[] = ['peek', 'half', 'full'];
const DRAG_THRESHOLD_PX = 24;

/**
 * Phone: bottom sheet with Peek / Half / Full stops. Desktop (CSS): side panel, handle hidden.
 * The handle is a button, so dragging is optional.
 */
@Component({
  selector: 'app-controls-sheet',
  imports: [TabList, EstimateSummary, RoomTab, SurfacesTab, FloorTab, LightTab, EstimateTab],
  templateUrl: './controls-sheet.html',
  styleUrl: './controls-sheet.scss',
  host: { '[class]': '"stop-" + stop()' },
})
export class ControlsSheet {
  readonly stop = model<SheetStop>('peek');
  readonly tab = model<TabId>('room');

  protected readonly tabs = TABS;
  protected readonly tabId = tabId;
  protected readonly panelId = panelId;

  private dragStartY: number | null = null;
  private dragged = false;

  /** Tapping a tab opens a peeked sheet to Half; tapping the active tab again collapses it. */
  protected onTabClicked(id: string): void {
    const wasSelected = this.tab() === id;
    if (this.stop() === 'peek') {
      this.stop.set('half');
    } else if (wasSelected) {
      this.stop.set('peek');
    }
  }

  protected toggle(): void {
    if (this.dragged) {
      this.dragged = false;
      return;
    }
    this.stop.set(this.stop() === 'peek' ? 'half' : 'peek');
  }

  protected dragStart(event: PointerEvent): void {
    this.dragStartY = event.clientY;
    this.dragged = false;
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  }

  protected dragEnd(event: PointerEvent): void {
    if (this.dragStartY === null) {
      return;
    }
    const delta = event.clientY - this.dragStartY;
    this.dragStartY = null;
    if (Math.abs(delta) < DRAG_THRESHOLD_PX) {
      return;
    }
    this.dragged = true;
    const index = STOPS.indexOf(this.stop());
    const next = Math.min(STOPS.length - 1, Math.max(0, index + (delta < 0 ? 1 : -1)));
    this.stop.set(STOPS[next]);
  }
}
