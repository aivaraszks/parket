import { describe, expect, it } from 'vitest';
import { DEFAULT_DESIGN, STORAGE_KEY, STORAGE_KEY_V1, STORAGE_KEY_V2 } from './design-defaults';
import { FakeStorage } from './fake-storage';
import {
  LEGACY_DESIGN_KEYS,
  MAX_PROJECTS,
  PROJECT_KEY_PREFIX,
  PROJECTS_INDEX_KEY,
  ProjectIndexData,
  projectKey,
  sanitizeProjectName,
} from './project-meta';
import {
  createProjectId,
  loadProjects,
  readIndex,
  readProject,
  sanitizeIndex,
  sweepOrphans,
  writeIndex,
  writeProject,
  writeProjectAndIndex,
} from './project-storage';

const A = 'pabcd1234';
const B = 'pefgh5678';

function meta(id: string, name = id, updatedAt = 1) {
  return { id, name, createdAt: 1, updatedAt };
}

function seed(storage: Storage, index: unknown, ids: string[] = []): void {
  storage.setItem(PROJECTS_INDEX_KEY, JSON.stringify(index));
  for (const id of ids) {
    storage.setItem(projectKey(id), JSON.stringify({ angle: 10 }));
  }
}

describe('legacy key constants', () => {
  it('match the designer constants (the landing page keeps its own copy)', () => {
    expect(LEGACY_DESIGN_KEYS).toEqual([STORAGE_KEY, STORAGE_KEY_V2, STORAGE_KEY_V1]);
  });
});

describe('sanitizeProjectName', () => {
  it('trims, strips control characters and cuts to 40 characters', () => {
    expect(sanitizeProjectName('  Kitchen\u0000\n ')).toBe('Kitchen');
    expect(sanitizeProjectName('x'.repeat(100))).toHaveLength(40);
    expect(sanitizeProjectName('   ')).toBeNull();
    expect(sanitizeProjectName(42)).toBeNull();
  });
});

describe('createProjectId', () => {
  it('makes p + 8 base36 characters and avoids taken ids', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const id = createProjectId(ids);
      expect(id).toMatch(/^p[0-9a-z]{8}$/);
      expect(ids.has(id)).toBe(false);
      ids.add(id);
    }
  });
});

describe('sanitizeIndex (hostile input)', () => {
  it('rejects things that are not an index', () => {
    for (const raw of [null, 42, 'x', [], {}, { projects: 'x' }, { projects: [] }]) {
      expect(sanitizeIndex(raw)).toBeNull();
    }
    expect(
      sanitizeIndex({ projects: [null, 3, {}, { id: '../x' }, { id: 'P12345678' }] }),
    ).toBeNull();
  });

  it('caps a 1000-entry list at 50', () => {
    const projects = Array.from({ length: 1000 }, (_, i) => meta('p' + String(i).padStart(8, '0')));
    expect(sanitizeIndex({ activeId: 'p00000000', projects })!.projects).toHaveLength(MAX_PROJECTS);
  });

  it('drops duplicate and bad ids and fixes names and times', () => {
    const index = sanitizeIndex({
      activeId: A,
      projects: [
        { id: A, name: ' Kitchen\u0007 ', createdAt: 5, updatedAt: 'x' },
        { id: A, name: 'dup' },
        { id: 'bad id', name: 'x' },
        { id: B, name: 'y'.repeat(500), createdAt: -3, updatedAt: Infinity },
        { id: 'pzzzzzzzz', name: '   ' },
      ],
    })!;
    expect(index.projects.map((p) => p.id)).toEqual([A, B, 'pzzzzzzzz']);
    expect(index.projects[0]).toEqual({ id: A, name: 'Kitchen', createdAt: 5, updatedAt: 5 });
    expect(index.projects[1].name).toHaveLength(40);
    expect(index.projects[1].createdAt).toBe(0);
    expect(index.projects[2].name).toBe('Project 3');
  });

  it('picks the most recently updated project for an unknown activeId', () => {
    const projects = [meta(A, 'a', 10), meta(B, 'b', 99)];
    expect(sanitizeIndex({ activeId: 'nope', projects })!.activeId).toBe(B);
    expect(sanitizeIndex({ activeId: 7, projects })!.activeId).toBe(B);
    expect(sanitizeIndex({ activeId: A, projects })!.activeId).toBe(A);
  });
});

