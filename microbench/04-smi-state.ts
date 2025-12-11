/**
 * Benchmark 4: SMI Variables for State (CRITICAL - 2.2x speedup!)
 *
 * Optimization: Use 16 SMI (Small Integer) variables instead of Uint32Array.
 * V8's SMI variables use 32-bit integer ALU, much faster than TypedArray access.
 *
 * From blog.md:
 * > A `Uint32Array` is fast but constantly reading from it and writing to it
 * > might not be the best move, especially if we have a lot of writes.
 * > A call to `g` performs 8 writes and 18 reads.
 * > So what if `state` was not a `Uint32Array` and instead we could use 16
 * > SMI variables?
 */

import { benchmark, createResult, type BenchmarkResult } from "./utils.js";

export const name = "4. SMI Variables for State";
export const description = "Use SMI variables vs Uint32Array (2.2x)";

const MSG_ACCESS = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 2, 6, 3, 10, 7, 0, 4, 13, 1, 11, 12, 5, 9,
  14, 15, 8, 3, 4, 10, 12, 13, 2, 7, 14, 6, 5, 9, 0, 11, 15, 8, 1, 10, 7, 12, 9, 14, 3, 13, 15, 4,
  0, 11, 2, 5, 8, 1, 6, 12, 13, 9, 11, 15, 10, 14, 8, 7, 2, 5, 3, 0, 1, 6, 4, 9, 14, 11, 5, 8, 12,
  15, 1, 13, 3, 0, 10, 2, 6, 4, 7, 11, 15, 5, 0, 1, 9, 8, 6, 14, 10, 2, 12, 3, 4, 7, 13,
];

