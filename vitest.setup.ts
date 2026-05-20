import "@testing-library/jest-dom/vitest";

// Note: `msw` is kept as a devDependency because it's a runtime requirement
// of `@ai-sdk/provider-utils/test` (imported via `ai/test`). Removing it
// breaks tests that use AI SDK test helpers (e.g. tests/lib/answerer.test.ts).
