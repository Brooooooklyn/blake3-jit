/**
 * BLAKE3 Benchmark Suite
 *
 * Measures throughput at various input sizes.
 * Run with: npx tsx bench/benchmark.ts
 */

import { hash, warmupSimd } from "../src/index.js";

// Benchmark sizes
const BENCH_SIZES = [
  ["96B", 96],
  ["512B", 512],
  ["1KB", 1024],
  ["32KB", 32 * 1024],
  ["64KB", 64 * 1024],
  ["256KB", 256 * 1024],
  ["1MB", 1024 * 1024],
] as const;

// Number of iterations for each size
const MIN_DURATION_MS = 1000; // Run each benchmark for at least 1 second
const WARMUP_ITERATIONS = 100;

// Generate random input
function generateInput(length: number): Uint8Array {
  const input = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    input[i] = (Math.random() * 256) | 0;
  }
  return input;
}

// High-resolution timer
function now(): number {
  if (typeof performance !== "undefined") {
    return performance.now();
  }
  // Node.js fallback
  const [sec, nsec] = process.hrtime();
  return sec * 1000 + nsec / 1e6;
}

// Format bytes per second
function formatThroughput(bytesPerMs: number): string {
  const bytesPerSec = bytesPerMs * 1000;
  if (bytesPerSec >= 1e9) {
    return `${(bytesPerSec / 1e9).toFixed(2)} GB/s`;
  } else if (bytesPerSec >= 1e6) {
    return `${(bytesPerSec / 1e6).toFixed(2)} MB/s`;
  } else if (bytesPerSec >= 1e3) {
    return `${(bytesPerSec / 1e3).toFixed(2)} KB/s`;
  }
  return `${bytesPerSec.toFixed(2)} B/s`;
}

// Run a single benchmark
function runBenchmark(
  name: string,
  input: Uint8Array,
): {
  name: string;
  throughput: number;
  opsPerSec: number;
  iterations: number;
} {
  // Warmup
  for (let i = 0; i < WARMUP_ITERATIONS; i++) {
    hash(input);
  }

  // Measure
  let iterations = 0;
  const startTime = now();
  let elapsed = 0;

  while (elapsed < MIN_DURATION_MS) {
    hash(input);
    iterations++;
    elapsed = now() - startTime;
  }

  const bytesHashed = iterations * input.length;
  const throughput = bytesHashed / elapsed; // bytes per ms
  const opsPerSec = (iterations / elapsed) * 1000;

  return { name, throughput, opsPerSec, iterations };
}

// Main benchmark runner
async function main() {
  console.log("BLAKE3 Benchmark Suite");
  console.log("======================\n");

  // Pre-warm SIMD (hash() auto-initializes, but this avoids first-call latency)
  await warmupSimd();

  // Run benchmarks
  console.log("Input Size | Throughput | Ops/sec | Iterations");
  console.log("-----------|------------|---------|------------");

  for (const [name, size] of BENCH_SIZES) {
    const input = generateInput(size);
    const result = runBenchmark(name, input);

    const throughputStr = formatThroughput(result.throughput).padStart(10);
    const opsStr = result.opsPerSec.toFixed(0).padStart(7);
    const itersStr = result.iterations.toString().padStart(10);

    console.log(`${name.padEnd(10)} | ${throughputStr} | ${opsStr} | ${itersStr}`);
  }

  console.log();

  // Extended benchmarks for large inputs
  console.log("Extended Large Input Benchmarks:");
  console.log("--------------------------------");

  const largeInputs = [
    ["4MB", 4 * 1024 * 1024],
    ["16MB", 16 * 1024 * 1024],
  ] as const;

  for (const [name, size] of largeInputs) {
    const input = generateInput(size);
    const result = runBenchmark(name, input);

    console.log(
      `${name}: ${formatThroughput(result.throughput)} (${result.iterations} iterations)`,
    );
  }
}

main().catch(console.error);
