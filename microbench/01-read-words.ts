/**
 * Benchmark 1: readLittleEndianWordsFull
 *
 * Optimization: Remove conditionals from hot path by assuming full 64-byte blocks.
 *
 * From blog.md:
 * > Looking at the source of `readLittleEndianWords` we can see that there are
 * > a few conditionals that could have been left out if we knew that we are
 * > reading a full block of data.
 */

import { benchmark, createResult, generateInput, type BenchmarkResult } from "./utils.js";

export const name = "1. readLittleEndianWordsFull";
export const description = "Remove conditionals from hot path";

// Naive: with bounds checking per iteration
function readWordsNaive(
  input: Uint8Array,
  offset: number,
  words: Uint32Array,
  length: number,
): void {
  for (let i = 0; i < length && offset + 4 <= input.length; i++, offset += 4) {
    words[i] =
      input[offset] |
      (input[offset + 1] << 8) |
      (input[offset + 2] << 16) |
      (input[offset + 3] << 24);
  }
}

// Optimized: assume full 64-byte block (16 words), no conditionals
function readWordsFull(input: Uint8Array, offset: number, words: Uint32Array): void {
  for (let i = 0; i < 16; ++i, offset += 4) {
    words[i] =
      input[offset] |
      (input[offset + 1] << 8) |
      (input[offset + 2] << 16) |
      (input[offset + 3] << 24);
  }
}

export function run(): BenchmarkResult {
  const INPUT_SIZE = 64 * 1024; // 64KB = 1024 blocks
  const input = generateInput(INPUT_SIZE);
  const words = new Uint32Array(16);
  const numBlocks = INPUT_SIZE / 64;

  // Naive benchmark
  const naiveThroughput = benchmark(() => {
    for (let i = 0; i < numBlocks; i++) {
      readWordsNaive(input, i * 64, words, 16);
    }
  }, INPUT_SIZE);

  // Optimized benchmark
  const optimizedThroughput = benchmark(() => {
    for (let i = 0; i < numBlocks; i++) {
      readWordsFull(input, i * 64, words);
    }
  }, INPUT_SIZE);

  return createResult(name, description, naiveThroughput, optimizedThroughput);
}
