# Plan: Share by link + multiple projects

Status: draft, awaiting user approval. Owner: architect. Date: 2026-10-23.
Builds on `floor-visualizer.md`, `custom-room-shape.md` and `wall-colouring.md`. Their decisions still apply unless this plan replaces them.

## Goal

A user keeps several designs ("projects") in the browser. They can create, rename, switch, duplicate and delete them, and Undo a delete. The current v3 design becomes the first project. Any project can be shared as a link that carries the whole design in the URL hash, so no server sees it. On a phone, Share opens the native share sheet. On desktop, Share copies the link and shows a toast. Opening a shared link asks first, then adds the design as a new project. It never overwrites one of the user's own projects.

**Done when:**
- Projects can be created, renamed, switched, duplicated and deleted, with Undo after a delete. They survive a reload. The active project autosaves.
- An existing v3 (or v2 or v1) design shows up as the first project, unchanged.
- Share gives a link for the active project. Opening that link in a fresh browser shows a confirm. Accepting adds a new project that looks the same: room, plan, doors and windows, every colour and every floor setting. Declining changes nothing. In both cases the hash is removed from the URL.
- A broken, tampered or oversized link never crashes the app and never touches stored projects.
- axe reports 0 issues and WCAG AA holds for every new UI.
- `npm run test:ci`, `npm run build:pages` and `npm run format:check` pass. The landing page bundle stays free of designer code.

## Decisions

### P1. Storage layout: an index plus one key per project
- `parket.projects.v1` holds the index: `{ activeId: string, projects: ProjectMeta[] }`.
- `ProjectMeta = { id: string, name: string, createdAt: number, updatedAt: number }`. The array order is the display order (most recently created last), and the UI sorts by `updatedAt`.
- `parket.project.<id>` holds each project's `Design` as JSON (the same shape as v3).
- **Why not one key:** autosave then rewrites only the active design (a few KB), not every project. One corrupt entry cannot take the others down, and a quota failure hits one write instead of everything.
- Ids are `p` plus 8 random base36 characters from `crypto.getRandomValues`, re-rolled on a collision. They are checked against `/^p[0-9a-z]{8}$/` when read.
- **Reading is hostile-input safe:**
  - `sanitizeIndex` caps the list at 50 entries and drops bad ids, duplicates and bad metadata.
  - Names are trimmed, stripped of control characters and cut to 40 characters. An empty name becomes "Project N".
  - If an entry's key is missing, the entry is dropped. If a key holds unparseable JSON, the project loads as defaults (`sanitizeDesign` semantics).
  - If `activeId` is unknown, the most recently updated project becomes active.
  - Keys named `parket.project.*` that are not in the index are removed at startup (orphans).
- **Limit:** at most 50 projects (`MAX_PROJECTS`). New and Duplicate are disabled at the limit, with a hint.

### P2. Migration (once, on startup, when there is no index)
- Load the legacy design as today: v3, then v2, then v1. If one exists, write it as project 1, named "My room", then write the index.
- With no legacy data, create "Project 1" from the defaults. There is always at least one project.
- The legacy keys are left in place, read-only and never written again. This allows a rollback. Removing them is a later clean-up.
- If storage is unavailable (private mode, blocked), the app runs on one in-memory project. Project actions still work in memory, and a one-time toast says "Projects can't be saved in this browser."

### P3. Quota and write failures
- Every write is a `try` around `setItem`. Write the project key first, then the index. If the index write fails, remove the new key again, so nothing is left half-written.
- If autosave fails, show one error toast ("Storage is full. Delete a project to keep saving.") and set `saveError`. Don't repeat the toast until a write succeeds again. The in-memory design is kept.
- Create, duplicate and accepting a shared link check the write result. On failure they change nothing and show the same toast.

