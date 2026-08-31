import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "@/lib/crypto";

// Encrypts SMTP passwords, OAuth client secrets and S3 secret keys at rest
// (lib/crypto.ts). Pure functions, no database — safe to test directly.

describe("encryptSecret / decryptSecret", () => {
  it("round-trips a secret", () => {
    const secret = "smtp-app-password-xyz";
    expect(decryptSecret(encryptSecret(secret))).toBe(secret);
  });

  it("round-trips an empty string", () => {
    expect(decryptSecret(encryptSecret(""))).toBe("");
  });

  it("produces different ciphertext each time", () => {
    // A fresh IV per encryption. Identical ciphertext for identical input
    // would leak which integrations share a secret.
    const secret = "same-secret-both-times";
    expect(encryptSecret(secret)).not.toBe(encryptSecret(secret));
  });

  it("does not leave the plaintext visible in the stored value", () => {
    const secret = "do-not-leak-me-please";
    expect(encryptSecret(secret)).not.toContain(secret);
  });

  it("stores iv, auth tag and ciphertext as three hex segments", () => {
    const encrypted = encryptSecret("segment-shape-check");
    const parts = encrypted.split(":");
    expect(parts).toHaveLength(3);
    for (const part of parts) {
      expect(part).toMatch(/^[0-9a-f]+$/);
    }
  });

  it("refuses to decrypt tampered ciphertext", () => {
    // AES-256-GCM is authenticated; flipping a byte must fail loudly rather
    // than return garbage that then gets used as a stored credential.
    const encrypted = encryptSecret("tamper-test-secret");
    const [iv, tag, ciphertext] = encrypted.split(":");
    const flipped = ciphertext.startsWith("a")
      ? `b${ciphertext.slice(1)}`
      : `a${ciphertext.slice(1)}`;
    expect(() => decryptSecret(`${iv}:${tag}:${flipped}`)).toThrow();
  });

  it("refuses to decrypt with a tampered auth tag", () => {
    const encrypted = encryptSecret("tamper-test-secret");
    const [iv, tag, ciphertext] = encrypted.split(":");
    const flipped = tag.startsWith("a")
      ? `b${tag.slice(1)}`
      : `a${tag.slice(1)}`;
    expect(() => decryptSecret(`${iv}:${flipped}:${ciphertext}`)).toThrow();
  });
});
