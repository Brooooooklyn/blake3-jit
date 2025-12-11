/**
 * Benchmark 2: Precomputed Permutations
 *
 * Optimization: Eliminate runtime permutation by precomputing access order table.
 *
 * From blog.md:
 * > Looking at the code above we can see some annoying things, on the top of
 * > the list is the two `new Uint32Array` calls we have which are unnecessary
 * > allocations and moves of bytes that could be avoided.
 */

import { benchmark, createResult, generateInput, type BenchmarkResult } from "./utils.js";

export const name = "2. Precomputed Permutations";
export const description = "Eliminate runtime permute() allocation";

const MSG_PERMUTATION = [2, 6, 3, 10, 7, 0, 4, 13, 1, 11, 12, 5, 9, 14, 15, 8];

// Precomputed access orders for 7 rounds
const PERMUTATIONS = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  [2, 6, 3, 10, 7, 0, 4, 13, 1, 11, 12, 5, 9, 14, 15, 8],
  [3, 4, 10, 12, 13, 2, 7, 14, 6, 5, 9, 0, 11, 15, 8, 1],
  [10, 7, 12, 9, 14, 3, 13, 15, 4, 0, 11, 2, 5, 8, 1, 6],
  [12, 13, 9, 11, 15, 10, 14, 8, 7, 2, 5, 3, 0, 1, 6, 4],
  [9, 14, 11, 5, 8, 12, 15, 1, 13, 3, 0, 10, 2, 6, 4, 7],
  [11, 15, 5, 0, 1, 9, 8, 6, 14, 10, 2, 12, 3, 4, 7, 13],
];

// Naive: runtime permute with allocation
function permuteNaive(m: Uint32Array): void {
  const copy = new Uint32Array(m); // Allocation every call!
  for (let i = 0; i < 16; ++i) {
    m[i] = copy[MSG_PERMUTATION[i]];
  }
}

// Simulate naive compress with permute calls
function compressNaive(block: Uint32Array): number {
  const m = new Uint32Array(block);
  let sum = 0;

  // 7 rounds, each needs permute (except round 0)
  for (let round = 0; round < 7; round++) {
    // Simulate G function accesses
    for (let i = 0; i < 16; i++) {
      sum = (sum + m[i]) | 0;
    }
    if (round < 6) {
      permuteNaive(m);
    }
  }
  return sum;
}

// Optimized: use precomputed access order (no allocation)
function compressOptimized(block: Uint32Array): number {
  let sum = 0;

  // 7 rounds using precomputed permutation indices
  for (let round = 0; round < 7; round++) {
    const p = PERMUTATIONS[round];
    // Access via precomputed order instead of permuting
    for (let i = 0; i < 16; i++) {
      sum = (sum + block[p[i]]) | 0;
    }
  }
  return sum;
}

export function run(): BenchmarkResult {
  const INPUT_SIZE = 64 * 1024; // 64KB
  const input = generateInput(INPUT_SIZE);
  const block = new Uint32Array(16);
  const numBlocks = INPUT_SIZE / 64;

  // Fill block with some data
  for (let i = 0; i < 16; i++) {
    block[i] =
      input[i * 4] | (input[i * 4 + 1] << 8) | (input[i * 4 + 2] << 16) | (input[i * 4 + 3] << 24);
  }

  // Naive benchmark
  const naiveThroughput = benchmark(() => {
    for (let i = 0; i < numBlocks; i++) {
      compressNaive(block);
    }
  }, INPUT_SIZE);

  // Optimized benchmark
  const optimizedThroughput = benchmark(() => {
    for (let i = 0; i < numBlocks; i++) {
      compressOptimized(block);
    }
  }, INPUT_SIZE);

  return createResult(name, description, naiveThroughput, optimizedThroughput);
}
