# UI/UX review and proposal: the controlling interface

Status: proposal, for the user's decision. Nothing here is built. The rebuild starts after "share + projects" (`docs/plans/share-and-projects.md`) lands, and this proposal already includes that feature's UI.

Scope (user): all 3D designer controls (sheet, tabs, toolbar, pickers), the plan editor, the colouring flow and the landing page. Same features, free to rethink layout and navigation. Pain points: "the panel covers the 3D view" and "hard to find things". The user is mostly on a phone.

Method and limits: code and spec review of `docs/ux/*`, `docs/design/*`, `src/app/designer/**` and `src/app/landing/**`. **I could not run the app or take screenshots in this session** (no shell tool was available), so there is no screenshot evidence. Numbers below are computed from the CSS tokens (`designer.scss`, `controls-sheet.scss`, `_phone-scale.scss`, `styles.scss`). Items marked "verify" should be checked at 360x640, 390x844 and 1024x768 before the rebuild is specced in detail.

---

## 1. Findings

Severity: **Blocker** = defeats the user's goal or breaks use; **Should** = clear friction; **Nice** = polish.

### Blockers

**F1. The controls and the 3D view fight for the same screen space (the user's main complaint).**
Evidence: `designer.scss` sets `--stage-bottom` to the sheet height, so the canvas is *shrunk* to the area above the sheet; `controls-sheet.scss` has three stops (25% / 50-65% / 85%). Computed on a 360x640 phone: Peek leaves the view 480 px (75%), Half 320 px (50%), Full 96 px (15%). On 390x844: 633 / 422 / 127 px. Half is the stop where a user can actually edit, so while editing, half the screen is gone, and the *floor* (the thing being edited) is exactly the part of the picture that is lowest, nearest the sheet. Dragging the Angle slider hides the pattern the slider changes.
Fix: see section 2 (full-screen canvas, short tray sized to content, "scrub to see" while dragging).

**F2. Things are hard to find because the structure is by data type, not by task, and key controls are hidden in popovers or buried at the bottom.**
Evidence:
- Colour mode on phones is only an item inside the **Views** popover (`view-toolbar.html:107-116`, `.colour-toggle { display: none }` below 900 px). "Views" is a camera menu; nobody looks for colouring in it.
- **Reset design** is the last thing in the Estimate tab (`estimate-tab.ts:55`). A reset action inside a results tab is not where anyone looks.
- **Zoom in/out** and **How to look around (?)** are camera controls spread over two places (Views popover and a separate "?" chip).
- The tab named **Surfaces** holds the colour choices. Users say "colour"; the toolbar says "Colour"; the tab says "Surfaces". Three names for one idea.
- The **Floor** tab has 8 controls (wood grid, pattern line, plank length, width, planks per block, angle, finish) in one long scroll; the two most-used (wood, angle) sit apart from each other, and the three rarely-changed plank-size sliders sit between them.
- **Edit shape** appears in the Room tab and again as a link in the Light tab (`light-tab.ts:43`).

**F3. Two overlapping "modes" for colouring.** After the 2026-10-23 change ("a tap selects while the Surfaces tab is open"), the **Colour mode** toggle, its "Done" button, the Views popover item, the pressed badge and the `colouring.picking` rule all do overlapping jobs. A user can be in Colour mode on the Floor tab, or in the Surfaces tab with Colour mode off, and both can tap-select. This is hard to explain and hard to test (`surfaces-tab.html:3-8`, `view-toolbar.html:49-80`, `view-toolbar.scss:165-214`). The Colour toggle also adds a sixth item to the top bar for a feature that no longer needs a switch.

**F4. The toolbar will not fit once Projects and Share are added.**
Evidence: `view-toolbar.scss` `.bar` is a single non-wrapping flex row of `nowrap` chips. The share spec (`share-and-projects.md`) adds Projects and Share. Phone (360 px): Back + Projects + Views + ? + Share + Save at 35 px targets is about 330 px with gaps, with no room to breathe and none at 320 px. Desktop (computed, **verify**): at 900 px the stage is 900 - 360 = 540 px wide, but the row holds Back (~90), Projects (~150), 3 presets (~240), 2 zoom (~90), Colour (~95), ? (44), Share (~85), Save image (~125) = about 920 px. It overflows below roughly 1300 px window width. Today's toolbar (without Projects/Share) is already about 660 px, so it likely overflows 900-1000 px windows now.

### Should fix

**F5. The "compact 0.8 scale" treats the symptom.** `_phone-scale.scss` shrinks text to 11-13 px (`--text-xs` 0.7rem = 11.2 px, `--text-sm` 12 px) and targets to 35 px (below the 44 px platform advice) to buy back room. The cause is too much in the panel. For the user, the cost is small text, mis-taps and glare-prone grey hints on a phone outdoors or in a shop. Accessibility already flagged 9.6 px text once (`wall-colouring.md` review item 4). Rebuild at 1x and fix the cause.

**F6. Three rows of chrome before the first control.** In the sheet: handle (35 px) + estimate line + tab row = about 100 px of the 220-320 px sheet (`controls-sheet.html:2-16`). At 360x640 Half, about 220 px is left for controls, roughly three slider fields.

**F7. The Peek stop shows a cropped, inert slice of controls.** Peek is 25% (160-210 px) but the chrome is about 100 px, so the remaining space shows the top of the previous tab's content, with `inert` on it (`controls-sheet.html:17`). It looks tappable and is not. (Verify.)

**F8. Three stops and a sheet that jumps.** Peek / Half / Full plus handle-tap-cycles, tab-tap-opens, tab-tap-again-closes, and 3D taps that raise the sheet to Half (colouring). Users must learn the sheet's behaviour; a 3D tap can move the sheet under their finger.

**F9. The Surfaces tab is a long list first, the palette second** (`surfaces-tab.html:9-27`). Up to 32 wall chips wrap over several rows; the swatches the user wants are below the list and often below the fold on a phone ("one tap selects, one tap colours" needs a scroll). The wood grid has the same problem: 6 cards in two rows plus names.

**F10. Plan editor on a phone repeats the same trade-off.** `plan-editor.scss`: collapsed panel is at least 134 px plus the top bar (Done, title, Undo, Redo, Snap) plus Fit/zoom floating over the canvas; Expanded is 60% of the screen, so editing a wall length (the most common action, from a tape measure) leaves 40% for the shape and needs two steps (select, then Edit details). Zoom +/- buttons are rarely needed on touch (pinch exists) but take canvas space.

**F11. Reset has no home in the new projects world.** With Projects, "Reset design", "New project" and "Delete" overlap in meaning. Reset belongs with the project, not the estimate.

**F12. First visit covers the hero.** Spec O5: first visit opens the sheet at Half on the Floor tab. The first impression of the product (the 3D room) is half hidden at the moment it matters.

**F13. Landing: returning users wait about 4 s, and the first tap does not navigate.** `landing.scss` reveals the CTA at about 3.6 s; the O7 skip means a tap only reveals it, a second tap navigates. For a returning user who just wants "Continue" this is the slowest part of the app. With the Continue/new-project pair, "Design your floor" no longer says that it starts a *new project*.

**F14. Sliders in a scrolling container.** Vertical scrolling in `.body` and horizontal slider drags share one finger. Slight diagonal drags scroll the panel instead of moving the thumb (verify on a phone; `touch-action: pan-y` handling on the range input is the usual fix).

### Nice to have

- **F15.** The Brightness unit "x" and the Angle note read as jargon; copy could be friendlier ("Sun brightness", "Rotate the pattern").
- **F16.** Popover rows are 35 px on phones (design doc says 44) (`wall-colouring.md` review item 12).
- **F17.** Highlight of the selected surface skews colour judgement (open item 9 in the colouring review). Fade it 1.5 s after a pick.
- **F18.** Duplicate assumptions text on desktop (`floor-visualizer.md` review item 20, open).
- **F19.** No active-preset mark on the camera presets (review item 12, open).
- **F20.** No general Undo for slider/design edits (only Reset and project delete). Out of scope here ("same features"), but the new tray makes room for a small Undo later.

### What works and should be kept

Autosave and live updates (no Apply buttons), the always-visible plank estimate, native colour picker with hex readout, the confirm for "All walls", number inputs paired with every slider, tap-to-select in 3D plus a list path, the plan editor's selection model and error chip, dialogs with focus handling, toasts with Undo. The proposal keeps all behaviour and rearranges where things live.

---

## 2. Proposal: "Dock + tray" (recommended)

### 2.1 Principles

1. **The 3D view is always full-screen.** Chrome floats over it and is small, translucent and temporary.
2. **One place per thing, named the way users talk.** Five sections, named for tasks: Room, Floor, Colour, Light, Estimate.
3. **Essentials first, details one tap away.** Each section shows 2-4 controls at once; the rest is under "More".
4. **Never move things under a finger.** No panel resizing during a drag.
5. **Back to 1x size.** 44 px targets, 14 px text. The space comes from a shorter tray, not smaller UI.
6. **Same model on phone and desktop.** Dock on the bottom (phone) becomes a rail on the side (desktop).

### 2.2 Information architecture

```
Top bar (always)         Project  |  Camera  |  Share  |  Save image
Section dock (always)    Room | Floor | Colour | Light | Estimate (shows the number)
Section tray (one open)  the controls of that section only
```

| Section | Essentials (visible in the tray) | Under "More" |
| --- | --- | --- |
| Room | Rectangle / Custom shape; Length; Width (or card with Edit shape) | Ceiling height |
| Floor | Wood strip; Angle; Finish | Plank size (length, width, planks per block), pattern line |
| Colour | What (Walls / Doors / Ceiling / Skirting); Which (All, 1, 2, ...); swatch strip | Custom colour readout / door hint |
| Light | Sunlight switch; Sun direction; Sun height; Brightness | none |
| Estimate | Planks to buy, area to buy, Waste allowance | Planks needed, skirting length, how it is calculated |

### 2.3 Navigation model

- **Dock buttons are disclosure buttons**, not tabs: tap opens that section's tray; tap again, the close chevron, or Escape closes it; tapping another dock button switches. One tray at a time. No Peek/Half/Full. Two states only: **closed** or **open**.
- **The Estimate dock button shows the live number** ("374" over "planks"), replacing the separate estimate bar, so the key result is visible with the tray closed and no extra row exists.
- **The tray is modeless.** The 3D view stays interactive (orbit, pinch, tap) while it is open.
- **Tray height follows content, hard-capped** at 40% of viewport height (min 220 px). Anything longer scrolls inside the tray, but the design target is that the essentials never need to scroll.
- **Scrub to see.** While a slider thumb is held, the tray's background and all other rows fade to about 15%; only the active row stays opaque, with a value bubble above the thumb. Layout does not change, so the thumb stays under the finger. This is how the user sees the floor under the tray while dragging Angle, Sun height and so on.
- **Colour has no mode.** Opening the Colour section = picking is on (this is already the rule). Closing it = off. The Colour mode toggle, its "Done" button, its Views popover item and the pressed badge all go away.
- **Camera menu** (one button): the three presets, zoom in/out, and "How to look around". The separate "?" chip goes. On desktop wider than 1200 px the presets also show inline.
- **Project menu**: the Projects chip opens the Projects dialog (as specced). The current row's "More" menu gets one extra item, **Reset to defaults** (undoable, as today). Reset leaves the Estimate section.

### 2.4 How the view stays visible

| Moment | Current (360x640 / 390x844) | Proposed |
| --- | --- | --- |
| Nothing open | Peek: 75% of height, 100 px of chrome plus an inert slice | Dock only: about 91% (dock 56 px); top bar floats over the view |
| Editing a control | Half: 50% (fixed), text 0.8x | Tray about 200-240 px: about 55-60% with 1x text |
| Dragging a slider | Same 50%; slider and effect compete | Tray fades: about 90% of the picture is visible under the translucent tray |
| Looking around | Full: 15% | Close the tray (one tap on the dock button): 91% |

(Computed from tokens. Open/scrub numbers are targets; verify in the build.)

Engineering intent for the architect: render the canvas full-screen behind all chrome and **frame the room in the uncovered rectangle** (camera view offset / principal-point shift) instead of resizing the canvas. Benefits: no canvas resize on every tray change, no flash, the floor shows through the translucent tray when scrubbing. Spike needed; the fallback is today's resize approach with the shorter tray, which is still a gain.

### 2.5 Phone layouts (360-430 px wide)

**Closed (default state after the first visit):**

```
+--------------------------------+
| [<] [Kitchen v]   [cam][sh][sv]|  floating bar, 44 px targets
|                                |
|                                |
|          3D VIEW               |
|          (full screen)         |
|                                |
|                                |
|--------------------------------|
| Room  Floor Colour Light  374  |  dock, 56 px
|  []     []     []     []  planks|
+--------------------------------+
```
`[cam]` = Camera menu, `[sh]` = Share, `[sv]` = Save image (primary fill). Project chip truncates to about 12 characters. At 320 px the chip goes icon-only (as already specced).

**Floor section open:**

```
+--------------------------------+
| [<] [Kitchen v]   [cam][sh][sv]|
|                                |
|          3D VIEW               |
|                                |
|================================|
| Floor                        v |  header + close chevron
| (oak)(nat)(smk)(wal)(ash)(wh)> |  wood strip, scrolls sideways
| Angle                      45° |
| ---------------o---------------|
| Finish  [Matte|Satin|Gloss]    |
| > Plank size and block         |  "More" disclosure
|--------------------------------|
| Room [Floor] Colour Light  374 |  active dock item marked
+--------------------------------+
```

**Scrubbing the Angle slider (tray faded, same layout):**

```
|          3D VIEW               |
|          pattern visible       |
|          through the tray      |
|              [ 45 ]            |  value bubble above the thumb
|  Angle ----------o------------ |  only this row stays opaque
|                                |
| Room [Floor] Colour Light  374 |
```

**Colour section open:**

```
| Colour                       v |
| (Walls)(Doors)(Ceiling)(Skirting)|  What (radio chips)
| (All)(1)(2)(3)(4)               |  Which (only Walls and Doors)
| [Same][o][o][o][o][o][o][o][+] >|  swatch strip, scrolls sideways
| Wall 3 is Warm white.           |
```
Tapping a wall in 3D updates both chip rows and scrolls the selected chip into view; the tray never changes height and never moves. First time only, a chip over the view: "Tap a wall, door, skirting or the ceiling." (dismisses on first tap, replaces the old hint and the "Done" button). "All walls with accent walls" keeps its confirm dialog. Custom colour keeps the native picker and hex readout.

**Estimate section open:**

```
| Estimate                     v |
| 374 planks to buy              |  large
| 22.40 m2 incl. 12% waste       |
| Waste allowance        12 %    |
| ---o---------------------------|
| > Details and how it is        |
|   calculated                   |
```

**Room section open:**

```
| Room                         v |
| (Rectangle | Custom shape)     |
| Length                 5.00 m  |
| ---------o---------------------|
| Width                  4.00 m  |
| ---------o---------------------|
| > Ceiling height               |
```
Custom shape: the card (corners, area, doors, windows) and a primary **Edit shape** button replace Length/Width.

### 2.6 Desktop layout (>= 900 px)

Same sections, as a vertical **rail** on the right edge with the content column beside it. Clicking the active rail item (or the chevron) collapses the column, so the view can take the full width.

```
+-----------------------------------------------+----------------+------+
| [<] [Kitchen v]   [Camera v] [Share][Save image]| Floor      <   | Room |
|                                               |                | Floor|
|                                               | Wood           |Colour|
|                  3D VIEW                      | (oak)(nat)...  |Light |
|                                               | Angle    45 deg|  374 |
|                                               | ------o------- |planks|
|                                               | Finish [..]    |      |
|                                               | > Plank size   |      |
+-----------------------------------------------+----------------+------+
```
- Column 320 px, rail 72 px (vs 360 px panel today). Collapsed: rail only.
- Top bar: Back, Project chip, then on the right Camera, Share, Save image. Presets inline from 1200 px. At 900 px the bar has 5 items (about 500 px), so it fits (F4 solved).
- The Estimate rail item shows the number, as on the phone.
- Landscape phone (>= 700 x < 500): rail plus a 45% column, or the dock + tray if the height allows; the tray cap becomes 55% of width.

### 2.7 Plan editor

**Phone.** Same idea: canvas full-screen; one contextual action bar; a short inline card for typed values. No 60% expanded panel.

```
Nothing selected
+--------------------------------+
| [Done]  Room shape  [Un][Re][::]|  :: = Snap, Start over, Lists
|                                |
|            SVG plan            |
|                                |
|                          [Fit] |
| 18.40 m2 - 6 walls             |
|--------------------------------|
| Tap a wall or corner.  Height 2.70 m >|
+--------------------------------+

Wall selected
|            SVG plan            |
|      (wall 2 highlighted)      |
|--------------------------------|
| Wall 2   [3.40 m  edit]        |
| [+ Door][+ Window][+ Corner]   |
+--------------------------------+

Tapping "3.40 m edit" opens a short card (max 45%)
| Wall 2 length   [ 3.40 ] m     |
| Keep (Corner 2 | Corner 3)     |
| Move wall [Pull in][Push out]  |
| > Doors and windows (2)        |
```
- Length is one tap from the selection. Corner: X and Y in the card. Door/window: Width, Position, and the rest in the card.
- Zoom -/+ are hidden on touch (pinch works); **Fit** stays. They remain on desktop.
- Snap moves into the top bar overflow (:: menu) with Start over and the Walls/Corners lists (the lists are the non-pointer path, so they stay reachable; on desktop they stay in the side panel).
- The reason chip and first-use hint stack above the action bar as today.
- Screen readers and keyboard: the card and list are real forms; focus rules from `custom-room-shape.md` stay.

**Desktop.** Keep the side panel (it works); move Snap/Fit/zoom to a floating cluster bottom-left of the canvas and Done stays top-left. Minor.

### 2.8 Landing

- **First visit:** unchanged look. Make the CTA available earlier: at about 2.4 s (when the sun turns on and the wordmark has landed) instead of 3.6 s; the shine keeps playing behind it.
- **Returning user** (summary exists): CTA block appears at about 0.8 s. Continue (primary, filled gold) and the second pill. The second pill reads **"New project"** instead of "Design your floor", since it creates one (`/designer?new=1`). Keep the count line.
- A tap on the invisible pill area during the intro is treated as a tap on the pill (navigates), not just a reveal; a tap elsewhere still skips the intro.
- Everything else stays (kicker, wordmark, grain).

```
        HERRINGBONE, IN 3D
   [ Continue: Kitchen ]        primary
   [ New project ]              secondary
     3 projects on this device
```

### 2.9 Feature map: old to new

| Feature | Old location | New location |
| --- | --- | --- |
| Back to landing | Toolbar, "Parket" chip | Top bar, icon, left |
| Projects (switch, new, rename, duplicate, delete) | Toolbar chip (share spec) | Top bar, project chip, left (dialog unchanged) |
| Reset design (+ Undo toast) | Estimate tab footer | Projects dialog, current row menu, "Reset to defaults" |
| Share link | Toolbar chip (share spec) | Top bar, right (icon on phone, label on desktop) |
| Save image | Toolbar, primary chip | Top bar, right, primary |
| Camera presets (Corner, Doorway, Top-down) | Views popover (phone) / inline (desktop) | Camera menu (inline from 1200 px) |
| Zoom in / out | Views popover / inline | Camera menu |
| How to look around (?) | Separate "?" chip | Camera menu item; first-visit hint stays |
| Colour mode toggle | Toolbar (desktop), Views popover (phone) | Removed; Colour section open = picking |
| Surface list (All walls, Wall N, Doors, Ceiling, Skirting) | Surfaces tab, wrapped chips | Colour section: "What" and "Which" chip rows |
| Palette, default swatch, Custom, hex readout, door hint | Surfaces tab, below the list | Colour section: swatch strip + value line |
| "All walls" confirm | Dialog | Unchanged |
| Simple / Custom shape toggle | Room tab | Room section |
| Length, Width | Room tab | Room section |
| Ceiling height | Room tab | Room section, under "More" |
| Edit shape | Room tab card (+ link in Light tab) | Room section primary button (+ link in Light kept) |
| Wood species | Floor tab, 3-column grid | Floor section, one-row strip |
| Pattern line | Floor tab | Floor section, under "More" |
| Plank length, width, planks per block | Floor tab | Floor section, "Plank size" under "More" |
| Angle | Floor tab | Floor section, essentials |
| Finish | Floor tab | Floor section, essentials |
| Sunlight switch, direction, height, brightness | Light tab | Light section |
| Estimate summary line | Peek bar / panel footer | Estimate dock/rail button (number) |
| Waste allowance, needed, skirting, area/planks to buy, how calculated | Estimate tab | Estimate section |
| Sheet handle, Peek/Half/Full | Sheet | Removed (open/closed only) |
| 3D load / no-WebGL / paused states | Overlay on canvas | Unchanged; Estimate section opens when no 3D |
| Plan editor: Done, Undo, Redo | Top bar | Top bar |
| Plan editor: Snap | Top bar | Top bar overflow (phone), floating cluster (desktop) |
| Plan editor: Fit | Floating tools | Floating, stays |
| Plan editor: Zoom -/+ | Floating tools | Desktop only (touch uses pinch) |
| Plan editor: wall/corner/opening forms | Expanded panel (60%) | Inline card (max 45%) phone; side panel desktop |
| Plan editor: Add door / window / corner | Collapsed panel + form | Action bar on the selected wall |
| Plan editor: Delete | Collapsed panel + form | Action bar on the selected item |
| Plan editor: Pull in / Push out, Keep | Expanded form | Inside the length card |
| Plan editor: Walls and Corners lists | Expanded panel disclosures | Overflow menu "Lists" (phone), side panel (desktop) |
| Plan editor: Room (area, height, Start over) | Panel / disclosure | Nothing-selected bar (height) + overflow (Start over) |
| Landing: Design your floor / Continue / count | Pills + line | Same; "New project" label when Continue shows; faster reveal |

### 2.10 Accessibility notes for the new shell

- Dock/rail: `<nav>` or `role="toolbar"` with arrow-key movement; each button `aria-expanded` + `aria-controls` the tray; the Estimate button's accessible name carries the result ("Estimate, 374 planks to buy, 20.00 square metres"). Not the ARIA tabs pattern (it is not a view switcher with content that must always show).
- Tray: `role="region"`, labelled by its heading; Escape closes it and returns focus to its dock button; opening moves focus to the tray heading (`tabindex="-1"`). Focus never lands behind the dock (2.4.11).
- Scrub-to-see: purely visual; the controls stay in the DOM and focusable; fade is skipped under `prefers-reduced-motion` and when a keyboard is driving the slider.
- Targets 44 px at 1x; text at least 14 px for labels, 12 px minimum for hints; contrast tokens unchanged.
- Live regions kept: estimate sentence (debounced), colour announcements, project announcements.
- 200% and 400% zoom: the tray scrolls inside its cap; at 320 CSS px the dock keeps five items with icon + 11-12 px label (verify).

---

## 3. Alternatives

| | A. Dock + tray (recommended) | B. Tune the current tabs and sheet | C. Direct manipulation (tap the thing) | D. Guided steps |
| --- | --- | --- | --- | --- |
| Idea | Always-visible section dock, one short tray, full-screen view, scrub-to-see | Keep tabs/sheet: rename Surfaces, drop Colour mode, shorter Half, 1x scale, move Reset | No panel; tap floor/wall/sun in 3D to get a small popover | Wizard: Room, Floor, Colours, Result |
| View visibility | High | Medium (still 50% at Half) | Highest | Medium |
| Findability | High (5 named buttons, number on the dock) | Medium (tabs still hide content) | Low for Light, Room, Estimate; poor for keyboard and screen readers | High for first run, poor for tweaking |
| Effort | Large (shell rebuild, sections re-laid out) | Small to medium | Very large, new a11y paths needed | Medium |
| Risk | Canvas framing spike; re-test everything | Does not solve "covers the view" | Accessibility and discoverability | Users iterate between sections; a wizard fights that |
| Verdict | **Recommended** | Good fallback; its quick wins are all inside A | Use one idea from it later: tap the floor to open Floor | Reject |

Recommendation: **A**. It is the only option that removes the cause of both complaints (shared space, hidden controls) while keeping the model familiar (bottom toolbar of sections is a pattern users know from photo and map apps). B is a safe fallback if the canvas-framing spike fails or the rebuild must be cheap.

---

## 4. Phased rebuild outline (for the architect)

All phases ship together as one minor release unless noted; they are an order of work. Each phase needs: UX spec (ux-expert), visual spec/tokens (designer), build, tests incl. axe, review.

0. **Prerequisite:** share + projects lands (Projects chip, Share, Continue). Keep its toolbar work minimal; the rebuild reflows it.
1. **Spike (1 task):** full-screen canvas with a framing offset for the uncovered rectangle; measure on a mid-range phone. Decide A vs fallback (resize). Also verify F1, F4, F7, F14 on a device and record numbers.
2. **Shell:** drop the 0.8 phone scale (tokens, `_phone-scale.scss`); new top bar (Back, Project, Camera, Share, Save); dock/rail + tray container with open/closed state, focus rules, tray cap, Estimate dock button with live number; remove Peek/Half/Full and the sheet handle. Remove the "?" chip (moves into Camera menu).
3. **Sections:** compact slider row component (one-line label/value + slider, hint under "More"), wood strip, swatch strip, "More" disclosure; move Room, Floor, Light, Estimate into the tray; **scrub-to-see** behaviour; value bubble.
4. **Colour:** merge Colour mode into the Colour section (What/Which rows + swatch strip); remove the toggle, "Done", popover item and badge; keep confirm, custom colour, hex readout, live announcements; highlight fade after a pick; first-time tap hint chip.
5. **Project tweaks:** Reset to defaults in the Projects row menu; remove Reset from Estimate; update the spec for the Projects dialog.
6. **Desktop:** rail + collapsible column; Camera inline presets from 1200 px; check 900-1280 px widths.
7. **Plan editor:** phone action bar + inline card (max 45%), hide zoom on touch, overflow menu (Snap, Lists, Start over), keep desktop panel; re-verify focus and reveal rules.
8. **Landing:** earlier CTA (first visit about 2.4 s, returning about 0.8 s), tap-on-pill navigates, "New project" label for returning users.
9. **QA and docs:** keyboard, screen reader (TalkBack, VoiceOver), 200%/400% zoom, 320 px, landscape, axe on every section and dialog; update `floor-visualizer.md`, `wall-colouring.md`, `share-and-projects.md` (the layout parts they describe are superseded) and `design-system.md`.

Rough size guide: phases 2-4 are the bulk; 1 and 5 are small; 6-8 are medium and separable (the plan editor and landing could ship as follow-ups).

---

## 5. Questions for the user

1. **Direction.** Go with A (dock + tray, full redesign of the controls) / B (tune the current tabs and sheet) / other. **Recommended: A.**
2. **Small behaviour changes bundled.** Rename "Surfaces" to "Colour" and remove the Colour mode switch (opening Colour is the mode); move "Reset design" into the Projects menu; landing label "New project" for returning users and a faster Continue. **Recommended: yes to all.**
3. **Size.** Drop the compact 0.8 scale and return to normal sizes (44 px buttons, 14 px text), relying on the shorter tray to keep the view visible. **Recommended: yes.**

(Technical choices, such as the canvas framing method, are for the architect's spike and need no decision from the user.)

## Answers (user, 2026-10-23)

- Direction: **Dock + short tray** (recommended), as proposed.
- Small fixes, all yes:
  - rename "Surfaces" to "Colour" and remove the separate Colour mode;
  - move "Reset design" into the Projects row menu;
  - landing: Continue appears faster, and the second button reads "New project".
- Sizes: **KEEP the compact 0.8x phone scale** (the user's earlier explicit request). Don't go back to 44px/14px. Targets stay ≥ 24px (WCAG 2.5.8), and the 11.2px floor for --text-xs stays.
- The rebuild starts after share + projects has been tested and reviewed.
