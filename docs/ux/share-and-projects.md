# UX spec: Projects, Share by link, Continue on the landing page

Plan: `docs/plans/share-and-projects.md` (P5, P8, P9, P10, answers Q1-Q5). Builds on `docs/ux/floor-visualizer.md` (view toolbar, toasts, dialogs) and `docs/ux/wall-colouring.md` (alertdialog and focus pattern from `colour-confirm-dialog`). Visual styling is the designer's job.

## Users and goal

Home owners who try several rooms or options (kitchen, hall, "with dark oak") and want to keep them, and who want to send a design to a partner or fitter. Mostly on a phone.

Principles: one tap to switch; no Save buttons (autosave); delete has Undo instead of a confirm; a shared link never overwrites anything; every action works with touch, mouse and keyboard.

## User flows

1. **Switch project.** Toolbar "Projects" chip, tap a row. The dialog closes, the design changes.
2. **New project.** Projects dialog, "New project". Opens a fresh "Project N" and closes the dialog.
3. **Rename.** Row "More", Rename, type, Enter. The dialog stays open.
4. **Duplicate.** Row "More", Duplicate. Opens "<name> copy" and closes the dialog.
5. **Delete.** Row "More", Delete. No confirm. The dialog closes, toast "Deleted “Kitchen”." with Undo (8 s).
6. **Share, phone.** Tap Share. The native share sheet opens with the link. Cancel is silent.
7. **Share, desktop.** Click Share. Link copied, toast "Link copied." If the clipboard is blocked, a small dialog shows the link to copy by hand.
8. **Open a shared link.** Link opens `/designer`, a prompt asks, Add or Cancel. Either way the `#s=...` part disappears from the address bar.
9. **Landing, returning user.** "Continue" opens the designer on the last active project.

## Screens

### 1. View toolbar (changes)

- **Projects chip**, left, right after the Back link. Folder/stack icon + active project name + small chevron-down. Name truncates with an ellipsis (max about 12 characters on phones, about 20 on desktop). `aria-label="Projects, current: Kitchen"`, `aria-haspopup="dialog"`. Opens the Projects dialog.
- **Share chip**, right, before Save image (Save stays the primary, last). Icon + "Share" on desktop. Icon-only below 900 px, `aria-label="Share link"`.
- Phone fit (360 px): Back becomes icon-only below 440 px (its `aria-label` stays "Back to Parket home"), so the row is `[<] [Kitchen v] ... [Views] [?] [Share] [Save]`. If it still does not fit at 320 px, the Projects chip goes icon-only (name stays in the `aria-label`). The designer checks this.
- Share is `aria-disabled` while a link is being made (`aria-busy="true"`, under 1 s). Not disabled when 3D is unavailable (it does not need 3D).

```
Desktop: [<] Parket [Kitchen v]    [Corner][Doorway][Top-down][-][+] [Colour] [Views] [?] [Share] [Save image]
Phone:   [<] [Kitchen v]                                       [Views] [?] [Share] [Save]
```

### 2. Projects dialog

Purpose: pick, create, rename, duplicate or delete projects. Modal sheet from the bottom on phones (max 80 dvh, list scrolls), centred dialog (about 420 px) on desktop. `role="dialog"`, `aria-modal`, label "Projects".

```
+--------------------------------------+
| Projects                         [X] |
| 3 of 50 projects                     |
| [ + New project ]                    |
|--------------------------------------|
| (v) Kitchen                  [ ... ] |
|     Edited today  - Current          |
| ( ) My room                  [ ... ] |
|     Edited 3 Oct                     |
| ( ) Project 3                [ ... ] |
|     Edited 28 Sep                    |
+--------------------------------------+
```

- Hierarchy: heading and Close, count line, New project, list.
- List is a `ul`. Each `li` has two real buttons: the **row button** (name, "Edited ..." line, and for the current row a check mark plus the word "Current", not colour alone) and **More** (icon "..." , `aria-label="More actions for Kitchen"`, `aria-haspopup="true"`, `aria-expanded`). The current row has `aria-current="true"` on its row button.
- Row button: opens that project and closes the dialog. On the current row it just closes.
- Order: most recently edited first, computed once when the dialog opens. Rows do not jump while it is open (renaming or switching does not reorder until the next open).
- Long names truncate with an ellipsis (one line); the full name is in the `aria-label`.
- Date line: "Edited today", "Edited yesterday", "Edited 3 Oct" (add the year if not this year).
- Close: X button, Escape, or tapping the scrim. Nothing is lost by closing.
- Targets: row and More are at least `--target-min` high; More is at least 35 px wide on phones (44 px preferred when space allows).

