import { PatternId } from '../state/design-defaults';
import { herringbone } from './herringbone';
import { PatternGenerator } from './pattern';

export const PATTERN_GENERATORS: Record<PatternId, PatternGenerator> = {
  herringbone,
};
