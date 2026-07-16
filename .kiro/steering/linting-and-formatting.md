---
inclusion: always
---

# CareCareer Linting & Formatting Standards

## 1. ESLint Configuration

Zero warnings policy. If ESLint warns, it's treated as an error in CI.

### Key Rules Enforced:
```
@typescript-eslint/strict-type-checked      — strict type checking
@typescript-eslint/no-explicit-any          — error (never use any)
@typescript-eslint/explicit-function-return-type — error for public APIs
@typescript-eslint/no-unused-vars           — error (clean code)
@typescript-eslint/naming-convention        — enforce naming rules
no-console                                  — error (use logger)
no-debugger                                 — error
no-restricted-imports                       — prevent cross-service imports
import/order                                — consistent import ordering
import/no-cycle                             — prevent circular dependencies
```

### Import Order (enforced):
```typescript
// 1. Node.js built-ins
import { readFile } from 'node:fs/promises';

// 2. External packages
import { Injectable } from '@nestjs/common';
import { z } from 'zod';

// 3. Internal packages (@carecareer/*)
import { TenantContext } from '@carecareer/tenant-context';
import { Logger } from '@carecareer/observability';

// 4. Relative imports (parent first, then sibling, then child)
import { ShiftRepository } from '../infrastructure/shift.repository';
import { ShiftCreatedEvent } from './events/shift-created.event';
```

## 2. Prettier Configuration

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "useTabs": false,
  "bracketSpacing": true,
  "arrowParens": "always",
  "endOfLine": "lf"
}
```

Non-negotiable. Prettier formats, developers don't argue about style.

## 3. Git Hooks (Husky + lint-staged)

### Pre-commit hook:
```bash
# Only runs on staged files (fast)
lint-staged:
  "*.{ts,tsx}": ["eslint --fix", "prettier --write"]
  "*.{json,md,yml}": ["prettier --write"]
  "*.prisma": ["prisma format"]
```

### Pre-push hook:
```bash
# Full type check + tests for affected packages
pnpm type-check
pnpm test:unit --filter=[origin/main]
```

## 4. EditorConfig

```ini
root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
trim_trailing_whitespace = true
indent_style = space
indent_size = 2

[*.md]
trim_trailing_whitespace = false

[Makefile]
indent_style = tab
```

## 5. Restricted Patterns

### Never allowed in production code:
```typescript
console.log()         // Use structured logger
console.error()       // Use structured logger
console.warn()        // Use structured logger
@ts-ignore            // Fix the type error
@ts-expect-error      // Fix the type error (or link issue)
as any                // Use proper type assertion or unknown
eval()                // Security risk
new Function()        // Security risk
setTimeout(fn, 0)     // Use proper async patterns
```

### Never in committed code:
```
.only (test.only, describe.only)    — skips other tests
.skip (test.skip)                   — dead tests accumulate
TODO without ticket reference       — becomes permanent tech debt
FIXME without ticket reference      — becomes permanent tech debt
HACK                                — refactor it properly
```

## 6. Database/Prisma Linting

- All models MUST have `tenant_id` field (enforced by custom lint rule)
- All models MUST have `created_at` and `updated_at` timestamps
- All models MUST use UUID for primary keys (not auto-increment)
- All enum values MUST be UPPER_SNAKE_CASE
- All relation fields MUST have explicit `onDelete` behavior
- Migration files MUST never be modified after merge to main

## 7. Security Linting

- No secrets in source code (detected by git-secrets or gitleaks)
- No hardcoded URLs (use environment variables)
- No SQL string concatenation (use parameterized queries / Prisma)
- Input validation at EVERY boundary (Zod schemas on all DTOs)
- Output encoding for any user-generated content

---
