---
inclusion: auto
description: Build tools, test runners, and development environment configuration
---

# Tooling Guidance

## Shell Command Limitations

The `execute_pwsh` tool in this workspace has unreliable output capture for long or complex PowerShell expressions. Avoid:

- Multi-line heredoc strings (`@" ... "@`) in shell commands
- Complex string manipulation via PowerShell in-line
- Using PowerShell to restructure file content

## Preferred Approaches

1. **File edits**: Use `str_replace` or `fs_write` / `fs_append` directly — never pipe content through PowerShell.
2. **Test execution**: Keep commands short and single-purpose. Use `pnpm --filter <pkg> <script>` for targeted runs.
3. **File restructuring**: Read the file with `read_file`, understand the structure, then use `fs_write` to rewrite it correctly.
4. **Integration test nesting**: All `describe()` blocks that use shared `beforeAll` / `afterAll` fixtures MUST be nested inside the parent `describe` that owns those fixtures. Never append test blocks to the end of the file — they will be outside the lifecycle scope.

## Integration Test File Pattern

```typescript
describe('Service Integration Tests', () => {
  let container: ...;
  let client: ...;

  beforeAll(async () => { /* start container, apply migrations */ });
  afterAll(async () => { /* stop container */ });
  beforeEach(async () => { /* cleanup data */ });

  describe('Feature A', () => {
    it('test 1', async () => { /* uses container, client */ });
  });

  describe('Feature B', () => {
    it('test 2', async () => { /* uses container, client */ });
  });
});

// Helper functions go AFTER the main describe closure
function helperFn() { ... }
```

Never use `fs_append` to add describe blocks to integration test files. Always rewrite the relevant section using `str_replace` or `fs_write`.
