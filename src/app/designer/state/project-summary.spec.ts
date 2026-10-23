import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readProjectSummary } from './project-summary';

const A = 'pabcd1234';
const B = 'pefgh5678';

/** The project keys the full reader requires for an index entry to count. */
function seedProjects(...ids: string[]): void {
  ids.forEach((id) => localStorage.setItem(`parket.project.${id}`, '{}'));
}

describe('readProjectSummary', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('is null on a first visit', () => {
    expect(readProjectSummary()).toBeNull();
  });

  it('reads the active name and the count from the index', () => {
    seedProjects(A, B);
    localStorage.setItem(
      'parket.projects.v1',
      JSON.stringify({
        activeId: B,
        projects: [
          { id: A, name: 'Kitchen' },
          { id: B, name: ' Bedroom\u0000 ' },
          { id: A, name: 'dup' },
          { id: 'bad', name: 'x' },
        ],
      }),
    );
    expect(readProjectSummary()).toEqual({ activeName: 'Bedroom', count: 2 });
  });

  it('falls back to the most recently updated project for an unknown activeId', () => {
    seedProjects(A, B);
    localStorage.setItem(
      'parket.projects.v1',
      JSON.stringify({
        activeId: 'x',
        projects: [
          { id: A, name: 'One', updatedAt: 9 },
          { id: B, name: 'Two', updatedAt: 5 },
        ],
      }),
    );
    expect(readProjectSummary()).toEqual({ activeName: 'One', count: 2 });
  });

  it('skips entries whose project key is missing', () => {
    seedProjects(B);
    localStorage.setItem(
      'parket.projects.v1',
      JSON.stringify({
        activeId: A,
        projects: [
          { id: A, name: 'Gone' },
          { id: B, name: 'Here' },
        ],
      }),
    );
    expect(readProjectSummary()).toEqual({ activeName: 'Here', count: 1 });
  });

  it.each(['parket.design.v3', 'parket.design.v2', 'parket.design.v1'])(
    'shows a legacy %s design as "My room", 1 project',
    (key) => {
      localStorage.setItem(key, '{"angle":3}');
      expect(readProjectSummary()).toEqual({ activeName: 'My room', count: 1 });
    },
  );

  it('uses the index over legacy keys, and legacy keys when the index is unusable', () => {
    localStorage.setItem('parket.design.v3', '{}');
    localStorage.setItem('parket.projects.v1', '{nope');
    expect(readProjectSummary()).toEqual({ activeName: 'My room', count: 1 });
    seedProjects(A);
    localStorage.setItem(
      'parket.projects.v1',
      JSON.stringify({ activeId: A, projects: [{ id: A, name: 'Kitchen' }] }),
    );
    expect(readProjectSummary()).toEqual({ activeName: 'Kitchen', count: 1 });
  });

  it('ignores corrupt legacy data and junk indexes', () => {
    localStorage.setItem('parket.design.v3', '{{');
    localStorage.setItem('parket.projects.v1', '[]');
    expect(readProjectSummary()).toBeNull();
  });

  it('never throws when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readProjectSummary()).toBeNull();
  });
});