### P4. Autosave and the active project
- `DesignState` keeps its signal, setters, 300 ms debounce and `pagehide`/`visibilitychange` flush. It now writes `parket.project.<activeId>` instead of `parket.design.v3`.
- Each flush also bumps the project's `updatedAt` in the index, at most once per flush.
- New method `DesignState.open(id, design)`. It flushes the current project first, then replaces the design, clears the undo buffer and sets the active id. Every project switch goes through this method.
- **Services, with no injection cycle:**
  - `ProjectIndex` (root): the index signal and its I/O. `DesignState` injects it.
  - `Projects` (root): orchestration for create, rename, switch, duplicate, delete with undo, and add-from-share. It injects `DesignState` and `ProjectIndex`.
  - `state/project-storage.ts`: pure, Angular-free functions for read, write, sanitize and migrate over a `Storage`.
- **Multi-tab:** a `storage` event on the index key refreshes the project list. The active design is not reloaded, and the last write wins (see Risks).

### P5. Project operations and naming
- **New:** creates a project from the defaults, named "Project N" (the smallest unused N), and switches to it.
- **Duplicate:** copies the active project or a chosen one, named "<name> copy", then "<name> copy 2" and so on. It switches to the copy.
- **Rename:** an inline text field in the Projects dialog, 1-40 characters. Enter or blur saves, Escape cancels, and an empty value reverts. Duplicate names are allowed.
- **Shared:** the name comes from the payload, or "Shared design" when there is none. If the name is taken, " 2", " 3" and so on is added.
- **Delete:**
  - It removes the key and the index entry at once, which frees the quota.
  - It keeps `{ meta, design, index position, wasActive }` in memory and shows a toast "Deleted “Kitchen”." with an Undo action (8 s, pauses on hover and focus).
  - Undo writes the project back and makes it active again if it was active.
  - Deleting the active project switches to the most recently updated other project. Deleting the last project creates a fresh "Project 1".
  - A newer delete makes the older one final. So does closing the tab.

### P6. Reset and Undo per project
- Reset and its Undo act on the active project only. Their meaning is unchanged: defaults, keep the plan, strip the plan's colours.
- Switching projects clears the reset undo buffer. The existing `keepWhile: canUndo` already dismisses that toast.
- The delete Undo is separate. It lives in `Projects` and is not part of the `DesignState` buffer.

### P7. URL payload format
- **Link:** `<baseURI>#s=1.<data>`, which on Pages is `https://aivaraszks.github.io/parket/#s=1.<data>`.
  - It points to the site root, so GitHub Pages answers 200 and does not fall back to `404.html`. That matters for link previews in chat apps.
  - The fragment is never sent to the server.
- `1` is the payload version. A decoder rejects any version it does not know, with a "made with a newer version" message.
- `<data>` is `base64url(deflate-raw(utf8(JSON)))` with no padding. The JSON is `{ "n": name, "d": Design }`.
  - The full sanitized design is sent. Deflate removes the repeated keys well, so no custom compact schema is needed.
  - Fields are not stripped when they equal the defaults, because defaults may change between versions.
- **Compression:** the browser's `CompressionStream` and `DecompressionStream` (`'deflate-raw'`). They are Baseline since 2023, so no dependency is needed. base64url is a small own helper, not `Uint8Array.toBase64`, which is too new.
- **Size:**
  - Worst case: 32 corners, 32 openings and every colour set. That is about 7.5 KB of JSON, about 2.5 KB after deflate, and about 3.3 KB once encoded.
  - The encoder refuses anything over `MAX_LINK_CHARS = 8000`. A test proves the worst-case fixture fits.
  - If the limit is ever hit, Share shows an error toast ("This design is too big to share as a link.") instead of producing a link that would be cut off.
- **Decoding treats everything as hostile:**
  - Reject `<data>` over 16 000 characters, or with characters outside the base64url set, before decoding.
  - Decompress as a stream and abort past 64 KB of output. This guards against a zip bomb.
  - Use `JSON.parse` in a `try`. The design goes through `sanitizeDesign` (and so through `sanitizePlan`), and the name through the P1 name sanitizer.
  - The result is `{ ok: true, name, design } | { ok: false, reason: 'invalid' | 'too-large' | 'newer-version' | 'unsupported' }`.