// Naive: Uint32Array for state
function compressNaive(
  cv: Uint32Array,
  m: Uint32Array,
  counter: number,
  blockLen: number,
  flags: number,
  out: Uint32Array,
): void {
  const state = new Uint32Array(16);
  state[0] = cv[0];
  state[1] = cv[1];
  state[2] = cv[2];
  state[3] = cv[3];
  state[4] = cv[4];
  state[5] = cv[5];
  state[6] = cv[6];
  state[7] = cv[7];
  state[8] = 0x6a09e667;
  state[9] = 0xbb67ae85;
  state[10] = 0x3c6ef372;
  state[11] = 0xa54ff53a;
  state[12] = counter | 0;
  state[13] = (counter / 0x100000000) | 0;
  state[14] = blockLen | 0;
  state[15] = flags | 0;

  let p = 0;
  for (let round = 0; round < 7; round++) {
    // G(0, 4, 8, 12)
    state[0] = (((state[0] + state[4]) | 0) + m[MSG_ACCESS[p++]]) | 0;
    state[12] ^= state[0];
    state[12] = (state[12] >>> 16) | (state[12] << 16);
    state[8] = (state[8] + state[12]) | 0;
    state[4] ^= state[8];
    state[4] = (state[4] >>> 12) | (state[4] << 20);
    state[0] = (((state[0] + state[4]) | 0) + m[MSG_ACCESS[p++]]) | 0;
    state[12] ^= state[0];
    state[12] = (state[12] >>> 8) | (state[12] << 24);
    state[8] = (state[8] + state[12]) | 0;
    state[4] ^= state[8];
    state[4] = (state[4] >>> 7) | (state[4] << 25);

    // G(1, 5, 9, 13)
    state[1] = (((state[1] + state[5]) | 0) + m[MSG_ACCESS[p++]]) | 0;
    state[13] ^= state[1];
    state[13] = (state[13] >>> 16) | (state[13] << 16);
    state[9] = (state[9] + state[13]) | 0;
    state[5] ^= state[9];
    state[5] = (state[5] >>> 12) | (state[5] << 20);
    state[1] = (((state[1] + state[5]) | 0) + m[MSG_ACCESS[p++]]) | 0;
    state[13] ^= state[1];
    state[13] = (state[13] >>> 8) | (state[13] << 24);
    state[9] = (state[9] + state[13]) | 0;
    state[5] ^= state[9];
    state[5] = (state[5] >>> 7) | (state[5] << 25);

    // G(2, 6, 10, 14)
    state[2] = (((state[2] + state[6]) | 0) + m[MSG_ACCESS[p++]]) | 0;
    state[14] ^= state[2];
    state[14] = (state[14] >>> 16) | (state[14] << 16);
    state[10] = (state[10] + state[14]) | 0;
    state[6] ^= state[10];
    state[6] = (state[6] >>> 12) | (state[6] << 20);
    state[2] = (((state[2] + state[6]) | 0) + m[MSG_ACCESS[p++]]) | 0;
    state[14] ^= state[2];
    state[14] = (state[14] >>> 8) | (state[14] << 24);
    state[10] = (state[10] + state[14]) | 0;
    state[6] ^= state[10];
    state[6] = (state[6] >>> 7) | (state[6] << 25);

    // G(3, 7, 11, 15)
    state[3] = (((state[3] + state[7]) | 0) + m[MSG_ACCESS[p++]]) | 0;
    state[15] ^= state[3];
    state[15] = (state[15] >>> 16) | (state[15] << 16);
    state[11] = (state[11] + state[15]) | 0;
    state[7] ^= state[11];
    state[7] = (state[7] >>> 12) | (state[7] << 20);
    state[3] = (((state[3] + state[7]) | 0) + m[MSG_ACCESS[p++]]) | 0;
    state[15] ^= state[3];
    state[15] = (state[15] >>> 8) | (state[15] << 24);
    state[11] = (state[11] + state[15]) | 0;
    state[7] ^= state[11];
    state[7] = (state[7] >>> 7) | (state[7] << 25);

    // G(0, 5, 10, 15)
    state[0] = (((state[0] + state[5]) | 0) + m[MSG_ACCESS[p++]]) | 0;
    state[15] ^= state[0];
    state[15] = (state[15] >>> 16) | (state[15] << 16);
    state[10] = (state[10] + state[15]) | 0;
    state[5] ^= state[10];
    state[5] = (state[5] >>> 12) | (state[5] << 20);
    state[0] = (((state[0] + state[5]) | 0) + m[MSG_ACCESS[p++]]) | 0;
    state[15] ^= state[0];
    state[15] = (state[15] >>> 8) | (state[15] << 24);
    state[10] = (state[10] + state[15]) | 0;
    state[5] ^= state[10];
    state[5] = (state[5] >>> 7) | (state[5] << 25);

    // G(1, 6, 11, 12)
    state[1] = (((state[1] + state[6]) | 0) + m[MSG_ACCESS[p++]]) | 0;
    state[12] ^= state[1];
    state[12] = (state[12] >>> 16) | (state[12] << 16);
    state[11] = (state[11] + state[12]) | 0;
    state[6] ^= state[11];
    state[6] = (state[6] >>> 12) | (state[6] << 20);
    state[1] = (((state[1] + state[6]) | 0) + m[MSG_ACCESS[p++]]) | 0;
    state[12] ^= state[1];
    state[12] = (state[12] >>> 8) | (state[12] << 24);
    state[11] = (state[11] + state[12]) | 0;
    state[6] ^= state[11];
    state[6] = (state[6] >>> 7) | (state[6] << 25);

    // G(2, 7, 8, 13)
    state[2] = (((state[2] + state[7]) | 0) + m[MSG_ACCESS[p++]]) | 0;
    state[13] ^= state[2];
    state[13] = (state[13] >>> 16) | (state[13] << 16);
    state[8] = (state[8] + state[13]) | 0;
    state[7] ^= state[8];
    state[7] = (state[7] >>> 12) | (state[7] << 20);
    state[2] = (((state[2] + state[7]) | 0) + m[MSG_ACCESS[p++]]) | 0;
    state[13] ^= state[2];
    state[13] = (state[13] >>> 8) | (state[13] << 24);
    state[8] = (state[8] + state[13]) | 0;
    state[7] ^= state[8];
    state[7] = (state[7] >>> 7) | (state[7] << 25);

    // G(3, 4, 9, 14)
    state[3] = (((state[3] + state[4]) | 0) + m[MSG_ACCESS[p++]]) | 0;
    state[14] ^= state[3];
    state[14] = (state[14] >>> 16) | (state[14] << 16);
    state[9] = (state[9] + state[14]) | 0;
    state[4] ^= state[9];
    state[4] = (state[4] >>> 12) | (state[4] << 20);
    state[3] = (((state[3] + state[4]) | 0) + m[MSG_ACCESS[p++]]) | 0;
    state[14] ^= state[3];
    state[14] = (state[14] >>> 8) | (state[14] << 24);
    state[9] = (state[9] + state[14]) | 0;
    state[4] ^= state[9];
    state[4] = (state[4] >>> 7) | (state[4] << 25);
  }

  out[0] = state[0] ^ state[8];
  out[1] = state[1] ^ state[9];
  out[2] = state[2] ^ state[10];
  out[3] = state[3] ^ state[11];
  out[4] = state[4] ^ state[12];
  out[5] = state[5] ^ state[13];
  out[6] = state[6] ^ state[14];
  out[7] = state[7] ^ state[15];
}