describe('readIndex / readProject', () => {
  it('drops entries whose project key is missing', () => {
    const s = new FakeStorage();
    seed(s, { activeId: A, projects: [meta(A), meta(B)] }, [B]);
    const index = readIndex(s)!;
    expect(index.projects.map((p) => p.id)).toEqual([B]);
    expect(index.activeId).toBe(B);
  });

  it('returns null for corrupt JSON or when every key is missing', () => {
    const s = new FakeStorage();
    s.setItem(PROJECTS_INDEX_KEY, '{nope');
    expect(readIndex(s)).toBeNull();
    seed(s, { activeId: A, projects: [meta(A)] });
    expect(readIndex(s)).toBeNull();
  });

  it('loads corrupt project JSON as defaults and a missing key as null', () => {
    const s = new FakeStorage();
    s.setItem(projectKey(A), '{{{');
    expect(readProject(s, A)).toEqual(DEFAULT_DESIGN);
    expect(readProject(s, B)).toBeNull();
    expect(readProject(s, '../evil')).toBeNull();
  });

  it('sanitises a stored project', () => {
    const s = new FakeStorage();
    s.setItem(projectKey(A), JSON.stringify({ angle: 9999, species: 'nope' }));
    expect(readProject(s, A)!.angle).toBe(179);
    expect(readProject(s, A)!.species).toBe(DEFAULT_DESIGN.species);
  });
});

describe('writes and quota', () => {
  const index: ProjectIndexData = { activeId: A, projects: [meta(A)] };

  it('writes the project first, then the index', () => {
    const s = new FakeStorage();
    const order: string[] = [];
    const set = s.setItem.bind(s);
    s.setItem = (k, v) => {
      order.push(k);
      set(k, v);
    };
    expect(writeProjectAndIndex(s, A, DEFAULT_DESIGN as never, index).ok).toBe(true);
    expect(order).toEqual([projectKey(A), PROJECTS_INDEX_KEY]);
  });

  it('removes the new project key again when the index write fails', () => {
    const s = new FakeStorage();
    s.failWhen = (k) => k === PROJECTS_INDEX_KEY;
    expect(writeProjectAndIndex(s, A, DEFAULT_DESIGN as never, index).ok).toBe(false);
    expect(s.length).toBe(0);
  });

  it('leaves nothing when the project write fails', () => {
    const s = new FakeStorage();
    s.failWhen = () => true;
    expect(writeProjectAndIndex(s, A, DEFAULT_DESIGN as never, index).ok).toBe(false);
    expect(s.length).toBe(0);
  });

  it('reports failures instead of throwing', () => {
    const s = new FakeStorage();
    s.failWhen = () => true;
    expect(writeIndex(s, index).ok).toBe(false);
    expect(writeProject(s, A, DEFAULT_DESIGN as never).ok).toBe(false);
    expect(writeProject(s, 'bad', DEFAULT_DESIGN as never).ok).toBe(false);
  });
});

describe('sweepOrphans', () => {
  it('removes project keys that are not in the index and nothing else', () => {
    const s = new FakeStorage();
    seed(s, { activeId: A, projects: [meta(A)] }, [A, B]);
    s.setItem(PROJECT_KEY_PREFIX + 'weird', '1');
    s.setItem(STORAGE_KEY, '{}');
    s.setItem('other', '1');
    sweepOrphans(s, { activeId: A, projects: [meta(A)] });
    expect(s.getItem(projectKey(A))).not.toBeNull();
    expect(s.getItem(projectKey(B))).toBeNull();
    expect(s.getItem(PROJECT_KEY_PREFIX + 'weird')).toBeNull();
    expect(s.getItem(STORAGE_KEY)).toBe('{}');
    expect(s.getItem('other')).toBe('1');
  });
});