#### At the limit (50)

Count line reads "50 of 50 projects". New project and Duplicate are `aria-disabled="true"` (stay focusable) with the hint under the button: "Limit reached. Delete a project to add more." The hint is linked with `aria-describedby`. Activating a disabled New project does nothing.

### 3. Row menu

A small popover under More (same pattern as the Views popover: `role="group"`, items are buttons).

```
 Rename
 Duplicate
 Delete
```

- Delete uses the error/danger text colour plus the word (not colour alone). Duplicate is disabled at the limit (same hint shown in the menu item sub-text: "Limit reached").
- `role="menu"` with `role="menuitem"` items, rendered inside the dialog element (fixed-positioned, below More or above it, never above the list so it cannot cover Close or New project); More has `aria-haspopup="menu"` and `aria-controls` while open. Opens with focus on the first item. Arrow Up/Down move between items, Tab closes the menu and moves on from the More button (Shift+Tab moves back from it), Escape closes the menu only and returns focus to More. Tapping outside closes it.
- Actions:
  - **Rename** replaces the name in that row with a text field (screen 4). The menu closes.
  - **Duplicate** creates "<name> copy" (then "copy 2" ...), switches to it, closes the dialog, toast "Duplicated as “Kitchen copy”."
  - **Delete** removes the project, closes the dialog, shows the Undo toast (screen 5).

### 4. Rename (inline)

```
 [ Kitchen________________ ]      <- text field in the row, text selected
   1 to 40 characters
```

- Field: `aria-label="Project name"`, `maxlength="40"`, `enterkeyhint="done"`, font 16 px (no iOS zoom). Focus lands in it with all text selected. The helper line "1 to 40 characters" is linked with `aria-describedby`.
- Enter or leaving the field (blur) saves. Escape cancels and keeps the old name. An empty or whitespace-only value reverts to the old name (no error message, silent revert; the live region says "Name unchanged.").
- After save or cancel, focus returns to that row's More button. The dialog stays open.
- Duplicate names are allowed. Control characters are stripped by the store, not shown as an error.
- Live region: "Renamed to Kitchen 2."

### 5. Delete and Undo