- **Contract (`share/share-codec.ts`, pure, no Angular):**
  ```ts
  encodeShare(design: Design, name: string): Promise<string>       // the "1.<data>" part, or throws ShareTooLarge
  decodeShare(fragment: string): Promise<DecodeResult>               // the input is whatever follows "#s="
  shareUrl(baseUri: string, token: string): string
  ```

### P8. Share and incoming links
- **`ShareLink` service (`share/share-link.ts`):**
  - `share()` encodes the active design and project name.
  - On a coarse pointer (`matchMedia('(pointer: coarse)')`), when `navigator.share` exists and `canShare({ url })` is true, it calls `navigator.share({ title: 'Parket: <name>', url })`. An `AbortError` (the user cancelled) is silent.
  - Otherwise it calls `navigator.clipboard.writeText(url)` and shows the toast "Link copied."
  - If the clipboard fails, it opens a small dialog with the link in a read-only, pre-selected text field and a Close button. This follows the `image-dialog` fallback pattern.
- **Incoming:**
  - The landing route (`''`) gets a `shareLinkRedirect` guard. When the fragment starts with `s=`, it redirects to `/designer` and keeps the fragment. The guard has no designer imports, so the landing bundle is unchanged.
  - On init, the designer reads `document.location.hash` itself, not the router fragment, so the link works on any path. It decodes and then asks with an alertdialog:
    - title: "Open shared design?";
    - body: name, room type and floor area, plus "It will be added as a new project. Your projects stay as they are.";
    - buttons: [Add as new project] [Cancel]. Focus starts on Cancel.
  - Accept calls `Projects.addShared(name, design)`, which flushes, creates and switches. A toast follows: "Added “<name>”."
  - After either answer, or after a decode error (error toast "This link is broken or incomplete." or the newer-version copy), the hash is removed with `history.replaceState`, keeping the path and query. Reloading then does nothing.
  - While the plan editor route is open, the prompt waits until the editor closes.

### P9. UI entry points
- **View toolbar, left, after the back link:** a "Projects" chip that shows the active project name (ellipsis, `aria-label="Projects, current: <name>"`). It opens the Projects dialog.
- **View toolbar, next to Save image:** a "Share" chip. On narrow widths it is icon-only with `aria-label="Share link"`.
- **Projects dialog:** a modal sheet on phones and a centred dialog on desktop. It has:
  - a heading;
  - a "New project" button;
  - a list (`ul`) of projects. Each row has the name, "Edited <date>" and a current marker (`aria-current="true"`). Activating the row opens the project and closes the dialog.
  - a per-row "More" menu with Rename, Duplicate, Share (active row only, or any row, see Q3) and Delete.
  - The dialog follows the `colour-confirm-dialog` focus pattern: focus trap, Escape closes, focus returns to the opener.
  - The UX spec owns the exact layout and copy.
- **Landing page:** unchanged in this iteration (see Q1).

### P10. Accessibility
- Every dialog uses `role="dialog"` or `alertdialog`, `aria-modal`, a label and a description. The page behind it is `inert`. Focus is trapped and returned to the opener, and the initial focus is the safe action.
- The Rename field has a visible label (or `aria-label`) and announces errors through `aria-describedby`.
- Project switch, copy, add and delete are announced through the existing toasts (polite; errors assertive). The delete Undo is reachable by keyboard and the toast pauses on focus (WCAG 2.2.1).
- Rows and menus are real buttons. Targets are at least 24×24 CSS px (44 preferred on touch). Text contrast is 4.5:1 and UI borders and state indicators are 3:1. Every action works without the 3D view.
- axe must report 0 issues for the toolbar, the Projects dialog with its open menu and rename field, the Share fallback dialog and the shared-link prompt.

## Tasks

Owners: `ux` = ux-expert, `designer`, `frontend` A/B/C = up to three frontend-dev instances in parallel, `tester`, `review` = code-reviewer.

**File ownership:**
- Track A owns `state/*`.
- Track B owns `share/*` and `app.routes.ts`.
- Track C owns `ui/*` and `designer.ts|html|scss`.

The task 3 contract files are frozen after task 3. Changes go through the main session.

