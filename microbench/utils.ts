/**
 * Shared benchmark utilities for microbenchmarks
 */

export interface BenchmarkResult {
  name: string;
  description: string;
  naiveThroughput: number; // bytes/ms
  optimizedThroughput: number; // bytes/ms
  speedup: number; // ratio
}

// Constants
export const MIN_DURATION_MS = 1000;
export const WARMUP_ITERATIONS = 100;

/**
 * Generate random input data
 */
export function generateInput(length: number): Uint8Array {
  const input = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    input[i] = (Math.random() * 256) | 0;
  }
  return input;
}

/**
 * High-resolution timer
 */
export function now(): number {
  return performance.now();
}

/**
 * Run a benchmark function and return throughput in bytes/ms
 */
export function benchmark(fn: () => void, inputSize: number): number {
  // Warmup
  for (let i = 0; i < WARMUP_ITERATIONS; i++) {
    fn();
  }

  // Benchmark
  let iterations = 0;
  const startTime = now();
  let elapsed = 0;

  while (elapsed < MIN_DURATION_MS) {
    fn();
    iterations++;
    elapsed = now() - startTime;
  }

  const bytesProcessed = inputSize * iterations;
  return bytesProcessed / elapsed; // bytes per ms
}

/**
 * Format throughput for display
 */
export function formatThroughput(bytesPerMs: number): string {
  const bytesPerSec = bytesPerMs * 1000;
  if (bytesPerSec >= 1e9) {
    return `${(bytesPerSec / 1e9).toFixed(2)} GB/s`;
  } else if (bytesPerSec >= 1e6) {
    return `${(bytesPerSec / 1e6).toFixed(0)} MB/s`;
  } else {
    return `${(bytesPerSec / 1e3).toFixed(0)} KB/s`;
  }
}

/**
 * Format speedup ratio with ANSI colors
 */
export function formatSpeedup(ratio: number): string {
  if (ratio >= 1) {
    return `\u001b[32m${ratio.toFixed(2)}x\u001b[0m`;
  } else {
    return `\u001b[31m${ratio.toFixed(2)}x\u001b[0m`;
  }
}

/**
 * Print benchmark results as a beautiful table
 */
export function printTable(results: BenchmarkResult[]): void {
  console.log("╔═══════════════════════════════════════════════════════════════════════════════╗");
  console.log("║              BLAKE3-JIT Optimization Microbenchmarks                          ║");
  console.log(
    "╚═══════════════════════════════════════════════════════════════════════════════╝\n",
  );

  // Column widths
  const nameWidth = 38;
  const throughputWidth = 12;
  const speedupWidth = 10;

  // Header
  console.log(
    `┌${"─".repeat(nameWidth)}┬${"─".repeat(throughputWidth)}┬${"─".repeat(throughputWidth)}┬${"─".repeat(speedupWidth)}┐`,
  );
  console.log(
    `│ ${"Optimization".padEnd(nameWidth - 2)} │ ${"Naive".padEnd(throughputWidth - 2)} │ ${"Optimized".padEnd(throughputWidth - 2)} │ ${"Speedup".padEnd(speedupWidth - 2)} │`,
  );
  console.log(
    `├${"─".repeat(nameWidth)}┼${"─".repeat(throughputWidth)}┼${"─".repeat(throughputWidth)}┼${"─".repeat(speedupWidth)}┤`,
  );

  // Rows
  for (const result of results) {
    const name = result.name.substring(0, nameWidth - 2).padEnd(nameWidth - 2);
    const naive = formatThroughput(result.naiveThroughput).padEnd(throughputWidth - 2);
    const optimized = formatThroughput(result.optimizedThroughput).padEnd(throughputWidth - 2);
    // For speedup, we need to account for ANSI codes in padding
    const speedupStr = formatSpeedup(result.speedup);
    // Strip ANSI escape codes for length calculation
    const ansiPattern = new RegExp(String.fromCharCode(0x1b) + "\\[[0-9;]*m", "g");
    const speedupPadded =
      speedupStr +
      " ".repeat(Math.max(0, speedupWidth - 2 - speedupStr.replace(ansiPattern, "").length));

    console.log(`│ ${name} │ ${naive} │ ${optimized} │ ${speedupPadded} │`);
  }

  // Footer
  console.log(
    `└${"─".repeat(nameWidth)}┴${"─".repeat(throughputWidth)}┴${"─".repeat(throughputWidth)}┴${"─".repeat(speedupWidth)}┘`,
  );
}

/**
 * Create a complete benchmark result
 */
export function createResult(
  name: string,
  description: string,
  naiveThroughput: number,
  optimizedThroughput: number,
): BenchmarkResult {
  return {
    name,
    description,
    naiveThroughput,
    optimizedThroughput,
    speedup: optimizedThroughput / naiveThroughput,
  };
}
