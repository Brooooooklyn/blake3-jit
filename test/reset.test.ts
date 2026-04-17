/**
 * Tests for Hasher.reset() and buffer reuse across finalize/reset cycles.
 *
 * Workload context: Hugging Face Xet content-defined chunking hashes many
 * small chunks in a tight loop; reset() avoids re-allocating Hasher state
 * per chunk.
 */

import { describe, it, expect } from "vitest";

import { hash, createHasher, createKeyed, createDeriveKey, Hasher } from "../src/index.js";

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function generateInput(length: number): Uint8Array {
  const input = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    input[i] = i % 251;
  }
  return input;
}

describe("Hasher.reset()", () => {
  it("matches a fresh Hasher after reset for small inputs", () => {
    const a = generateInput(100);
    const b = generateInput(500);

    const hasher = createHasher();
    hasher.update(a);
    const first = hasher.finalize();
    expect(bytesToHex(first)).toBe(bytesToHex(hash(a)));

    hasher.reset();
    hasher.update(b);
    const second = hasher.finalize();
    expect(bytesToHex(second)).toBe(bytesToHex(hash(b)));
  });

  it("matches a fresh Hasher after reset across chunk boundaries", () => {
    // 2 KiB crosses a chunk boundary (CHUNK_LEN = 1024)
    const first = generateInput(2048);
    // 8 KiB triggers SIMD path (SIMD_THRESHOLD = 4 KiB)
    const second = generateInput(8192);

    const hasher = createHasher();
    hasher.update(first);
    expect(bytesToHex(hasher.finalize())).toBe(bytesToHex(hash(first)));

    hasher.reset();
    hasher.update(second);
    expect(bytesToHex(hasher.finalize())).toBe(bytesToHex(hash(second)));
  });

  it("preserves keyed-hash flags across reset", () => {
    const key = new Uint8Array(32);
    for (let i = 0; i < 32; i++) key[i] = i;

    const m1 = generateInput(73);
    const m2 = generateInput(2000);

    const keyed = createKeyed(key);
    keyed.update(m1);
    const mac1 = keyed.finalize();
    expect(bytesToHex(mac1)).toBe(bytesToHex(Hasher.newKeyed(key).update(m1).finalize()));

    keyed.reset();
    keyed.update(m2);
    const mac2 = keyed.finalize();
    expect(bytesToHex(mac2)).toBe(bytesToHex(Hasher.newKeyed(key).update(m2).finalize()));
  });

  it("preserves derive_key context across reset", () => {
    const context = "blake3-jit reset test v1";
    const ikm1 = generateInput(32);
    const ikm2 = generateInput(1500);

    const kdf = createDeriveKey(context);
    kdf.update(ikm1);
    const derived1 = kdf.finalize(64);
    expect(bytesToHex(derived1)).toBe(
      bytesToHex(createDeriveKey(context).update(ikm1).finalize(64)),
    );

    kdf.reset();
    kdf.update(ikm2);
    const derived2 = kdf.finalize(64);
    expect(bytesToHex(derived2)).toBe(
      bytesToHex(createDeriveKey(context).update(ikm2).finalize(64)),
    );
  });

  it("returns `this` for chaining", () => {
    const hasher = createHasher();
    hasher.update(generateInput(10));
    hasher.finalize();
    const chained = hasher.reset().update(generateInput(20)).finalize();
    expect(chained.length).toBe(32);
  });

  it("handles many reset cycles without drift", () => {
    const hasher = createHasher();
    for (let i = 0; i < 50; i++) {
      const input = generateInput(i * 17 + 1);
      hasher.reset();
      hasher.update(input);
      expect(bytesToHex(hasher.finalize())).toBe(bytesToHex(hash(input)));
    }
  });
});

describe("ChunkState unaligned input", () => {
  // Regression: the LE fast-path used `new Uint32Array(input.buffer, byteOffset, 16)`
  // which throws RangeError when byteOffset is not 4-aligned.
  it("incrementally hashes with an odd byteOffset", () => {
    const raw = new Uint8Array(1025);
    for (let i = 0; i < raw.length; i++) raw[i] = i % 251;
    // subarray(1) makes byteOffset === 1 — misaligned for a Uint32Array view.
    const misaligned = raw.subarray(1);

    const hasher = createHasher();
    hasher.update(misaligned);
    const digest = hasher.finalize();

    // Compare against a fresh aligned copy.
    const aligned = new Uint8Array(misaligned);
    expect(bytesToHex(digest)).toBe(bytesToHex(hash(aligned)));
  });
});
