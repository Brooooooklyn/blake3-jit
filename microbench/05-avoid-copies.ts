/**
 * Benchmark 5: Avoid Copies (Pointer Simulation) - 3x speedup!
 *
 * Optimization: Pass offsets instead of creating new TypedArray views.
 *
 * From blog.md:
 * > We have already seen the impact not copying data around into temporary
 * > places can have on performance. So in this step, our goal is simple,
 * > instead of giving data to `compress` and getting data back, what if we
 * > could use pointers and have an _in-place_ implementation of `compress`?
 */

import { benchmark, createResult, generateInput, type BenchmarkResult } from "./utils.js";

export const name = "5. Avoid Copies (Pointer Sim)";
export const description = "Pass offsets vs .subarray() (3x)";

// Naive: create new views with .subarray()
function compressNaive(
  cv: Uint32Array, // 8 words view
  block: Uint32Array, // 16 words view
  counter: number,
  flags: number,
): Uint32Array {
  // Creates new Uint32Array (allocation!)
  const result = new Uint32Array(8);

  // Simulate compression work
  for (let i = 0; i < 8; i++) {
    result[i] = (cv[i] ^ block[i] ^ block[i + 8] ^ (counter | 0) ^ (flags | 0)) >>> 0;
  }

  return result;
}

function hashNaive(input: Uint32Array, numBlocks: number): Uint32Array {
  let cv: Uint32Array = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);

  for (let i = 0; i < numBlocks; i++) {
    // .subarray() creates new TypedArray view (allocation!)
    const block = input.subarray(i * 16, (i + 1) * 16);
    cv = compressNaive(cv, block as Uint32Array, i, 0);
  }

  return cv;
}

// Optimized: pass buffer + offset (no allocations)
function compressOptimized(
  cv: Uint32Array,
  cvOffset: number,
  block: Uint32Array,
  blockOffset: number,
  out: Uint32Array,
  outOffset: number,
  counter: number,
  flags: number,
): void {
  // No allocation - write directly to output buffer at offset
  for (let i = 0; i < 8; i++) {
    out[outOffset + i] =
      (cv[cvOffset + i] ^
        block[blockOffset + i] ^
        block[blockOffset + i + 8] ^
        (counter | 0) ^
        (flags | 0)) >>>
      0;
  }
}

function hashOptimized(input: Uint32Array, numBlocks: number): Uint32Array {
  // Single buffer for CV stack
  const cvStack = new Uint32Array(8);
  cvStack[0] = 0x6a09e667;
  cvStack[1] = 0xbb67ae85;
  cvStack[2] = 0x3c6ef372;
  cvStack[3] = 0xa54ff53a;
  cvStack[4] = 0x510e527f;
  cvStack[5] = 0x9b05688c;
  cvStack[6] = 0x1f83d9ab;
  cvStack[7] = 0x5be0cd19;

  for (let i = 0; i < numBlocks; i++) {
    // Pass offset instead of creating view
    // cv == out allows in-place update
    compressOptimized(cvStack, 0, input, i * 16, cvStack, 0, i, 0);
  }

  return cvStack;
}

export function run(): BenchmarkResult {
  const INPUT_SIZE = 64 * 1024; // 64KB
  const input = generateInput(INPUT_SIZE);

  // Convert to Uint32Array
  const inputWords = new Uint32Array(INPUT_SIZE / 4);
  for (let i = 0; i < inputWords.length; i++) {
    const off = i * 4;
    inputWords[i] =
      input[off] | (input[off + 1] << 8) | (input[off + 2] << 16) | (input[off + 3] << 24);
  }

  const numBlocks = INPUT_SIZE / 64;

  // Naive benchmark
  const naiveThroughput = benchmark(() => {
    hashNaive(inputWords, numBlocks);
  }, INPUT_SIZE);

  // Optimized benchmark
  const optimizedThroughput = benchmark(() => {
    hashOptimized(inputWords, numBlocks);
  }, INPUT_SIZE);

  return createResult(name, description, naiveThroughput, optimizedThroughput);
}
