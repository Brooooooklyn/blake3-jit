/**
 * Benchmark 3: Inline Round into Compress
 *
 * Optimization: Eliminate function call overhead by inlining rounds into compress.
 *
 * From blog.md:
 * > Continuing to focus on the previous area we can also see that there is no
 * > strong need for `round` to be its own function if we could just do the
 * > same job in `compress` we could maybe use a for loop even for the 7 rounds
 * > we have.
 */

import { benchmark, createResult, type BenchmarkResult } from "./utils.js";

export const name = "3. Inline Round into Compress";
export const description = "Eliminate function call overhead";

// Naive: separate G and round functions
function gNaive(
  state: Uint32Array,
  a: number,
  b: number,
  c: number,
  d: number,
  mx: number,
  my: number,
): void {
  state[a] = (((state[a] + state[b]) | 0) + mx) | 0;
  state[d] ^= state[a];
  state[d] = (state[d] >>> 16) | (state[d] << 16);
  state[c] = (state[c] + state[d]) | 0;
  state[b] ^= state[c];
  state[b] = (state[b] >>> 12) | (state[b] << 20);

  state[a] = (((state[a] + state[b]) | 0) + my) | 0;
  state[d] ^= state[a];
  state[d] = (state[d] >>> 8) | (state[d] << 24);
  state[c] = (state[c] + state[d]) | 0;
  state[b] ^= state[c];
  state[b] = (state[b] >>> 7) | (state[b] << 25);
}

function roundNaive(state: Uint32Array, m: Uint32Array, p: number[]): void {
  // Mix the columns
  gNaive(state, 0, 4, 8, 12, m[p[0]], m[p[1]]);
  gNaive(state, 1, 5, 9, 13, m[p[2]], m[p[3]]);
  gNaive(state, 2, 6, 10, 14, m[p[4]], m[p[5]]);
  gNaive(state, 3, 7, 11, 15, m[p[6]], m[p[7]]);
  // Mix the diagonals
  gNaive(state, 0, 5, 10, 15, m[p[8]], m[p[9]]);
  gNaive(state, 1, 6, 11, 12, m[p[10]], m[p[11]]);
  gNaive(state, 2, 7, 8, 13, m[p[12]], m[p[13]]);
  gNaive(state, 3, 4, 9, 14, m[p[14]], m[p[15]]);
}

const PERMUTATIONS = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  [2, 6, 3, 10, 7, 0, 4, 13, 1, 11, 12, 5, 9, 14, 15, 8],
  [3, 4, 10, 12, 13, 2, 7, 14, 6, 5, 9, 0, 11, 15, 8, 1],
  [10, 7, 12, 9, 14, 3, 13, 15, 4, 0, 11, 2, 5, 8, 1, 6],
  [12, 13, 9, 11, 15, 10, 14, 8, 7, 2, 5, 3, 0, 1, 6, 4],
  [9, 14, 11, 5, 8, 12, 15, 1, 13, 3, 0, 10, 2, 6, 4, 7],
  [11, 15, 5, 0, 1, 9, 8, 6, 14, 10, 2, 12, 3, 4, 7, 13],
];

function compressNaive(state: Uint32Array, m: Uint32Array): void {
  for (let i = 0; i < 7; i++) {
    roundNaive(state, m, PERMUTATIONS[i]);
  }
}

// Optimized: inlined G calls directly in compress
function compressOptimized(state: Uint32Array, m: Uint32Array): void {
  // Flatten permutation access
  const MSG_ACCESS = [
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 2, 6, 3, 10, 7, 0, 4, 13, 1, 11, 12, 5, 9,
    14, 15, 8, 3, 4, 10, 12, 13, 2, 7, 14, 6, 5, 9, 0, 11, 15, 8, 1, 10, 7, 12, 9, 14, 3, 13, 15, 4,
    0, 11, 2, 5, 8, 1, 6, 12, 13, 9, 11, 15, 10, 14, 8, 7, 2, 5, 3, 0, 1, 6, 4, 9, 14, 11, 5, 8, 12,
    15, 1, 13, 3, 0, 10, 2, 6, 4, 7, 11, 15, 5, 0, 1, 9, 8, 6, 14, 10, 2, 12, 3, 4, 7, 13,
  ];

  let p = 0;
  for (let round = 0; round < 7; round++) {
    // Inlined column mixing
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

    // Inlined diagonal mixing
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
}

export function run(): BenchmarkResult {
  const INPUT_SIZE = 64 * 1024; // 64KB
  const numBlocks = INPUT_SIZE / 64;

  const state = new Uint32Array(16);
  const m = new Uint32Array(16);
  for (let i = 0; i < 16; i++) {
    m[i] = (Math.random() * 0xffffffff) | 0;
  }

  // Naive benchmark
  const naiveThroughput = benchmark(() => {
    for (let i = 0; i < numBlocks; i++) {
      state.fill(0);
      compressNaive(state, m);
    }
  }, INPUT_SIZE);

  // Optimized benchmark
  const optimizedThroughput = benchmark(() => {
    for (let i = 0; i < numBlocks; i++) {
      state.fill(0);
      compressOptimized(state, m);
    }
  }, INPUT_SIZE);

  return createResult(name, description, naiveThroughput, optimizedThroughput);
}
