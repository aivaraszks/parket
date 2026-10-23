import { Type } from '@angular/core';
import { ColourSection } from './sections/colour-section';
import { EstimateSection } from './sections/estimate-section';
import { FloorSection } from './sections/floor-section';
import { LightSection } from './sections/light-section';
import { RoomSection } from './sections/room-section';
import { SectionId } from './section-id';

/** The component the tray hosts for each section (one per `SectionId`, no inputs). */
export const SECTION_COMPONENTS: Record<SectionId, Type<unknown>> = {
  room: RoomSection,
  floor: FloorSection,
  colour: ColourSection,
  light: LightSection,
  estimate: EstimateSection,
};