// Optimized: 16 SMI variables for state
function compressOptimized(
  cv: Uint32Array,
  m: Uint32Array,
  counter: number,
  blockLen: number,
  flags: number,
  out: Uint32Array,
): void {
  // SMI variables for state
  let s_0 = cv[0] | 0;
  let s_1 = cv[1] | 0;
  let s_2 = cv[2] | 0;
  let s_3 = cv[3] | 0;
  let s_4 = cv[4] | 0;
  let s_5 = cv[5] | 0;
  let s_6 = cv[6] | 0;
  let s_7 = cv[7] | 0;
  let s_8 = 0x6a09e667;
  let s_9 = 0xbb67ae85;
  let s_10 = 0x3c6ef372;
  let s_11 = 0xa54ff53a;
  let s_12 = counter | 0;
  let s_13 = (counter / 0x100000000) | 0;
  let s_14 = blockLen | 0;
  let s_15 = flags | 0;

  let p = 0;
  for (let round = 0; round < 7; round++) {
    // G(0, 4, 8, 12)
    s_0 = (((s_0 + s_4) | 0) + m[MSG_ACCESS[p++]]) | 0;
    s_12 ^= s_0;
    s_12 = (s_12 >>> 16) | (s_12 << 16);
    s_8 = (s_8 + s_12) | 0;
    s_4 ^= s_8;
    s_4 = (s_4 >>> 12) | (s_4 << 20);
    s_0 = (((s_0 + s_4) | 0) + m[MSG_ACCESS[p++]]) | 0;
    s_12 ^= s_0;
    s_12 = (s_12 >>> 8) | (s_12 << 24);
    s_8 = (s_8 + s_12) | 0;
    s_4 ^= s_8;
    s_4 = (s_4 >>> 7) | (s_4 << 25);

    // G(1, 5, 9, 13)
    s_1 = (((s_1 + s_5) | 0) + m[MSG_ACCESS[p++]]) | 0;
    s_13 ^= s_1;
    s_13 = (s_13 >>> 16) | (s_13 << 16);
    s_9 = (s_9 + s_13) | 0;
    s_5 ^= s_9;
    s_5 = (s_5 >>> 12) | (s_5 << 20);
    s_1 = (((s_1 + s_5) | 0) + m[MSG_ACCESS[p++]]) | 0;
    s_13 ^= s_1;
    s_13 = (s_13 >>> 8) | (s_13 << 24);
    s_9 = (s_9 + s_13) | 0;
    s_5 ^= s_9;
    s_5 = (s_5 >>> 7) | (s_5 << 25);

    // G(2, 6, 10, 14)
    s_2 = (((s_2 + s_6) | 0) + m[MSG_ACCESS[p++]]) | 0;
    s_14 ^= s_2;
    s_14 = (s_14 >>> 16) | (s_14 << 16);
    s_10 = (s_10 + s_14) | 0;
    s_6 ^= s_10;
    s_6 = (s_6 >>> 12) | (s_6 << 20);
    s_2 = (((s_2 + s_6) | 0) + m[MSG_ACCESS[p++]]) | 0;
    s_14 ^= s_2;
    s_14 = (s_14 >>> 8) | (s_14 << 24);
    s_10 = (s_10 + s_14) | 0;
    s_6 ^= s_10;
    s_6 = (s_6 >>> 7) | (s_6 << 25);

    // G(3, 7, 11, 15)
    s_3 = (((s_3 + s_7) | 0) + m[MSG_ACCESS[p++]]) | 0;
    s_15 ^= s_3;
    s_15 = (s_15 >>> 16) | (s_15 << 16);
    s_11 = (s_11 + s_15) | 0;
    s_7 ^= s_11;
    s_7 = (s_7 >>> 12) | (s_7 << 20);
    s_3 = (((s_3 + s_7) | 0) + m[MSG_ACCESS[p++]]) | 0;
    s_15 ^= s_3;
    s_15 = (s_15 >>> 8) | (s_15 << 24);
    s_11 = (s_11 + s_15) | 0;
    s_7 ^= s_11;
    s_7 = (s_7 >>> 7) | (s_7 << 25);

    // G(0, 5, 10, 15)
    s_0 = (((s_0 + s_5) | 0) + m[MSG_ACCESS[p++]]) | 0;
    s_15 ^= s_0;
    s_15 = (s_15 >>> 16) | (s_15 << 16);
    s_10 = (s_10 + s_15) | 0;
    s_5 ^= s_10;
    s_5 = (s_5 >>> 12) | (s_5 << 20);
    s_0 = (((s_0 + s_5) | 0) + m[MSG_ACCESS[p++]]) | 0;
    s_15 ^= s_0;
    s_15 = (s_15 >>> 8) | (s_15 << 24);
    s_10 = (s_10 + s_15) | 0;
    s_5 ^= s_10;
    s_5 = (s_5 >>> 7) | (s_5 << 25);

    // G(1, 6, 11, 12)
    s_1 = (((s_1 + s_6) | 0) + m[MSG_ACCESS[p++]]) | 0;
    s_12 ^= s_1;
    s_12 = (s_12 >>> 16) | (s_12 << 16);
    s_11 = (s_11 + s_12) | 0;
    s_6 ^= s_11;
    s_6 = (s_6 >>> 12) | (s_6 << 20);
    s_1 = (((s_1 + s_6) | 0) + m[MSG_ACCESS[p++]]) | 0;
    s_12 ^= s_1;
    s_12 = (s_12 >>> 8) | (s_12 << 24);
    s_11 = (s_11 + s_12) | 0;
    s_6 ^= s_11;
    s_6 = (s_6 >>> 7) | (s_6 << 25);

    // G(2, 7, 8, 13)
    s_2 = (((s_2 + s_7) | 0) + m[MSG_ACCESS[p++]]) | 0;
    s_13 ^= s_2;
    s_13 = (s_13 >>> 16) | (s_13 << 16);
    s_8 = (s_8 + s_13) | 0;
    s_7 ^= s_8;
    s_7 = (s_7 >>> 12) | (s_7 << 20);
    s_2 = (((s_2 + s_7) | 0) + m[MSG_ACCESS[p++]]) | 0;
    s_13 ^= s_2;
    s_13 = (s_13 >>> 8) | (s_13 << 24);
    s_8 = (s_8 + s_13) | 0;
    s_7 ^= s_8;
    s_7 = (s_7 >>> 7) | (s_7 << 25);

    // G(3, 4, 9, 14)
    s_3 = (((s_3 + s_4) | 0) + m[MSG_ACCESS[p++]]) | 0;
    s_14 ^= s_3;
    s_14 = (s_14 >>> 16) | (s_14 << 16);
    s_9 = (s_9 + s_14) | 0;
    s_4 ^= s_9;
    s_4 = (s_4 >>> 12) | (s_4 << 20);
    s_3 = (((s_3 + s_4) | 0) + m[MSG_ACCESS[p++]]) | 0;
    s_14 ^= s_3;
    s_14 = (s_14 >>> 8) | (s_14 << 24);
    s_9 = (s_9 + s_14) | 0;
    s_4 ^= s_9;
    s_4 = (s_4 >>> 7) | (s_4 << 25);
  }

  out[0] = s_0 ^ s_8;
  out[1] = s_1 ^ s_9;
  out[2] = s_2 ^ s_10;
  out[3] = s_3 ^ s_11;
  out[4] = s_4 ^ s_12;
  out[5] = s_5 ^ s_13;
  out[6] = s_6 ^ s_14;
  out[7] = s_7 ^ s_15;
}

export function run(): BenchmarkResult {
  const INPUT_SIZE = 64 * 1024; // 64KB
  const numBlocks = INPUT_SIZE / 64;

  const cv = new Uint32Array(8);
  const m = new Uint32Array(16);
  const out = new Uint32Array(8);

  for (let i = 0; i < 16; i++) {
    m[i] = (Math.random() * 0xffffffff) | 0;
  }
  for (let i = 0; i < 8; i++) {
    cv[i] = (Math.random() * 0xffffffff) | 0;
  }

  // Naive benchmark
  const naiveThroughput = benchmark(() => {
    for (let i = 0; i < numBlocks; i++) {
      compressNaive(cv, m, i, 64, 0, out);
    }
  }, INPUT_SIZE);

  // Optimized benchmark
  const optimizedThroughput = benchmark(() => {
    for (let i = 0; i < numBlocks; i++) {
      compressOptimized(cv, m, i, 64, 0, out);
    }
  }, INPUT_SIZE);

  return createResult(name, description, naiveThroughput, optimizedThroughput);
}
