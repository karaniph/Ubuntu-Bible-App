# Code Review — Bible App 1.3.2 Export Crash Fix
Branch: `fix-export-crash-1.3.2` vs `fix-export-render-1.3.1`
Date: 2025-07-15

## Evidence Read
- `git diff fix-export-render-1.3.1...HEAD` (3 files changed)
- `src/main/main.ts` (current branch, full file)
- `package.json`, `package-lock.json` (first 25 lines)
- `code-evidence.txt`, `diagnosis.txt`

---

## Check 1 — Root cause addressed ✓

**Diagnosis**: The 1.3.1 font fix block ran synchronously at module level, before GTK
initialised. When the user clicked Export, `renderInHiddenWindow()` created a second
`BrowserWindow`. fontconfig 2.12.6 re-read `fonts.conf` with a stale internal state and/or
could not write its rebuilt cache to a non-existent `$XDG_CACHE_HOME/fontconfig` directory,
triggering SIGABRT/SIGSEGV.

**Fix applied** (`main.ts` lines 320–340):
- Entire font fix block moved inside `app.whenReady().then()`, positioned after
  `setAppMenu()` (GTK already initialised) and before `createWindow()` (no BrowserWindow
  exists yet). This matches the stated requirement: runs after GTK initialises for the main
  window and before any `dialog.showSaveDialog` call.
- `fs.mkdirSync(cacheDir, { recursive: true })` added before `writeFileSync` so the
  fontconfig cache directory is guaranteed to exist when fontconfig attempts to write it.
- `import os from 'os'` added to support the `homedir()` fallback for `XDG_CACHE_HOME`.

Sequence is now: GTK init → font fix → `createWindow()` → Export click → second
`BrowserWindow`. fontconfig sees a consistent, already-corrected `fonts.conf` state at
every window creation. Root cause directly addressed.

---

## Check 2 — Font fix not regressed ✓

The snap font fix is present at `main.ts` lines ~323–337:
- Guard (`process.platform === 'linux' && isSnapRuntime && process.env.XDG_CONFIG_HOME`) intact.
- Regex `replace(/^[ \t]*<cachedir>\/[^<]*\/\.cache\/fontconfig<\/cachedir>[ \t]*\r?\n?/gm, '')`
  unchanged — same pattern that removed the bad host cachedir line in 1.3.1.
- ENOENT-silent error handling preserved.
- `code-evidence.txt` §STEP 7 confirms the font fix block is inside `app.whenReady().then()`
  at `dist/main/main.js` line 329 and `mkdirSync` precedes `writeFileSync` at line 338.

---

## Check 3 — GTK_IM_MODULE block UNCHANGED ✓

`main.ts` lines 15–24 (confirmed by grep and full file read):
```typescript
if (process.platform === 'linux' && !process.env.GTK_IM_MODULE) {
    // On GNOME/Wayland sessions (default on Ubuntu 25.10+) the GTK ibus input
    // module fails to deliver keystrokes to the Electron window inside snap
    // confinement — the app looks frozen and you cannot type anywhere.
    // Forcing the simple built-in "xim" input module restores keyboard input.
    // Only set when the user has not chosen an input module themselves, so we
    // never override a working ibus/fcitx setup (e.g. non-Latin input).
    process.env.GTK_IM_MODULE = 'xim';
}
```
The diff does not touch this block. It remains at module level, byte-for-byte identical
to the base branch.

---

## Check 4 — Hard rules held ✓

- Diff touches only `src/main/main.ts`, `package.json`, `package-lock.json`. No changes to
  `database.ts`, `studies.ts`, `studyExport.ts`, or any asset file.
- `bible.db` and `study.db` are not in the diff (read-only bundled assets, unchanged).
- `openInBrowser` (http/https-only guard) untouched.
- `openFeedbackEmail` (narrow mailto guard: exact recipient, single `subject` param) untouched.
- No `fetch`, `axios`, `http.get`, `https.get`, or `net.request` calls added.
- No donation or shop content added.

---

## Check 5 — Build verification ✓

Per `code-evidence.txt` §STEP 5:
- `npx tsc -p src/main/tsconfig.json --noEmit` → exit 0
- renderer tsc → exit 0
- `npx vite build` → exit 0
- `npm run build:main` → exit 0

`code-evidence.txt` §STEP 6 confirms IPC handler presence in built output:
- `studies:export` (1 hit), `app:openFeedbackEmail` (1 hit), `concordance:lookup` (2 hits),
  `GTK_IM_MODULE` (2 hits — guard check and assignment).

---

## Check 6 — Version bump correct ✓

- `package.json` root: `"version": "1.3.2"` ✓
- `package-lock.json` root field (line 3): `"version": "1.3.2"` ✓

**Observation (non-blocking)**: `package-lock.json` `packages[""]` entry at line 9 still
reads `"version": "1.3.1"` — the coder updated only the root-level field. The task check
requires only the root version to be "1.3.2", which passes. The packages[""] mismatch does
not affect any build output or runtime behaviour but would be corrected automatically by
`npm install`.

---

## Verdict

**APPROVED** — All six blocking checks pass. No reachable correctness, security or data
failures were found. The fix directly addresses the diagnosed root cause, preserves the font
fix and all hard rules, and all required builds exited 0.
