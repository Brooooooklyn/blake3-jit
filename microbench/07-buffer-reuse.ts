/**
 * Benchmark 7: Reuse Internal Buffers
 *
 * Optimization: Use module-level reusable buffers instead of allocating new ones.
 *
 * From blog.md:
 * > This is a simple change, and the idea is once we create a `Uint32Array`
 * > either for `blockWords` or for `cvStack` we should keep them around and
 * > reuse them as long as they are big enough. We don't need to make a new
 * > one each time.
 */

import { benchmark, createResult, generateInput, type BenchmarkResult } from "./utils.js";

export const name = "7. Reuse Internal Buffers";
export const description = "Module-level buffers vs new per call";

// Naive: allocate new buffers each call
function hashNaive(input: Uint8Array): Uint32Array {
  // New allocations every call!
  const blockWords = new Uint32Array(16);
  const _cvStack = new Uint32Array(64 * 8); // Simulates CV stack allocation
  const out = new Uint32Array(8);
  void _cvStack; // Suppress unused warning - allocation is the point

  // Simulate work using the buffers
  let sum = 0;
  for (let off = 0; off + 64 <= input.length; off += 64) {
    // Read block
    for (let i = 0; i < 16; i++) {
      const byteOff = off + i * 4;
      blockWords[i] =
        input[byteOff] |
        (input[byteOff + 1] << 8) |
        (input[byteOff + 2] << 16) |
        (input[byteOff + 3] << 24);
    }

    // Simulate compress
    for (let i = 0; i < 8; i++) {
      out[i] = (out[i] ^ blockWords[i] ^ blockWords[i + 8]) >>> 0;
    }
    sum = (sum + out[0]) | 0;
  }

  out[0] = sum;
  return out;
}

// Optimized: module-level reusable buffers
const reusableBlockWords = new Uint32Array(16);
const _reusableCvStack = new Uint32Array(64 * 8); // Pre-allocated (would be used in real impl)
const reusableOut = new Uint32Array(8);
void _reusableCvStack; // Suppress unused warning - demonstrates pre-allocation

function hashOptimized(input: Uint8Array): Uint32Array {
  // Reuse pre-allocated buffers
  const blockWords = reusableBlockWords;
  const out = reusableOut;

  // Reset output
  out.fill(0);

  // Simulate work using the buffers
  let sum = 0;
  for (let off = 0; off + 64 <= input.length; off += 64) {
    // Read block
    for (let i = 0; i < 16; i++) {
      const byteOff = off + i * 4;
      blockWords[i] =
        input[byteOff] |
        (input[byteOff + 1] << 8) |
        (input[byteOff + 2] << 16) |
        (input[byteOff + 3] << 24);
    }

    // Simulate compress
    for (let i = 0; i < 8; i++) {
      out[i] = (out[i] ^ blockWords[i] ^ blockWords[i + 8]) >>> 0;
    }
    sum = (sum + out[0]) | 0;
  }

  out[0] = sum;
  return out;
}

export function run(): BenchmarkResult {
  const INPUT_SIZE = 64 * 1024; // 64KB
  const input = generateInput(INPUT_SIZE);

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
