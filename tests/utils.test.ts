import { describe, expect, it } from "vitest";
import { cn, getAvatarColor, getInitials } from "@/lib/utils";

describe("getInitials", () => {
  it("uses the first letter for a single-word name", () => {
    expect(getInitials("Madonna")).toBe("M");
  });

  it("uses first + last letter for a multi-word name", () => {
    expect(getInitials("Jane Doe")).toBe("JD");
    expect(getInitials("Jane Middle Doe")).toBe("JD");
  });

  it("ignores extra whitespace", () => {
    expect(getInitials("  Jane   Doe  ")).toBe("JD");
  });

  it("returns an empty string for empty input", () => {
    expect(getInitials("")).toBe("");
    expect(getInitials("   ")).toBe("");
  });
});

describe("getAvatarColor", () => {
  it("is deterministic for the same seed", () => {
    expect(getAvatarColor("jane@example.com")).toBe(
      getAvatarColor("jane@example.com")
    );
  });

  it("returns a Tailwind background class", () => {
    expect(getAvatarColor("someone")).toMatch(/^bg-\[#[0-9A-F]{6}\]$/);
  });
});

describe("cn", () => {
  it("merges class names and resolves Tailwind conflicts", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });

  it("drops falsy values", () => {
    expect(cn("a", false, undefined, null, "b")).toBe("a b");
  });
});
