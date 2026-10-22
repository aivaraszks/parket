# Ask for details on big tasks

Before starting a big task, ask the user for the missing details instead of guessing.

A task is big when it:

- creates a new project, app, or feature from scratch
- touches many files or changes the architecture
- requires choosing a framework, library, or tech stack
- is vague about scope, expected result, or constraints

Ask short, concrete questions (stack, scope, what "done" looks like) and wait for the answers. Recommend a default where you have one. Do not run generators, install dependencies, or create files for a big task until the user confirms.

Small, clear tasks (a fix, a rename, a single-file change) don't need this — just do them.
