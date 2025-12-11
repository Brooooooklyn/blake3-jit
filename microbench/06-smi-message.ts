/**
 * Benchmark 6: SMI Variables for Message Words
 *
 * Optimization: Use 16 SMI variables for message words + cycle-based permutation.
 *
 * From blog.md:
 * > Similar to step 4, our goal here is to do the same thing we did with
 * > `state` but this time with `blockWords`.
 * > This means that we have to give up on the `PERMUTATIONS` table that we
 * > so painfully generated and do the permutations by actually swapping the
 * > variables because we can not have dynamic access to variables.
 */

import { benchmark, createResult, type BenchmarkResult } from "./utils.js";

export const name = "6. SMI Variables for Message";
export const description = "SMI variables + cycle-based swap";

const MSG_ACCESS = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 2, 6, 3, 10, 7, 0, 4, 13, 1, 11, 12, 5, 9,
  14, 15, 8, 3, 4, 10, 12, 13, 2, 7, 14, 6, 5, 9, 0, 11, 15, 8, 1, 10, 7, 12, 9, 14, 3, 13, 15, 4,
  0, 11, 2, 5, 8, 1, 6, 12, 13, 9, 11, 15, 10, 14, 8, 7, 2, 5, 3, 0, 1, 6, 4, 9, 14, 11, 5, 8, 12,
  15, 1, 13, 3, 0, 10, 2, 6, 4, 7, 11, 15, 5, 0, 1, 9, 8, 6, 14, 10, 2, 12, 3, 4, 7, 13,
];

// Naive: array access with lookup table
function compressNaive(m: Uint32Array): number {
  let sum = 0;
  let p = 0;
  for (let round = 0; round < 7; round++) {
    for (let g = 0; g < 8; g++) {
      sum = (sum + m[MSG_ACCESS[p++]]) | 0;
      sum = (sum + m[MSG_ACCESS[p++]]) | 0;
    }
  }
  return sum;
}

// Optimized: SMI variables with cycle-based permutation swaps
function compressOptimized(blockWords: Uint32Array, blockOff: number): number {
  // Load into SMI variables
  let m_0 = blockWords[blockOff + 0] | 0;
  let m_1 = blockWords[blockOff + 1] | 0;
  let m_2 = blockWords[blockOff + 2] | 0;
  let m_3 = blockWords[blockOff + 3] | 0;
  let m_4 = blockWords[blockOff + 4] | 0;
  let m_5 = blockWords[blockOff + 5] | 0;
  let m_6 = blockWords[blockOff + 6] | 0;
  let m_7 = blockWords[blockOff + 7] | 0;
  let m_8 = blockWords[blockOff + 8] | 0;
  let m_9 = blockWords[blockOff + 9] | 0;
  let m_10 = blockWords[blockOff + 10] | 0;
  let m_11 = blockWords[blockOff + 11] | 0;
  let m_12 = blockWords[blockOff + 12] | 0;
  let m_13 = blockWords[blockOff + 13] | 0;
  let m_14 = blockWords[blockOff + 14] | 0;
  let m_15 = blockWords[blockOff + 15] | 0;

  let sum = 0;

  for (let i = 0; i < 7; i++) {
    // Direct variable access instead of array lookup
    sum = (sum + m_0) | 0;
    sum = (sum + m_1) | 0;
    sum = (sum + m_2) | 0;
    sum = (sum + m_3) | 0;
    sum = (sum + m_4) | 0;
    sum = (sum + m_5) | 0;
    sum = (sum + m_6) | 0;
    sum = (sum + m_7) | 0;
    sum = (sum + m_8) | 0;
    sum = (sum + m_9) | 0;
    sum = (sum + m_10) | 0;
    sum = (sum + m_11) | 0;
    sum = (sum + m_12) | 0;
    sum = (sum + m_13) | 0;
    sum = (sum + m_14) | 0;
    sum = (sum + m_15) | 0;

    // Cycle-based permutation swap (only 2 temps needed!)
    if (i !== 6) {
      const t0 = m_0;
      const t1 = m_1;
      m_0 = m_2;
      m_2 = m_3;
      m_3 = m_10;
      m_10 = m_12;
      m_12 = m_9;
      m_9 = m_11;
      m_11 = m_5;
      m_5 = t0;
      m_1 = m_6;
      m_6 = m_4;
      m_4 = m_7;
      m_7 = m_13;
      m_13 = m_14;
      m_14 = m_15;
      m_15 = m_8;
      m_8 = t1;
    }
  }

  return sum;
}

export function run(): BenchmarkResult {
  const INPUT_SIZE = 64 * 1024; // 64KB
  const numBlocks = INPUT_SIZE / 64;

  const m = new Uint32Array(16);
  for (let i = 0; i < 16; i++) {
    m[i] = (Math.random() * 0xffffffff) | 0;
  }

  // Naive benchmark
  const naiveThroughput = benchmark(() => {
    for (let i = 0; i < numBlocks; i++) {
      compressNaive(m);
    }
  }, INPUT_SIZE);

  // Optimized benchmark
  const optimizedThroughput = benchmark(() => {
    for (let i = 0; i < numBlocks; i++) {
      compressOptimized(m, 0);
    }
  }, INPUT_SIZE);

  return createResult(name, description, naiveThroughput, optimizedThroughput);
}
