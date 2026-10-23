// CONTRACT FILE (dock-redesign task 4). Frozen for tracks B, C, D.

/** The dock sections, in dock order. */
export type SectionId = 'room' | 'floor' | 'colour' | 'light' | 'estimate';

export interface SectionInfo {
  id: SectionId;
  /** Same word on the dock button and the tray heading. */
  label: string;
}

export const SECTIONS: readonly SectionInfo[] = [
  { id: 'room', label: 'Room' },
  { id: 'floor', label: 'Floor' },
  { id: 'colour', label: 'Colour' },
  { id: 'light', label: 'Light' },
  { id: 'estimate', label: 'Estimate' },
];