### Phase 1: Spec + contracts (parallel)
1. `ux`: write `docs/ux/share-and-projects.md`. It covers:
   - the Projects dialog layout, row actions and the rename flow;
   - the delete and Undo copy, and the at-limit state;
   - the Share button placement, plus its phone and desktop flows and the clipboard fallback;
   - the shared-link prompt copy and its error states;
   - the storage full and unavailable messages;
   - focus order and screen-reader announcements.

   Done: every P5/P8/P9 action has a touch, mouse and keyboard/SR path, plus copy.
2. `designer` (after a draft of 1): the Projects chip with its truncation, the dialog/sheet and list rows with the current marker, the row menu, and the Share icon. Tokens go into `src/styles.scss` and `docs/design/design-system.md`, with contrast noted. Done: the specs are in the design doc and contrast is documented.
3. `frontend` A, contracts (parallel with 1-2):
   - types and stub signatures in `state/project-storage.ts`, `state/project-index.ts` and `state/projects.ts`;
   - `DesignState.open`;
   - `share/share-codec.ts` (the P7 contract) and the `share/share-link.ts` API.

   Done: the app compiles and the existing tests pass.

### Phase 2: Build (parallel after task 3)
4. `frontend` A, storage and state:
   - `project-storage.ts`: sanitize, migrate, orphan sweep, write order;
   - `ProjectIndex`;
   - `Projects`: all P5 operations and the delete undo;
   - the `DesignState` changes (P4, P6): persist target, `open`, `updatedAt` bump, `saveError`;
   - `design-defaults.ts`: the new keys and `MAX_PROJECTS`.

   Done: the A tests pass.
5. `frontend` B, share:
   - `share-codec.ts`: deflate, base64url, the size caps, sanitize;
   - `share-link.ts`: share sheet, clipboard and the fallback signal;
   - the incoming-link reader with hash clearing;
   - the `shareLinkRedirect` guard in `app.routes.ts`.

   Done: the B tests pass, and the landing chunk does not import `share/*`.
6. `frontend` C, UI:
   - `ui/projects-dialog.ts` with its row menu and rename field;
   - the toolbar Projects and Share chips;
   - `ui/share-fallback-dialog.ts`;
   - `ui/shared-link-dialog.ts`;
   - the designer wiring: the dialogs, `inert`, the incoming-link prompt and waiting for the editor to close.

   Done: matches the UX spec and the component specs pass.

### Phase 3: Verify
7. `tester`:
   - complete the tests below, then run `test:ci`, `build:pages` and `format:check`;
   - manual checks:
     - iOS Safari and Android Chrome: the share sheet, then open the link in another browser;
     - desktop Chrome and Firefox: clipboard;
     - a worst-case plan link;
     - storage full (simulated);
     - private mode;
     - two tabs.

   Done: all green.
8. `review`: check decode hardening (the size caps before any work, no `eval` or HTML injection of names), the write order, that listeners are removed, and the landing bundle size. `ux`: review the built UI. Done: issues fixed and re-tested.

## Tests
- **A (storage/state):**
  - migration: v3, v2 and v1, each becoming "My room"; no legacy data giving "Project 1"; the legacy keys left untouched; running a second time does nothing.
  - index fuzz: not an object, 1000 entries, bad or duplicate ids, huge names, control characters, an unknown `activeId`, a missing project key, corrupt project JSON, orphan keys.
  - a quota error, simulated with a fake `Storage` that throws:
    - a failed autosave shows one toast and keeps the design;
    - create or duplicate leaves no half-written state;
    - an index write failure rolls back the project key.
  - naming: "Project N" fills gaps; "copy" and "copy 2"; shared-name collisions.
  - delete: the active one, the last one, Undo restores both the position and the active state, and a second delete makes the first final.
  - `open` flushes the previous project and clears the reset undo. Reset affects only the active project.
- **B (share):**
  - a round trip: simple and worst-case custom designs come back deep-equal after decoding;
  - the worst case stays under `MAX_LINK_CHARS`;
  - the decoder rejects: an unknown version, bad characters, more than 16 000 characters, a deflate bomb over 64 KB, non-JSON, a JSON array, and a valid JSON object with hostile fields (sanitized result);
  - the guard redirects only with `s=` and keeps the fragment;
  - the hash is cleared on accept, on decline and on error;
  - share picks the share sheet only on a coarse pointer with `canShare`; `AbortError` is silent; a clipboard failure opens the fallback.
