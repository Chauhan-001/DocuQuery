import { afterEach, vi } from "vitest";

afterEach(() => {
  vi.clearAllMocks();
});

Object.defineProperty(global, "fetch", {
  value: vi.fn(),
  writable: true,
});