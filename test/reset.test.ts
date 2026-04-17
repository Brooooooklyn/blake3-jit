/**
 * Test suite for Hasher.reset() functionality
 *
 * Tests that the reset method properly reuses internal buffers
 * and produces correct hashes without allocations.
 */

import { describe, it, expect } from "vitest";
import { createHasher, createKeyed, hash } from "../src/index.js";

// Helper to convert Uint8Array to hex string
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

describe("Hasher.reset()", () => {
  it("should reset to initial state", () => {
    const hasher = createHasher();
    const data1 = new Uint8Array([1, 2, 3]);
    const data2 = new Uint8Array([4, 5, 6]);

    // Hash first data
    hasher.update(data1);
    const hash1 = hasher.finalize();

    // Reset and hash second data
    hasher.reset();
    hasher.update(data2);
    const hash2 = hasher.finalize();

    // Verify hashes match one-shot hashing
    expect(bytesToHex(hash1)).toBe(bytesToHex(hash(data1)));
    expect(bytesToHex(hash2)).toBe(bytesToHex(hash(data2)));
  });

  it("should support chaining", () => {
    const hasher = createHasher();
    const data = new Uint8Array([1, 2, 3]);

    const result = hasher.update(data).finalize();
    const result2 = hasher.reset().update(data).finalize();

    expect(bytesToHex(result)).toBe(bytesToHex(result2));
  });

  it("should work with multiple resets", () => {
    const hasher = createHasher();
    const inputs = [
      new Uint8Array([1, 2, 3]),
      new Uint8Array([4, 5, 6, 7]),
      new Uint8Array([8, 9]),
      new Uint8Array([10, 11, 12, 13, 14]),
    ];

    for (const input of inputs) {
      hasher.reset().update(input);
      const hasherResult = hasher.finalize();
      const directResult = hash(input);

      expect(bytesToHex(hasherResult)).toBe(bytesToHex(directResult));
    }
  });

  it("should work with large inputs", () => {
    const hasher = createHasher();
    const largeInput = new Uint8Array(100000);
    for (let i = 0; i < largeInput.length; i++) {
      largeInput[i] = i % 256;
    }

    // Hash twice with reset
    hasher.update(largeInput);
    const hash1 = hasher.finalize();

    hasher.reset();
    hasher.update(largeInput);
    const hash2 = hasher.finalize();

    // Both should match
    expect(bytesToHex(hash1)).toBe(bytesToHex(hash2));
    expect(bytesToHex(hash1)).toBe(bytesToHex(hash(largeInput)));
  });

  it("should work with keyed hashing", () => {
    const key = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      key[i] = i;
    }

    const hasher = createKeyed(key);
    const data1 = new Uint8Array([1, 2, 3]);
    const data2 = new Uint8Array([4, 5, 6]);

    // Hash first data
    hasher.update(data1);
    const hash1 = hasher.finalize();

    // Reset and hash second data
    hasher.reset();
    hasher.update(data2);
    const hash2 = hasher.finalize();

    // Hashes should be different (different data)
    expect(bytesToHex(hash1)).not.toBe(bytesToHex(hash2));

    // Reset again and hash first data - should match original
    hasher.reset();
    hasher.update(data1);
    const hash1Again = hasher.finalize();
    expect(bytesToHex(hash1)).toBe(bytesToHex(hash1Again));
  });

  it("should preserve key/flags after reset", () => {
    const key = new Uint8Array(32);
    crypto.getRandomValues(key);

    const hasher = createKeyed(key);
    const data = new Uint8Array([1, 2, 3, 4, 5]);

    // Get initial hash
    hasher.update(data);
    const initialHash = hasher.finalize();

    // Reset and hash again - should produce same result
    hasher.reset();
    hasher.update(data);
    const resetHash = hasher.finalize();

    expect(bytesToHex(initialHash)).toBe(bytesToHex(resetHash));
  });

  it("should work with incremental updates after reset", () => {
    const hasher = createHasher();
    const chunk1 = new Uint8Array([1, 2, 3]);
    const chunk2 = new Uint8Array([4, 5, 6]);
    const combined = new Uint8Array([1, 2, 3, 4, 5, 6]);

    // First pass: incremental
    hasher.update(chunk1).update(chunk2);
    const hash1 = hasher.finalize();

    // Reset and do it again
    hasher.reset();
    hasher.update(chunk1).update(chunk2);
    const hash2 = hasher.finalize();

    // Should match direct hash of combined data
    expect(bytesToHex(hash1)).toBe(bytesToHex(hash(combined)));
    expect(bytesToHex(hash2)).toBe(bytesToHex(hash(combined)));
  });

  it("should handle reset without any updates", () => {
    const hasher = createHasher();
    const data = new Uint8Array([1, 2, 3]);

    // Update and finalize
    hasher.update(data);
    const _hash1 = hasher.finalize();

    // Reset without updating
    hasher.reset();
    const emptyHash = hasher.finalize();

    // Should match hash of empty input
    expect(bytesToHex(emptyHash)).toBe(bytesToHex(hash(new Uint8Array(0))));
  });

  it("should work with different output lengths", () => {
    const hasher = createHasher();
    const data = new Uint8Array([1, 2, 3, 4, 5]);

    // Test with 32-byte output
    hasher.update(data);
    const _hash32 = hasher.finalize(32);

    // Reset and test with 64-byte output
    hasher.reset();
    hasher.update(data);
    const hash64 = hasher.finalize(64);

    // First 32 bytes should match
    expect(bytesToHex(_hash32)).toBe(bytesToHex(hash64.subarray(0, 32)));
  });
});
