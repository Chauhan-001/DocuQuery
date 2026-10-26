import { describe, it, expect } from "vitest";
import { formatFileSize, formatDate, truncate } from "../utils/format";

describe("format utilities", () => {
  describe("formatFileSize", () => {
    it("formats bytes correctly", () => {
      expect(formatFileSize(0)).toBe("0 B");
      expect(formatFileSize(500)).toBe("500 B");
      expect(formatFileSize(1024)).toBe("1.0 KB");
      expect(formatFileSize(1536)).toBe("1.5 KB");
      expect(formatFileSize(1024 * 1024)).toBe("1.00 MB");
      expect(formatFileSize(2.5 * 1024 * 1024)).toBe("2.50 MB");
    });
  });

  describe("truncate", () => {
    it("truncates long strings", () => {
      expect(truncate("hello", 10)).toBe("hello");
      expect(truncate("hello world", 8)).toBe("hello w…");
      expect(truncate("", 5)).toBe("");
    });
  });

  describe("formatDate", () => {
    it("formats dates without throwing", () => {
      const date = new Date("2024-01-15T10:30:00Z");
      const result = formatDate(date);
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    });
  });
});