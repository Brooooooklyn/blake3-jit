/**
 * Benchmark to demonstrate the benefits of Hasher.reset()
 *
 * This benchmark compares:
 * 1. Creating a new Hasher for each hash
 * 2. Reusing a Hasher with reset()
 */

import { createHasher } from "../src/index.js";

const ITERATIONS = 10000;
const DATA_SIZE = 1024; // 1KB

// Create test data
const testData = new Uint8Array(DATA_SIZE);
for (let i = 0; i < DATA_SIZE; i++) {
  testData[i] = i % 256;
}

console.log(`\nBenchmarking Hasher.reset() - ${ITERATIONS} iterations with ${DATA_SIZE} byte chunks\n`);

// Benchmark 1: Creating new Hasher each time
{
  const start = performance.now();

  for (let i = 0; i < ITERATIONS; i++) {
    const hasher = createHasher();
    hasher.update(testData);
    hasher.finalize();
  }

  const end = performance.now();
  const duration = end - start;
  const opsPerSec = (ITERATIONS / duration) * 1000;
  const throughput = (ITERATIONS * DATA_SIZE / duration) * 1000 / (1024 * 1024);

  console.log(`New Hasher each time:`);
  console.log(`  Time: ${duration.toFixed(2)}ms`);
  console.log(`  Ops/sec: ${opsPerSec.toFixed(0)}`);
  console.log(`  Throughput: ${throughput.toFixed(2)} MB/s\n`);
}

// Benchmark 2: Reusing Hasher with reset()
{
  const start = performance.now();
  const hasher = createHasher();

  for (let i = 0; i < ITERATIONS; i++) {
    hasher.reset();
    hasher.update(testData);
    hasher.finalize();
  }

  const end = performance.now();
  const duration = end - start;
  const opsPerSec = (ITERATIONS / duration) * 1000;
  const throughput = (ITERATIONS * DATA_SIZE / duration) * 1000 / (1024 * 1024);

  console.log(`Reusing Hasher with reset():`);
  console.log(`  Time: ${duration.toFixed(2)}ms`);
  console.log(`  Ops/sec: ${opsPerSec.toFixed(0)}`);
  console.log(`  Throughput: ${throughput.toFixed(2)} MB/s\n`);
}