- **C (UI):** the dialog's roles, labels and focus trap and return; rename with Enter, Escape and empty; the menu by keyboard; the toasts; an axe check in the component specs where the harness allows it.

## Files

**Create** (under `src/app/designer/` unless noted):
- `state/project-storage.ts`, `state/project-index.ts`, `state/projects.ts` (+specs)
- `share/share-codec.ts`, `share/share-link.ts`, `share/incoming-share.ts` (+specs)
- `src/app/share-redirect.ts` (the guard: tiny, no designer imports) (+spec)
- `ui/projects-dialog.ts|scss`, `ui/project-row-menu.ts`, `ui/share-fallback-dialog.ts`, `ui/shared-link-dialog.ts` (+specs)
- `docs/ux/share-and-projects.md`

**Change:**
- `state/design-state.ts`, `state/design-defaults.ts`, `state/design-migration.spec.ts`, `state/design-state.spec.ts`
- `ui/view-toolbar.ts|html|scss` (+spec)
- `designer.ts|html|scss`
- `src/app/app.routes.ts` (+spec)
- `src/styles.scss`, `docs/design/design-system.md`

## Risks
- **Two tabs on the same project:** the last write wins, and the other tab's edits can be overwritten silently. This is accepted for now. The index refresh keeps the list correct.
- **Link length in chat apps:** about 3.3 KB links work in WhatsApp, Messages and mail, but some SMS and QR uses may truncate them. A truncated link fails to decode and shows the "broken link" message, never corrupt data.
- **`navigator.share` quirks:** iOS needs a user gesture, so encode quickly (well under 1 s) or the gesture expires. Some desktop browsers expose `share` too, which is why the pointer check decides. If iOS rejects the share after the async encode, Track B should pre-encode on pointerdown.
- **Index and project key out of sync** after a crash between writes: handled by the startup sweep and the drop-missing rule.
- **Legacy keys** left in place use a few KB of quota. Remove them in a later release.

## Open questions (recommended default first)
- **Q1. Landing page:** keep it unchanged; projects live only in the designer (recommended, keeps the landing bundle small) / add a "Continue <last project>" link and a project count on the landing page.
- **Q2. Name of the migrated design:** "My room" (recommended) / "Project 1".
- **Q3. Share from the Projects list:** only the active project, from the toolbar (recommended, simplest) / any project from its row menu.
- **Q4. Project limit:** 50 (recommended) / no limit, bounded only by quota.
- **Q5. Deleting the last project:** allowed, a fresh "Project 1" replaces it, with Undo (recommended) / Delete disabled while only one project exists.

## Answers (user, 2026-10-23)

- Plan approved.
- **Q1 Landing:** ADD a "Continue <last project>" button and a project count to the landing page, next to the existing "Design your floor" CTA.
  - The landing chunk must not import designer, three or share code. It reads the project index through a tiny, dependency-free, read-only helper `state/project-summary.ts` (`readProjectSummary(): { activeName: string; count: number } | null`, sanitized, try/catch around storage). Track A writes it with the contracts.
  - Track B owns `src/app/landing/*` for this.
  - "Continue" opens /designer on the active project. With no projects (first visit), only the existing CTA shows.
- **Q2:** the migrated design is named "My room" (default).
- **Q3:** share the active project only, from the toolbar (default).
- **Q4:** limit of 50 projects (default).
- **Q5:** deleting the last project is allowed; it is replaced by a fresh "Project 1", with Undo (default).
- **Q-A (from UX spec):**
  - Once projects exist, "Continue: {name}" is the primary landing pill.
  - "Design your floor" becomes secondary and opens `/designer?new=1`. The designer creates "Project N" on arrival and removes the query, so a reload doesn't create another. Track C wires `?new=1`.
- **Q-B:** `readProjectSummary()` also reads the legacy v3/v2/v1 keys, so an old user sees "Continue: My room" and "1 project". Track A.
