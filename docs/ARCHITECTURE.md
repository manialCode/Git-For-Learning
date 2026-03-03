# GitLet Project Documentation

This document provides an overview of the GitLet codebase to help a newcomer
understand how the project is structured and how its components interact. GitLet
is an educational reimplementation of a subset of Git operations in plain JavaScript.

---

## Repository layout

```

api/                      # core implementation modules
  files.js                # filesystem helpers and repo discovery
  gitAPI.js               # public API (procedural) and DI factory
  index.js                # index/ staging area logic
  objects.js              # low-level object storage (blobs, commits, trees)
  refs.js                 # reference (branch, HEAD) management helpers
  status.js               # human readable status output
  util.js                 # shared utilities (hashing, helpers)
  __tests__/              # unit tests for the DI-friendly API
    gitAPI.test.js

package.json              # project configuration and scripts
README.md                 # quick start (already contains some docs)
jest.setup.cjs            # jest environment setup for ESM
eslint.config.cjs         # eslint configuration stub
eslint.config.mts         # another eslint config variant
tsconfig.json             # typescript settings (ambient types only)
coverage/                 # auto-generated coverage reports
```

The `api` folder contains the entire application logic. External folders like
`coverage` and `types` support testing and typing, but are not part of the
runtime logic.

---

## High-level flow

1. **CLI or programmatic entrypoint**
   - The CLI (`node api/gitAPI.js`) simply parses command-line arguments and
     forwards them to the exported `gitLet` object. For testing, the
     `createGitlet(ctx)` factory is used to create an API instance with
     injected dependencies (files, config, index, etc.).

2. **`gitLet` object (api/gitAPI.js)**
   - Implements user-facing commands (init, add, commit, checkout, etc.).
   - Each command verifies repository state (`files.assertInRepo()`,
     `config.assertNotBare()`), then coordinates lower‑level helpers such as
     `index`, `refs`, `objects`, `diff`, and `merge`.
   - The object is intentionally small; most logic lives in the helpers.

3. **Helpers**
   - **files.js**: Locates the `.gitlet` directory, reads/writes files,
     recursively lists working‑copy files, and transforms between nested/
     flattened trees.
   - **util.js**: Generic utilities (simple hash function, deep setIn,
     array helpers, remote directory invocation helper).
   - **index.js**: Manages the "index" file (staging area). It can read/write
     the index, compute a table-of-contents, identify conflicts, and update
     entries.
   - **objects.js**: Stores Git objects under `.gitlet/objects`. Supports
     writing trees and commits, reading objects, checking ancestry, and
     computing commit TOCs.
   - **refs.js**: Handles branch references, HEAD state, resolving names to
     hashes, parsing `FETCH_HEAD`, and writing/removing refs.
   - **status.js**: Builds a human-readable status string by querying the
     other helpers.

4. **Diff/merge modules**
   - `diff` and `merge` are assumed to be available in the runtime context.
     They aren't implemented in this project; unit tests inject mocks. If you
     explore coverage you may see some commented out legacy code in
     `gitAPI.js` that includes a previous implementation of these helpers.

5. **Testing**
   - Jest tests live in `api/__tests__/gitAPI.test.js`. They exercise the
     factory-based API using mocked dependencies, ensuring the procedural
     commands behave correctly without touching the filesystem.
   - To add tests for other helper modules, simply import them and create
     additional test files in the same directory.

---

## Working with the code

1. **Run tests**:

   ```sh
   pnpm test
   ```

2. **Linting**:

   ```sh
   pnpm exec eslint api --ext .js --fix
   ```

3. **Adding features**:
   - Prefer updating a helper module rather than adding logic to `gitAPI.js`.
   - Keep functions small and document public APIs with JSDoc comments.
   - Use `createGitlet(ctx)` in tests to isolate behavior.

4. **Understanding comments**
   - Many functions include a `Public API:` header comment describing exported
     methods.
   - Legacy code blocks are left commented for reference; they can be removed
     when you have tests covering the replacement code.

---

## Example usage (programmatic)

```js
import { createGitlet, gitLet } from './api/gitAPI.js';
import files from './api/files.js';
// ... import other helpers as needed

// CLI style:
console.log(gitLet.init({ bare: false }));

// DI style for tests:
const ctx = { files, config, index, refs, objects, diff, merge, util };
const api = createGitlet(ctx);
api.add('src');
```

---

## Notes & Tips

- The repository is intentionally simple so that learners can read every line
  in a single sitting.
- The `objects.hash()` function is deterministic but insecure; it's just for
  teaching and filenames.
- The `files.gitletPath()` recursion finds the repository root by walking up
  the file system until it locates a `config` file or `.gitlet` folder.
- `gitLet.update_ref()` ensures that only valid commit objects are written to
  refs; it resolves both ref names and SHA strings.

---

This document should give new contributors enough context to navigate the
code and extend functionality confidently. For deeper questions, inspect the
module's JSDoc comments or run the unit tests to observe behavior.