- Delete is immediate; no "Are you sure". Undo covers mistakes (the plan's decision).
- Toast: "Deleted “Kitchen”." with **Undo**. 8 s, pauses on hover and focus (existing `Toasts`). A new toast of any kind replaces it, which makes the delete final (same rule as plan P5).
- Undo restores the project in its old list position, and makes it active again if it was.
- Deleting the active project opens the most recently edited other project. Toast text is the same; the Projects chip shows the new name and the live region says "Deleted Kitchen. Opened My room."
- Deleting the last project: a fresh "Project 1" opens. Toast: "Deleted “Kitchen”. Started a new project." with Undo.
- After the dialog closes, focus returns to the Projects chip.
- Reset has its own Undo (unchanged). Switching project dismisses the Reset toast (existing `keepWhile`).

### 6. Share flows

**Phone (coarse pointer and the browser supports sharing).** Tap Share, the native sheet opens with title "Parket: Kitchen" and the link. User picks an app or cancels. Cancel is silent. No toast on success (the OS shows its own feedback).

**Desktop (or anything else).** Click Share. The link is copied. Toast "Link copied." (polite, 4 s). Focus stays on Share.

**Clipboard blocked.** The share fallback dialog (screen 7).

**Too big.** Error toast "This design is too big to share as a link."

**Offline/other failure.** There is no network step; the only failures are the ones above.

### 7. Share fallback dialog

`role="dialog"`, `aria-modal`, same pattern as `image-dialog`.

```
+------------------------------------+
| Copy link                          |
| Copy this link to share Kitchen.   |
| Share link                         |
| [ https://aivaraszks.github.io/... ]|
|                           [Close]  |
+------------------------------------+
```

- Read-only text field with a visible label "Share link". Focus starts in the field with the text selected, so Ctrl/Cmd+C or long-press works. Tab goes to Close. Escape or Close returns focus to Share.
- Phone: field is one line, scrolls sideways; long-press selects.

### 8. Shared-link prompt

Shown on the designer after a link opens. `role="alertdialog"`, `aria-modal`, labelled by the title, described by the body. Focus starts on **Cancel**. Page behind is `inert`. If the plan editor is open, the prompt waits until it closes.

```
+------------------------------------+
| Open shared design?                |
| “Kitchen”, custom shape, 14 m².    |
| It will be added as a new project. |
| Your projects stay as they are.    |
|              [Cancel] [Add project]|
+------------------------------------+
```

- Name, room type ("Simple room" / "Custom shape") and area use the app's existing area format. The name is plain text only.
- **Add as new project**: flushes the current project, adds the design, opens it, toast "Added “Kitchen”." The hash is removed.
- **Cancel / Escape / scrim**: nothing changes, the hash is removed, you land on your current project. No toast.
- At the limit (50): body adds "You have 50 projects. Delete one to add this design." The Add button is `aria-disabled`; Cancel is the only action.
- Storage full or unavailable: Add shows the storage error toast (screen 9) and the project is not added.
- On a first visit with no projects, the design is added as the user's only project (named from the link) and the prompt is the same.

#### Link errors

No dialog; one error toast (assertive), the hash is removed, the app opens normally.

| Cause | Copy |
| --- | --- |
| Broken, tampered, too long, unknown format | "This link is broken or incomplete." |
| Made by a newer version | "This link was made with a newer version of Parket. Reload to update." |

### 9. Storage messages

| Case | Where | Copy |
| --- | --- | --- |
| Storage unavailable (private mode, blocked) | Toast, once per page load, status | "Projects can't be saved in this browser." |
| Autosave fails (quota) | Error toast, once until a write works again | "Storage is full. Delete a project to keep saving." |
| New, Duplicate or Add fails to save | Same error toast; nothing changes | "Storage is full. Delete a project to keep saving." |

Keep working on the in-memory design in all cases. No blocking dialog.

### 10. Landing page: Continue and project count

Applies only when `readProjectSummary()` returns a result. Read synchronously when the page is created, so there is no flash and no layout shift.

**First visit / no data (null):** unchanged. Only the "Design your floor" pill shows. No count, no empty message.

**Returning (summary exists):**

```
        HERRINGBONE, IN 3D                (kicker, unchanged)
   [ Continue: Kitchen ]                  (primary pill)
   [ Design your floor ]                  (secondary pill, see Q-A)
      3 projects on this device           (muted line)
```

- **Placement:** inside the existing `.cta` block, under the kicker, so both buttons share its entrance (`cta-in` after `--delay-cta`, shown at once by any tap/key or by focus-within, and shown at once under reduced motion). No new animation and no new delay. DOM order is Continue, then Design your floor, then the count, so Continue is the first Tab stop.
- **Layout:** pills stack on phones, 8-12 px apart and the same width (the wider of the two). From about 560 px wide they sit side by side. In short landscape (max-height 480 px, kicker hidden) they sit side by side and the count line is hidden to keep the CTA on screen. The `.cta` offset must reserve the extra height (about one pill plus one line) so nothing is pushed off the bottom at 360x640. The designer adjusts the `top` clamp.
- **Continue** is a link (`<a routerLink="/designer">`). Visible text "Continue: Kitchen"; the name part truncates with an ellipsis at about 18 characters, the accessible name is the full visible text ("Continue: Kitchen"). It opens the designer on the active project (no query).
- **Count line:** "1 project on this device" / "3 projects on this device". Text, `aria-hidden="false"`, part of the `.cta` block (read after the links). Contrast on the floor: same treatment as the kicker (white, text shadow, at least 4.5:1 over the veil; the designer verifies).
- The project name is user text: render as text only, never HTML.
- Landing stays free of designer code: it uses only `readProjectSummary()`, which never throws (null on any storage problem, corrupt data, or an empty list).
- Edge: a user with only legacy data (v1-v3, no index yet) should show "Continue: My room", "1 project on this device". Track A: `readProjectSummary()` should check the legacy keys when there is no index.

## States

| State | Behaviour |
| --- | --- |
| Projects dialog, normal | As screen 2. |
| One project only | Delete still works (fresh "Project 1" replaces it, with Undo). |
| At limit | New and Duplicate `aria-disabled` with hint; shared-link Add `aria-disabled`. |
| Rename in progress | Only that row shows the field; other rows stay usable; Escape cancels the rename first, then the menu, then the dialog. |
| Menu open | Escape closes the menu only. |
| Loading | There is none for projects (local, instant). Share shows `aria-busy` on the chip for under 1 s. |
| Storage unavailable | App works in memory; projects still switch; one-time toast; chip shows names as normal. |
| Autosave failing | One error toast. No persistent indicator in v1 (nice to have: a small warning mark on the Projects chip). |
| Two tabs | The list refreshes when the other tab changes it; if the current project vanished from the list, no action until the next write (accepted risk in the plan). |
| 3D unavailable | Projects and Share work unchanged. |
| Plan editor open | Designer is inert. Toolbar not reachable; incoming-link prompt waits. |
| Reduced motion | Dialog and sheet appear without slide or fade. |
| Permissions | None. Clipboard is used from a user gesture; a refusal opens the fallback dialog. |

## Copy

Short, sentence case, "project" everywhere (not "design" or "file"), curly quotes around names.

| Where | Text |
| --- | --- |
| Toolbar chip | name; `aria-label` "Projects, current: {name}" |
| Share chip | "Share"; icon-only `aria-label` "Share link" |
| Dialog title / close | "Projects" / `aria-label` "Close" |
| Count | "{n} of 50 projects" |
| New button | "New project" |
| Row line | "Edited today" / "Edited yesterday" / "Edited 3 Oct"; current: "Current" |
| More | `aria-label` "More actions for {name}" |
| Menu | "Rename", "Duplicate", "Delete" |
| Rename | label "Project name", helper "1 to 40 characters" |
| Limit hint | "Limit reached. Delete a project to add more." |
| Toasts | "Created “Project 3”." / "Duplicated as “Kitchen copy”." / "Deleted “Kitchen”." + "Undo" / "Link copied." / "Added “Kitchen”." |
| Delete last | "Deleted “Kitchen”. Started a new project." + "Undo" |
| Share errors | "This design is too big to share as a link." |
| Fallback dialog | "Copy link" / "Copy this link to share {name}." / label "Share link" / "Close" |
| Prompt | "Open shared design?" / body in screen 8 / "Cancel" / "Add as new project" |
| Prompt at limit | "You have 50 projects. Delete one to add this design." |
| Link errors | see screen 8 |
| Storage | see screen 9 |
| Landing | "Continue: {name}" / "Design your floor" / "{n} project(s) on this device" |

Live region (polite, the existing shell announcer; errors assertive via the toast host):
- "Opened Kitchen." (switch, new, duplicate, undo of a delete)
- "Renamed to Kitchen 2." / "Name unchanged."
- "Deleted Kitchen." (plus "Opened My room." if the active project changed)
- "Added Kitchen." / "Link copied."

## Accessibility

Every action has three paths:

| Action | Touch | Mouse | Keyboard / screen reader |
| --- | --- | --- | --- |
| Open Projects | Tap chip | Click chip | Tab to chip, Enter/Space |
| Switch project | Tap row | Click row | Tab/Shift+Tab through rows, Enter/Space |
| New project | Tap button | Click | Tab, Enter |
| Row menu | Tap More | Click More | Tab to More, Enter; Up/Down in menu; Escape closes |
| Rename | Menu, Rename, type, keyboard Done | Same, Enter | Menu, Rename, type, Enter saves, Escape cancels |
| Duplicate | Menu | Menu | Menu |
| Delete and Undo | Menu, then toast Undo | Same | Menu; after Delete, focus is put on the toast's Undo button (falls back to the Projects chip); toast pauses on focus |
| Share | Tap Share (sheet) | Click (copy) | Tab, Enter; fallback field is selectable |
| Add shared design | Tap button | Click | Focus on Cancel; Tab to Add; Escape cancels |
| Continue | Tap | Click | Tab (first stop in the CTA), Enter |

- **Dialogs** (Projects, fallback, prompt): `role="dialog"` (prompt: `alertdialog`), `aria-modal="true"`, `aria-labelledby` the title, `aria-describedby` the body where there is one. Page behind (`main`, sheet, toolbar, toast host) is `inert` while open, as the colour confirm does. Focus is trapped (document-level Tab, Escape and focusin, same as `colour-confirm-dialog`).
- **Initial focus:** Projects dialog on the current row's button (so the user sees where they are; scrolled into view); fallback dialog on the link field; prompt on Cancel.
- **Return focus:** to the opener (Projects chip, Share chip). After a switch/new/duplicate/delete, to the Projects chip (it still exists, and now shows the new name). After the prompt, to the document body's first sensible stop (the Projects chip).
- **Escape order:** rename, then row menu, then dialog. Escape never closes the bottom sheet underneath.
- **Names:** the row button has no `aria-label`; its visible text ("Kitchen Edited today · Current", real spaces between the parts) is the name, so it matches the label. The current marker is also `aria-current="true"`.
- **Toasts:** status are polite, errors assertive (existing). Undo toast pauses on hover and focus (WCAG 2.2.1).
- **Touch/pointer:** targets at least 24x24 CSS px, with the compact phone scale at least 35 px (`--target-min`); keep at least 8 px between row button and More. Text fields stay 16 px.
- **Contrast:** text 4.5:1, borders, the check mark and focus rings 3:1. The current marker and Delete are not shown by colour alone. Landing count and Continue text need 4.5:1 on the floor image (use the kicker's veil and shadow; designer verifies at the pill and the muted line).
- **Reflow/zoom:** the sheet scrolls at 320 px wide and 200 percent zoom; nothing is clipped by the toolbar (chip truncation, never wrapping the bar to a second line unless the designer decides so).
- **No 3D needed:** all project and share actions work without WebGL.
- axe targets: toolbar, Projects dialog with menu and rename field open, fallback dialog, prompt, landing with Continue.

## Questions

- **Q-A. Where does "Design your floor" go once the user has projects?** Today it opens the active project, which is the same place as Continue, so two buttons would do the same thing. Options:
  - (Recommended) With projects, "Continue: {name}" is the primary pill and "Design your floor" becomes a secondary pill that opens `/designer?new=1`. The designer creates a "Project N" on arrival and removes the query, so reload does not create another. Costs one small routing change (Track C).
  - Keep both going to `/designer` (no routing change, but redundant).
  - Show only Continue plus the count when projects exist, and no "Design your floor".
- **Q-B. Legacy-only users on the landing page.** Show "Continue: My room, 1 project" from the legacy keys before the designer has migrated (recommended) / show nothing until they open the designer once.

## Answers (user, 2026-10-23)

- Q-A: recommended. Continue is primary, and "Design your floor" opens `/designer?new=1` to start a new project.
- Q-B: recommended. Legacy data shows as "Continue: My room", "1 project".

## Review (built UI)

Reviewed 2026-10-23 by reading code (no browser run): `projects-dialog.*`, `share-fallback-dialog.ts`, `shared-link-dialog.ts`, `dialog-focus.ts`, `view-toolbar.*`, `designer.ts/html`, `share/*`, `state/projects.ts`, `landing/*`. Toolbar layout is not judged (dock redesign pending). Overall the build follows the spec closely: copy matches, focus start/return, Escape order, inert page, limit hints, landing order and truncation are all in place. Nothing below needs a rewrite.

### Must

All items below are **Fixed** (2026-10-23) unless noted.

1. **Undo after Delete is not reachable by keyboard in time.** `projects-dialog.ts` `remove()` closes the dialog and `dialog-focus.ts` `restoreFocus` puts focus on the Projects chip. The toast host is after the toolbar and the whole controls sheet in DOM order (`designer.html`), so a keyboard or switch user must Tab through dozens of stops inside 8 s (the pause only starts once focus is inside the toast). The spec claim "Undo is the next Tab stop" is false as built, and delete has no confirm, so Undo is the only recovery (WCAG 2.1.1, 2.2.1). Fix: in `remove()` pass a different focus target to the destroy hook (for example a `restoreTarget` field set to `'.toast .action'`), and fall back to the chip when no Undo exists or after it is used or dismissed. Focus on Undo also pauses the countdown. Also move focus to the chip after Undo runs (see 5), because the focused button is removed. **Fixed: focus goes to the toast's Undo (fallback chip).**

### Should

2. **Toast host is `inert` while any dialog is open, so errors raised from a dialog are silent for assistive tech.** `designer.html` sets `[attr.inert]="dialogOpen()"` on `app-toast-host`. Cases: storage-full from New, Duplicate, rename (dialog stays open), and Add in the shared prompt (`incoming-share.ts` `accept()` returns and the prompt stays open). The `role="alert"` region is inert at insertion, so nothing is announced and focus-less users get no news. Fix: add an `announcer.say(...)` with the same text on every `storageFull()` path (`projects.ts` `storageFull()`, `addShared` limit message) or stop inerting the toast host and let the dialogs' focus pull-back handle it. Cheapest: `Projects.storageFull()` also calls `ColourAnnouncer.say`. **Fixed: `Projects.say()` also announces storage-full and limit errors.**
3. **Shared prompt stays open with no visible result when saving fails.** `incoming-share.ts` `accept()` on `storage-full` returns without `finish()`. The user taps Add and nothing seems to happen. Spec screen 8: the project is not added and the error toast shows. Fix: on `!result.ok` call `this.finish()` (prompt closes, hash removed, error toast now visible and announced) so a retry is not a dead end. **Fixed: `accept()` calls `finish()` on any refusal.**
4. **Two dialogs can fight over focus.** Each dialog listens to `document:focusin` and pulls focus back to itself (`dialog-focus.ts` `pullFocusBack`). `window:hashchange` calls `incoming.read()` even while the Projects dialog, the share fallback or the colour confirm is open (desktop users can paste a link into the address bar). `sharedPrompt` in `designer.ts` only waits for the editor. Both dialogs then call `focus()` on each other in a loop until the stack overflows. Fix: make `sharedPrompt` return null while `projectsOpen()`, `shareLink.fallbackUrl()` or `confirm.pending()` is set (same rule as the editor), so the prompt appears when the other dialog closes. **Fixed: `sharedPrompt` waits for the Projects dialog, colour confirm, share fallback and image dialog.**
5. **Undo restores silently.** `projects.ts` `restore()` gives no feedback (spec live region: "Opened Kitchen."). Fix: call `ColourAnnouncer.say('Restored ' + meta.name + '.')` plus "Opened ..." when `wasActive`, and refocus `[data-trigger="projects"]` (the Undo button that had focus is destroyed, so focus falls to `body`). **Fixed: announces "Restored X." (+ "Opened X.") and refocuses the chip.**
6. **Landing, new-project route at the limit.** `designer.ts` `startNewProject()` shows "Limit reached. Delete a project to add more." as a plain status toast after "Design your floor". The user asked for a new project and silently lands on an old one. Fix: use an error toast and name the result: "Limit reached. Opened “Kitchen”. Delete a project to add more." (use the active name from `index`). **Fixed: error toast naming the opened project, also announced.**
7. **"Design your floor" always creates a project, even when the active one is untouched.** Repeated taps on the landing page fill the list with empty "Project N" rows (50 cap reached quickly, junk in the dialog). Fix: if the active project equals the defaults (compare the snapshot to `cloneDefaults()` and name `Project N`), skip `create()` and just open it; otherwise create. Keep the `?new` clean-up as is. Needs a one-line product OK, since Q-A said "starts a new project". **Fixed: an untouched "Project N" is reused (user approved). Undo of delete-last also drops an untouched fresh "Project 1".**
8. **Escape/Tab inside the row menu.** `projects-dialog.ts` `onKey()` sends Tab from the menu back to the More button; spec says Tab "closes the menu and moves on". Moving back is acceptable and predictable, but it means Shift+Tab from the first item also lands on More, so the menu is a small focus trap. Fix: leave as is, or on Tab close the menu and let the default action run after focusing More (call `closeMenu(true)` without `preventDefault` and focus synchronously). Low risk; pick one and note it in the spec. **Fixed: Tab closes the menu and moves on; spec updated.**

### Nit

9. `projects-dialog.html`: More has `aria-haspopup="true"` (announced as "menu") but the popup is `role="group"` of buttons. Either drop `aria-haspopup` and keep `aria-expanded`, or give the popup `role="menu"` / `role="menuitem"` and arrow-key semantics (already built). Prefer dropping it, as the Views popover does. **Fixed: popup is `role=menu`/`menuitem`, More has `aria-haspopup="menu"`.**
10. `projects-dialog.html`: add `aria-controls` on More pointing at the menu `id` while it is open. **Fixed.**
11. `projects-dialog.ts` `create()` and `duplicate()` at the limit return silently (the hint is only visible text). Fix: also `announcer.say('Limit reached. Delete a project to add more.')` so a screen-reader user who activates the `aria-disabled` button hears why. **Fixed.**
12. `projects-dialog.html` rename: Escape announces nothing; fine, but Enter on an unchanged name says "Name unchanged." Consider saying nothing for the unchanged case to cut chatter. **Fixed: nothing is said for an unchanged non-empty name.**
13. `view-toolbar.scss` (carry over to the dock): the Projects chip name is hidden below 360 px, and at exactly 360 px the flex shrink can leave 1 to 2 characters ("K..."). When the dock is built, verify at 320/360/390 px and show icon plus chevron only below a width where fewer than about 5 characters fit. **Open: carry over to the dock.**
14. `share-link.ts` `makeUrl()`: the generic failure copy "Couldn't make a link. Try again or use a different browser." and `incoming-share.ts` "This browser can't open shared links." are not in the spec copy table. They read well; add them to the Copy section for consistency. **Not done (copy table left as is).**
15. `landing.html`: Continue has no `title` for a truncated name. The accessible name is full already; adding `[attr.title]` gives mouse users the full name. Optional. **Not done (optional).**
16. `designer.html`: verify in the browser that the toast host z-index sits above the dialog scrim once the inert is changed (2), and run axe on: Projects dialog with menu open and rename field, fallback dialog, prompt, landing with Continue. **Axe re-run on desktop and phone: 0 violations on landing, designer, Projects dialog, row menu, rename, fallback dialog and prompt. Toast z-index above the scrim not changed (toast host stays inert under dialogs; errors are announced instead).**

### Confirmed OK (no action)

Dialog roles, `aria-modal`, labels and descriptions; initial focus (current row, link field, Cancel); return focus to the chip; Escape order rename, menu, dialog; row accessible name pattern; current marker not by colour alone; Delete has icon plus word; limit hints linked with `aria-describedby`; rename field 16 px, maxlength 40, helper linked; list order frozen on open; reduced motion on sheet and dialog; share sheet cancel silent, clipboard failure falls to the dialog (also when `navigator.clipboard` is missing); prompt Cancel/Escape/scrim all clear the hash; landing DOM order Continue, Design your floor, count; count hidden in short landscape; legacy summary path; user text rendered as text.

## Answers to review (user / main session, 2026-10-23)

- Item 7: the user chose "reuse untouched". The landing "Design your floor" (`?new=1`) opens the active project instead of creating a new one when that project is still untouched (defaults, never edited).
- Undo of delete-last: also remove the fresh "Project 1" if it's still untouched, so the list goes back to how it was.

## Fixes after the code review and tester pass (2026-10-23)

- Row accessible name mismatch (axe label-content-name-mismatch): row `aria-label` dropped, visible text is the name.
- Row menu axe `region` violation: menu now inside the dialog element; flips above or is clamped so it cannot cover Close or New project.
- A share hash set while the designer is open (hashchange) is cleared for valid and broken links: after the router's own navigation settles, it is reset without the fragment.
- Switching, New, Duplicate and Undo refuse (storage-full toast) while the open project has unsaved edits, instead of dropping them.
