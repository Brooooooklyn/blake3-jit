/**
 * Benchmark 10: Arena Pattern (Zero GC Pressure)
 *
 * Optimization: All working buffers live in pre-allocated arena (WASM memory),
 * eliminating JavaScript heap allocations during hashing.
 *
 * This is our key differentiator from other implementations:
 * - Zero GC pressure during hashing
 * - Cache locality (all data in contiguous memory)
 * - Direct WASM access via TypedArray views
 */

import { benchmark, createResult, type BenchmarkResult } from "./utils.js";

export const name = "10. Arena Pattern (Zero GC)";
export const description = "Pre-allocated arena vs JS heap alloc";

// Naive: JS heap allocation for CV stack
class NaiveMerkleTree {
  private cvStack: Uint32Array[] = [];

  pushCV(cv: Uint32Array): void {
    // Allocation every push!
    this.cvStack.push(new Uint32Array(cv));
  }

  popCV(): Uint32Array {
    return this.cvStack.pop()!;
  }

  merge(left: Uint32Array, right: Uint32Array): Uint32Array {
    // Allocation for merged result!
    const result = new Uint32Array(8);
    for (let i = 0; i < 8; i++) {
      result[i] = (left[i] ^ right[i]) >>> 0;
    }
    return result;
  }

  reset(): void {
    this.cvStack = [];
  }

  get length(): number {
    return this.cvStack.length;
  }
}

function hashNaive(numChunks: number): Uint32Array {
  const tree = new NaiveMerkleTree();
  const chunkCv = new Uint32Array(8);

  for (let i = 0; i < numChunks; i++) {
    // Simulate chunk CV
    for (let j = 0; j < 8; j++) {
      chunkCv[j] = ((i * 8 + j) * 0x12345678) >>> 0;
    }

    tree.pushCV(chunkCv);

    // Merge based on trailing zeros
    let totalChunks = i + 1;
    while ((totalChunks & 1) === 0 && tree.length > 1) {
      const right = tree.popCV();
      const left = tree.popCV();
      const merged = tree.merge(left, right);
      tree.pushCV(merged);
      totalChunks >>>= 1;
    }
  }

  // Final merge
  while (tree.length > 1) {
    const right = tree.popCV();
    const left = tree.popCV();
    const merged = tree.merge(left, right);
    tree.pushCV(merged);
  }

  return tree.popCV();
}

// Optimized: Pre-allocated arena (simulating WASM memory layout)
class ArenaMemory {
  // Simulated 64KB WASM page
  private memory: ArrayBuffer;
  private mem32: Uint32Array;

  // Arena layout (matching our WASM implementation)
  private readonly CV_STACK_OFFSET = 5216; // 64 levels × 8 words
  private readonly PARENT_BLOCK_OFFSET = 7264; // 16 words
  // CHUNK_CV would be at 7328 in full implementation

  private cvStackLen = 0;

  constructor() {
    this.memory = new ArrayBuffer(64 * 1024); // 64KB
    this.mem32 = new Uint32Array(this.memory);
  }

  pushCV(cv: Uint32Array): void {
    // No allocation - write to pre-allocated arena
    const offset = (this.CV_STACK_OFFSET >>> 2) + this.cvStackLen * 8;
    for (let i = 0; i < 8; i++) {
      this.mem32[offset + i] = cv[i];
    }
    this.cvStackLen++;
  }

  popCV(): Uint32Array {
    this.cvStackLen--;
    // Return view into arena (no copy)
    return new Uint32Array(this.memory, this.CV_STACK_OFFSET + this.cvStackLen * 32, 8);
  }

  merge(): void {
    // In-place merge using arena memory
    const parentOffset = this.PARENT_BLOCK_OFFSET >>> 2;
    const cvOffset = (this.CV_STACK_OFFSET >>> 2) + (this.cvStackLen - 2) * 8;

    // Copy left and right CVs to parent block (no allocation)
    for (let i = 0; i < 8; i++) {
      this.mem32[parentOffset + i] = this.mem32[cvOffset + i];
      this.mem32[parentOffset + 8 + i] = this.mem32[cvOffset + 8 + i];
    }

    // Simulate compress, write result back to stack
    for (let i = 0; i < 8; i++) {
      this.mem32[cvOffset + i] =
        (this.mem32[parentOffset + i] ^ this.mem32[parentOffset + 8 + i]) >>> 0;
    }

    this.cvStackLen--;
  }

  reset(): void {
    this.cvStackLen = 0;
  }

  get length(): number {
    return this.cvStackLen;
  }

  getResult(): Uint32Array {
    return new Uint32Array(this.memory, this.CV_STACK_OFFSET, 8);
  }
}

// Single arena instance (like our WASM implementation)
const arena = new ArenaMemory();

function hashOptimized(numChunks: number): Uint32Array {
  arena.reset();
  const chunkCv = new Uint32Array(8);

  for (let i = 0; i < numChunks; i++) {
    // Simulate chunk CV
    for (let j = 0; j < 8; j++) {
      chunkCv[j] = ((i * 8 + j) * 0x12345678) >>> 0;
    }

    arena.pushCV(chunkCv);

    // Merge based on trailing zeros
    let totalChunks = i + 1;
    while ((totalChunks & 1) === 0 && arena.length > 1) {
      arena.merge();
      totalChunks >>>= 1;
    }
  }

  // Final merge
  while (arena.length > 1) {
    arena.merge();
  }

  return arena.getResult();
}

export function run(): BenchmarkResult {
  // Test with realistic number of chunks (256KB = 256 chunks)
  const NUM_CHUNKS = 256;
  const INPUT_SIZE = NUM_CHUNKS * 1024; // 256KB

  // Run multiple times to see GC impact
  const ITERATIONS = 100;

  // Naive benchmark
  const naiveThroughput = benchmark(() => {
    for (let iter = 0; iter < ITERATIONS; iter++) {
      hashNaive(NUM_CHUNKS);
    }
  }, INPUT_SIZE * ITERATIONS);

  // Optimized benchmark
  const optimizedThroughput = benchmark(() => {
    for (let iter = 0; iter < ITERATIONS; iter++) {
      hashOptimized(NUM_CHUNKS);
    }
  }, INPUT_SIZE * ITERATIONS);

  return createResult(name, description, naiveThroughput, optimizedThroughput);
}
