# Parket

Web application developed with Claude Code by a team of subagents. The user often works remotely from a phone, so keep reports short. Always ask the user questions with the AskUserQuestion tool (selectable options, recommended first), never as open-ended plain text. Subagents cannot ask the user — they return their questions to the main session, which asks them this way.

## Tech stack

- Angular 22: standalone components, signals, zoneless (no zone.js), Vitest.
- SCSS. Global styles and design tokens (CSS custom properties) live in `src/styles.scss`; see `docs/design/design-system.md` once it exists.
- Static site with **no backend** (so far).
- Node 26, npm. Deployed by GitHub Actions (`.github/workflows/deploy.yml`) to GitHub Pages at https://aivaraszks.github.io/parket/ (base href `/parket/`, set by `npm run build:pages`). Never push or deploy without explicit user confirmation.
- Git author for this repo: `aivaraszks@gmail.com` (repo-local config).

## Commands

- `npm start` — dev server (`ng serve`, http://localhost:4200)
- `npm run build` — production build to `dist/parket/browser`
- `npm run build:pages` — production build with base href `/parket/` (what CI deploys)
- `npm run test:ci` — unit tests once, non-watch; `npm test` watches
- `npm run format` / `npm run format:check` — Prettier write / check over `src/**/*.{ts,html,scss}`
- `npx ng generate component <name>` — scaffold with the Angular CLI (also `service`, `directive`, `pipe`)

## Dev team (subagents in `.claude/agents/`)

| Agent           | Role                                                | Writes to                     |
| --------------- | --------------------------------------------------- | ----------------------------- |
| `architect`     | Plans features, splits tasks, records decisions     | `docs/plans/`                 |
| `ux-expert`     | User flows, screens, states, copy, accessibility    | `docs/ux/`                    |
| `designer`      | Design system, tokens, visual component specs       | `docs/design/`, global styles |
| `frontend-dev`  | Implements UI                                       | frontend code                 |
| `backend-dev`   | Implements API, logic, database                     | backend code                  |
| `devops`        | Docker, CI/CD, environments, deployment, monitoring | infra files, `docs/devops/`   |
| `tester`        | Writes missing tests, runs the suite, checks "done" | test files                    |
| `code-reviewer` | Reviews the diff for bugs, security, conventions    | nothing (read-only)           |

## Workflow — the main session orchestrates

For any non-trivial feature, the main session delegates in this order and reports to the user between phases:

1. **Clarify** — ask the user for missing details (see `.claude/rules/ask-for-details.md`).
2. **Plan** — `architect` writes `docs/plans/<feature>.md`. Show the plan to the user and wait for approval.
3. **Spec** — for UI work, `ux-expert` writes the UX spec, then `designer` adds/updates tokens and visual specs. Skip for backend-only work.
4. **Build** — `backend-dev` and `frontend-dev` implement their tasks. Run them in parallel when the plan's API contract is fixed; otherwise backend first. `devops` handles any infrastructure tasks (Docker, CI/CD, environments) in parallel.
5. **Test** — `tester` adds missing tests and runs the full suite. Failures go back to the responsible developer.
6. **Review** — `code-reviewer` reviews the diff; `ux-expert` reviews built UI. Fixes go back to the developer, then re-test.
7. **Report** — summarise to the user what was built, test results and open issues. Commit only when the user asks.

Small, clear tasks (a fix, a rename, one file) skip the pipeline — do them directly.

Agents hand work to each other through files in `docs/` — always pass the relevant plan/spec path when delegating.

## Angular guidelines

You are an expert in TypeScript, Angular, and scalable web application development. You write functional, maintainable, performant, and accessible code following Angular and TypeScript best practices.

### TypeScript Best Practices

- Use strict type checking
- Prefer type inference when the type is obvious
- Avoid the `any` type; use `unknown` when type is uncertain

### Angular Best Practices

- Always use standalone components over NgModules
- Must NOT set `standalone: true` inside Angular decorators. It's the default in Angular v20+.
- Do NOT set `changeDetection: ChangeDetectionStrategy.OnPush` explicitly. `OnPush` is the default in Angular v22+.
- Use signals for state management
- Implement lazy loading for feature routes
- Do NOT use the `@HostBinding` and `@HostListener` decorators. Put host bindings inside the `host` object of the `@Component` or `@Directive` decorator instead
- Use `NgOptimizedImage` for all static images.
  - `NgOptimizedImage` does not work for inline base64 images.

### Accessibility Requirements

- It MUST pass all AXE checks.
- It MUST follow all WCAG AA minimums, including focus management, color contrast, and ARIA attributes.

### Components

- Keep components small and focused on a single responsibility
- Use `input()` and `output()` functions instead of decorators
- Use `model()` for two-way bound properties with `[(prop)]` syntax instead of pairing `input()` with `output()`
- Use `computed()` for derived state
- Use `linkedSignal()` for state derived from multiple reactive sources that must stay synchronized
- Prefer inline templates for small components
- Prefer Signal Forms (`@angular/forms/signals`) for new forms. They are stable in Angular v22+ and provide signal-based state, type-safe field access, and schema-based validation
- When not using Signal Forms, prefer Reactive forms instead of Template-driven ones
- Do NOT use `ngClass`, use `class` bindings instead
- Do NOT use `ngStyle`, use `style` bindings instead
- Do NOT import `CommonModule`, import only the directives and pipes the template uses, such as `AsyncPipe` or `DatePipe`
- When using external templates/styles, use paths relative to the component TS file.

### State Management

- Use signals for local component state
- Use `computed()` for derived state
- Keep state transformations pure and predictable
- Do NOT use `mutate` on signals, use `update` or `set` instead

### Templates

- Keep templates simple and avoid complex logic
- Use native control flow (`@if`, `@for`, `@switch`) instead of `*ngIf`, `*ngFor`, `*ngSwitch`
- Use the async pipe to handle observables
- Do not assume globals like (`new Date()`) are available.

### Services

- Design services around a single responsibility
- Use the `providedIn: 'root'` option for singleton services
- Prefer the `@Service` decorator over `@Injectable({providedIn: 'root'})` for new singleton services (Angular v22+)
- Use the `inject()` function instead of constructor injection
