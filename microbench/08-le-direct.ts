/**
 * Benchmark 8: Little-Endian Direct Access - 1.48x speedup!
 *
 * Optimization: On LE systems, create Uint32Array view directly over input buffer.
 *
 * From blog.md:
 * > Blake3 is really Little Endian friendly and since most user-facing systems
 * > are indeed Little Endian, this is really good news and we can take
 * > advantage of it.
 * > Right now even if we are running on a Little Endian machine, we still call
 * > `readLittleEndianFull` in order to read the input data into `blockWords`
 * > first before calling compress, however if we're already on a Little Endian
 * > machine read is useless and we could allow `compress` to read directly
 * > from the input buffer.
 */

import { benchmark, createResult, type BenchmarkResult } from "./utils.js";

export const name = "8. Little-Endian Direct Access";
export const description = "Direct Uint32Array view (1.48x)";

// Endianness check
const IS_LITTLE_ENDIAN = new Uint8Array(new Uint32Array([0x01020304]).buffer)[0] === 0x04;

// Naive: always read byte-by-byte
function readLittleEndianWordsFull(input: Uint8Array, offset: number, words: Uint32Array): void {
  for (let i = 0; i < 16; ++i, offset += 4) {
    words[i] =
      input[offset] |
      (input[offset + 1] << 8) |
      (input[offset + 2] << 16) |
      (input[offset + 3] << 24);
  }
}

function compressWork(block: Uint32Array, blockOffset: number): number {
  let sum = 0;
  for (let i = 0; i < 16; i++) {
    sum = (sum + block[blockOffset + i]) | 0;
  }
  return sum;
}

function hashNaive(input: Uint8Array): number {
  const blockWords = new Uint32Array(16);
  let sum = 0;

  for (let offset = 0; offset + 64 <= input.length; offset += 64) {
    // Always byte-by-byte read (even on LE systems)
    readLittleEndianWordsFull(input, offset, blockWords);
    sum = (sum + compressWork(blockWords, 0)) | 0;
  }

  return sum;
}

// Optimized: create Uint32Array view on LE systems
function hashOptimized(input: Uint8Array): number {
  const blockWords = new Uint32Array(16);
  let sum = 0;

  // Create Uint32Array view over input (no copy!) - only works if aligned
  let inputWords: Uint32Array | null = null;
  const canUseFastPath = IS_LITTLE_ENDIAN && input.byteOffset % 4 === 0;

  if (canUseFastPath) {
    inputWords = new Uint32Array(input.buffer, input.byteOffset, input.byteLength >>> 2);
  }

  for (let offset = 0; offset + 64 <= input.length; offset += 64) {
    if (canUseFastPath && inputWords) {
      // Direct read from Uint32Array view (no byte manipulation!)
      sum = (sum + compressWork(inputWords, offset >>> 2)) | 0;
    } else {
      // Fallback for big-endian or unaligned
      readLittleEndianWordsFull(input, offset, blockWords);
      sum = (sum + compressWork(blockWords, 0)) | 0;
    }
  }

  return sum;
}

export function run(): BenchmarkResult {
  const INPUT_SIZE = 64 * 1024; // 64KB

  // Generate aligned input (for fair comparison)
  const alignedBuffer = new ArrayBuffer(INPUT_SIZE);
  const input = new Uint8Array(alignedBuffer);
  for (let i = 0; i < INPUT_SIZE; i++) {
    input[i] = (Math.random() * 256) | 0;
  }

  // Naive benchmark
  const naiveThroughput = benchmark(() => {
    hashNaive(input);
  }, INPUT_SIZE);

  // Optimized benchmark
  const optimizedThroughput = benchmark(() => {
    hashOptimized(input);
  }, INPUT_SIZE);

  return createResult(name, description, naiveThroughput, optimizedThroughput);
}