describe('loadProjects with an unreadable index', () => {
  const junk = [
    '{nope',
    '[]',
    'null',
    '"x"',
    '{"projects":"no"}',
    '{"projects":[]}',
    '{"activeId":1,"projects":[{"id":"bad"},5,null]}',
    '',
  ];

  it.each(junk)(
    'rebuilds the list from the project keys for index %j and deletes nothing',
    (text) => {
      const s = new FakeStorage();
      s.setItem(PROJECTS_INDEX_KEY, text);
      s.setItem(projectKey(A), JSON.stringify({ angle: 10 }));
      s.setItem(projectKey(B), JSON.stringify({ angle: 20 }));
      s.setItem(STORAGE_KEY, JSON.stringify({ angle: 99 }));
      const loaded = loadProjects(s, 5);
      expect(loaded.index.projects.map((p) => p.id).sort()).toEqual([A, B]);
      expect(loaded.index.projects.map((p) => p.name)).toEqual(['Project 1', 'Project 2']);
      expect(loaded.index.projects.every((p) => p.updatedAt === 0)).toBe(true);
      expect([A, B]).toContain(loaded.index.activeId);
      expect(loaded.design.angle).toBe(loaded.index.activeId === A ? 10 : 20);
      expect(s.getItem(projectKey(A))).not.toBeNull();
      expect(s.getItem(projectKey(B))).not.toBeNull();
      expect(JSON.parse(s.getItem(PROJECTS_INDEX_KEY)!).projects).toHaveLength(2);
    },
  );

  it('rebuilds when the index only lists projects whose keys are gone', () => {
    const s = new FakeStorage();
    seed(s, { activeId: A, projects: [meta(A)] }, [B]);
    const loaded = loadProjects(s, 1);
    expect(loaded.index.projects.map((p) => p.id)).toEqual([B]);
    expect(s.getItem(projectKey(B))).not.toBeNull();
  });

  it('survives random garbage indexes without losing a project key (fuzz)', () => {
    let seedValue = 12345;
    const random = () => (seedValue = (seedValue * 1103515245 + 12345) % 2147483648) / 2147483648;
    const pieces = [
      '{',
      '}',
      '[',
      ']',
      '"',
      ':',
      ',',
      'projects',
      'activeId',
      'null',
      '1e999',
      'p',
    ];
    for (let round = 0; round < 200; round++) {
      const s = new FakeStorage();
      const ids = ['pabcd1234', 'pefgh5678', 'pzzzz0000'].slice(0, 1 + Math.floor(random() * 3));
      ids.forEach((id) => s.setItem(projectKey(id), '{}'));
      let text = '';
      for (let i = Math.floor(random() * 12); i > 0; i--) {
        text += pieces[Math.floor(random() * pieces.length)];
      }
      s.setItem(PROJECTS_INDEX_KEY, text);
      const loaded = loadProjects(s, 1);
      const listed = new Set(loaded.index.projects.map((p) => p.id));
      for (const id of ids) {
        expect(s.getItem(projectKey(id)), `round ${round}: ${text}`).not.toBeNull();
      }
      // Either the garbage happened to be a valid index, or every key is listed.
      if (ids.some((id) => !listed.has(id))) {
        expect(loaded.index.projects.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('loadProjects migration', () => {
  const legacy = { angle: 45, species: 'walnut' };

  it.each([
    ['v3', STORAGE_KEY],
    ['v2', STORAGE_KEY_V2],
    ['v1', STORAGE_KEY_V1],
  ])('turns a %s design into "My room"', (_name, key) => {
    const s = new FakeStorage();
    s.setItem(key, JSON.stringify(legacy));
    const loaded = loadProjects(s, 1234);
    expect(loaded.persisted).toBe(true);
    expect(loaded.index.projects).toHaveLength(1);
    expect(loaded.index.projects[0]).toMatchObject({ name: 'My room', createdAt: 1234 });
    expect(loaded.design.angle).toBe(45);
    expect(loaded.index.activeId).toBe(loaded.index.projects[0].id);
    expect(readProject(s, loaded.index.activeId)!.angle).toBe(45);
    expect(s.getItem(key)).toBe(JSON.stringify(legacy));
  });

  it('prefers v3 over v2 over v1 and forces v1 into simple mode', () => {
    const s = new FakeStorage();
    s.setItem(STORAGE_KEY_V1, JSON.stringify({ angle: 1, mode: 'custom' }));
    s.setItem(STORAGE_KEY_V2, JSON.stringify({ angle: 2 }));
    expect(loadProjects(s, 1).design.angle).toBe(2);
    s.clear();
    s.setItem(STORAGE_KEY_V1, JSON.stringify({ angle: 1, mode: 'custom' }));
    const v1 = loadProjects(s, 1).design;
    expect(v1.angle).toBe(1);
    expect(v1.mode).toBe('simple');
  });

  it('creates "Project 1" from the defaults when there is no legacy data', () => {
    const s = new FakeStorage();
    const loaded = loadProjects(s, 7);
    expect(loaded.index.projects[0].name).toBe('Project 1');
    expect(loaded.design).toEqual(DEFAULT_DESIGN);
    expect(s.getItem(PROJECTS_INDEX_KEY)).not.toBeNull();
  });

  it('runs once: a second load reuses the index and does not write', () => {
    const s = new FakeStorage();
    s.setItem(STORAGE_KEY, JSON.stringify(legacy));
    const first = loadProjects(s, 1);
    s.failWhen = () => true;
    const second = loadProjects(s, 2);
    expect(second.index).toEqual(first.index);
    expect(second.design.angle).toBe(45);
    expect(s.length).toBe(3);
  });

  it('sweeps orphan project keys next to a readable index', () => {
    const s = new FakeStorage();
    seed(s, { activeId: A, projects: [meta(A)] }, [A]);
    s.setItem(projectKey(B), '{}');
    loadProjects(s, 1);
    expect(s.getItem(projectKey(B))).toBeNull();
    expect(s.getItem(projectKey(A))).not.toBeNull();
  });

  it('runs in memory without storage', () => {
    const loaded = loadProjects(null, 1);
    expect(loaded.persisted).toBe(false);
    expect(loaded.index.projects[0].name).toBe('Project 1');
  });

  it('reports not persisted when the first write fails, and keeps the legacy data', () => {
    const s = new FakeStorage();
    s.setItem(STORAGE_KEY, JSON.stringify(legacy));
    s.failWhen = () => true;
    const loaded = loadProjects(s, 1);
    expect(loaded.persisted).toBe(false);
    expect(loaded.design.angle).toBe(45);
    expect(s.length).toBe(1);
  });
});
