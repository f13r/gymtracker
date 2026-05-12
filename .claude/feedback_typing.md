---
name: Type usage discipline
description: Rules for TypeScript typing — prefer library-provided types, no ad-hoc types, no escape hatches
type: feedback
---

Always use existing types from libraries. Do not create custom types on the fly to work around not finding the proper solution.

**Why:** Creating ad-hoc types (e.g. manual intersection types) hides ignorance of the library's actual API and produces fragile, misleading code.

**How to apply:**

- Prefer `ReturnType<typeof libraryFn>`, `Parameters<...>`, `InstanceType<...>`, and other TS utility types derived from library exports over manually reconstructed types
- Never use `any`
- Never use `as unknown as X` casts
- If the right type isn't obvious, look at the library's `.d.ts` files and source maps before reaching for a workaround
