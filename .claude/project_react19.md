---
name: project-react19
description: This project uses React 19 with the React Compiler — enforce purity rules before starting any task
metadata:
  type: project
---

This project uses **React 19 with the React Compiler enabled**.

**Why:** React 19's compiler enforces strict purity/idempotency rules that were not enforced in earlier versions. Violating them causes compilation skips and lint errors.

**How to apply:** Before writing or modifying any component or hook, ensure:

- No impure functions (`Date.now()`, `Math.random()`, etc.) called during render — move them into `useEffect`, event handlers, or timer callbacks only.
- No synchronous `setState` calls directly in `useEffect` bodies — use `setTimeout(fn, 0)`, interval callbacks, or event callbacks instead.
- Manual `useMemo`/`useCallback` deps must exactly match what the compiler infers. If using optional chaining in deps (e.g. `session?.templateId`), extract to a local variable first so the compiler sees a stable reference.
- Components and hooks must be idempotent: same inputs → same output on every render.
