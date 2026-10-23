---
description: Resume interrupted dev-team work from docs/STATUS.md
---

Resume the team's work after an interruption (session limit, crash, new session).

1. Read `docs/STATUS.md`, the plan(s) it points to, and `git status --short`.
2. If the preview dev server is not answering on http://localhost:4200, start it in the background (see Environment notes in STATUS.md).
3. For every task marked `running` or interrupted: check the files on disk and run the tests (`npx -y -p node@26 -- node node_modules/@angular/cli/bin/ng.js test --watch=false`) to see how far it got. Then re-delegate the remaining part to the same agent type with the plan/spec paths, saying what is already done so it continues instead of starting over. Respect the file ownership in the plan and run independent tracks in parallel.
4. Start tasks whose dependencies are now done, following the workflow in CLAUDE.md.
5. Update `docs/STATUS.md` after every phase change.
6. Never commit, push or deploy unless the user asked for it; anything under "Waiting on the user" stays waiting. If nothing can proceed without the user, ask them (AskUserQuestion) and stop.
7. Report to the user in a few short lines what was resumed.
