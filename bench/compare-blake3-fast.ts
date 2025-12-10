/**
 * Comparison benchmark: our implementation vs blake3-fast vs @napi-rs/blake-hash
 *
 * Run with: npx tsx bench/compare-blake3-fast.ts
 */

import { blake3 as napiBlake3 } from "@napi-rs/blake-hash";

import { hash as ourHash, hashInto as ourHashInto, warmupSimd } from "../src/index.js";
import { hash as blake3FastHash } from "../tmp/blake3-fast/dist/src/index.js";

// Wrapper to match our API (returns Uint8Array)
function napiHash(input: Uint8Array): Uint8Array {
  return napiBlake3(input);
}

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

const MIN_DURATION_MS = 1000;

function generateInput(length: number): Uint8Array {
  const input = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    input[i] = (Math.random() * 256) | 0;
  }
  return input;
}

function now(): number {
  return performance.now();
}

function formatThroughput(bytesPerMs: number): string {
  const bytesPerSec = bytesPerMs * 1000;
  if (bytesPerSec >= 1e9) {
    return `${(bytesPerSec / 1e9).toFixed(2)} GB/s`;
  } else if (bytesPerSec >= 1e6) {
    return `${(bytesPerSec / 1e6).toFixed(2)} MB/s`;
  } else {
    return `${(bytesPerSec / 1e3).toFixed(2)} KB/s`;
  }
}

async function benchmark(
  hashFn: (input: Uint8Array) => Uint8Array,
  input: Uint8Array,
): Promise<{ throughput: number; iterations: number }> {
  // Warmup
  for (let i = 0; i < 100; i++) {
    hashFn(input);
  }

  // Benchmark
  let iterations = 0;
  const startTime = now();
  let elapsed = 0;

  while (elapsed < MIN_DURATION_MS) {
    hashFn(input);
    iterations++;
    elapsed = now() - startTime;
  }

  const bytesProcessed = input.length * iterations;
  const throughput = bytesProcessed / elapsed; // bytes per ms

  return { throughput, iterations };
}

async function benchmarkInto(
  hashFn: (input: Uint8Array, output: Uint8Array) => void,
  input: Uint8Array,
  output: Uint8Array,
): Promise<{ throughput: number; iterations: number }> {
  // Warmup
  for (let i = 0; i < 100; i++) {
    hashFn(input, output);
  }

  // Benchmark
  let iterations = 0;
  const startTime = now();
  let elapsed = 0;

  while (elapsed < MIN_DURATION_MS) {
    hashFn(input, output);
    iterations++;
    elapsed = now() - startTime;
  }

  const bytesProcessed = input.length * iterations;
  const throughput = bytesProcessed / elapsed; // bytes per ms

  return { throughput, iterations };
}

async function main() {
  console.log(
    "╔═══════════════════════════════════════════════════════════════════════════════════╗",
  );
  console.log(
    "║     BLAKE3 Benchmark: blake3-jit vs blake3-fast vs @napi-rs/blake-hash          ║",
  );
  console.log(
    "╚═══════════════════════════════════════════════════════════════════════════════════╝\n",
  );

  // Pre-warm SIMD
  warmupSimd();

  // Verify correctness first
  const testInput = new Uint8Array([1, 2, 3, 4, 5]);
  const ourResult = ourHash(testInput);
  const blake3FastResult = blake3FastHash(testInput);
  const napiResult = napiHash(testInput);

  const toHex = (arr: Uint8Array) =>
    Array.from(arr)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

  const ourHex = toHex(ourResult);
  const blake3FastHex = toHex(blake3FastResult);
  const napiHex = toHex(napiResult);

  console.log("Correctness check:");
  console.log(`  blake3-jit:        ${ourHex}`);
  console.log(`  blake3-fast:         ${blake3FastHex}`);
  console.log(`  @napi-rs/blake-hash: ${napiHex}`);
  console.log(
    `  All match: ${ourHex === blake3FastHex && ourHex === napiHex ? "YES ✓" : "NO ✗"}\n`,
  );

  // Main benchmark table
  console.log(
    "┌────────────┬─────────────┬─────────────┬─────────────┬──────────────────┬──────────────────┐",
  );
  console.log(
    "│ Input Size │ blake3-jit│ blake3-fast │ napi-rs     │ vs blake3-fast   │ vs napi-rs       │",
  );
  console.log(
    "├────────────┼─────────────┼─────────────┼─────────────┼──────────────────┼──────────────────┤",
  );

  for (const [label, size] of BENCH_SIZES) {
    const input = generateInput(size);

    const ourResult = await benchmark(ourHash, input);
    const blake3FastResult = await benchmark(blake3FastHash, input);
    const napiResult = await benchmark(napiHash, input);

    const ratioVsBlake3Fast = ourResult.throughput / blake3FastResult.throughput;
    const ratioVsNapi = ourResult.throughput / napiResult.throughput;

    const formatRatio = (ratio: number) =>
      ratio >= 1
        ? `\x1b[32m${ratio.toFixed(2)}× faster\x1b[0m`
        : `\x1b[31m${(1 / ratio).toFixed(2)}× slower\x1b[0m`;

    console.log(
      `│ ${label.padEnd(10)} │ ${formatThroughput(ourResult.throughput).padEnd(11)} │ ${formatThroughput(blake3FastResult.throughput).padEnd(11)} │ ${formatThroughput(napiResult.throughput).padEnd(11)} │ ${formatRatio(ratioVsBlake3Fast).padEnd(25)} │ ${formatRatio(ratioVsNapi).padEnd(25)} │`,
    );
  }

  console.log(
    "└────────────┴─────────────┴─────────────┴─────────────┴──────────────────┴──────────────────┘",
  );

  // Extended large input benchmarks
  console.log("\n📊 Extended Large Input Benchmarks:");
  console.log("────────────────────────────────────");

  for (const size of [4 * 1024 * 1024, 16 * 1024 * 1024]) {
    const input = generateInput(size);
    const label = size >= 1024 * 1024 ? `${size / (1024 * 1024)}MB` : `${size / 1024}KB`;

    const ourResult = await benchmark(ourHash, input);
    const blake3FastResult = await benchmark(blake3FastHash, input);
    const napiResult = await benchmark(napiHash, input);

    const ratioVsBlake3Fast = ourResult.throughput / blake3FastResult.throughput;
    const ratioVsNapi = ourResult.throughput / napiResult.throughput;

    const formatRatio = (ratio: number) =>
      ratio >= 1
        ? `\x1b[32m${ratio.toFixed(2)}× faster\x1b[0m`
        : `\x1b[31m${(1 / ratio).toFixed(2)}× slower\x1b[0m`;

    console.log(
      `  ${label.padEnd(4)}: ultra=${formatThroughput(ourResult.throughput).padEnd(10)} fast=${formatThroughput(blake3FastResult.throughput).padEnd(10)} napi=${formatThroughput(napiResult.throughput).padEnd(10)} (vs fast: ${formatRatio(ratioVsBlake3Fast)}, vs napi: ${formatRatio(ratioVsNapi)})`,
    );
  }

  // hashInto benchmark (zero-allocation API)
  console.log("\n🚀 hashInto() API Benchmark (zero-allocation):");
  console.log("───────────────────────────────────────────────");

  const outputBuffer = new Uint8Array(32);

  for (const [label, size] of [
    ["1KB", 1024],
    ["64KB", 64 * 1024],
    ["1MB", 1024 * 1024],
  ] as const) {
    const input = generateInput(size);

    const hashResult = await benchmark(ourHash, input);
    const hashIntoResult = await benchmarkInto(ourHashInto, input, outputBuffer);

    const speedup = hashIntoResult.throughput / hashResult.throughput;
    const speedupStr =
      speedup >= 1
        ? `\x1b[32m+${((speedup - 1) * 100).toFixed(1)}%\x1b[0m`
        : `\x1b[31m${((speedup - 1) * 100).toFixed(1)}%\x1b[0m`;

    console.log(
      `  ${label.padEnd(4)}: hash()=${formatThroughput(hashResult.throughput).padEnd(10)}, hashInto()=${formatThroughput(hashIntoResult.throughput).padEnd(10)} (${speedupStr})`,
    );
  }

  console.log("\n✅ Benchmark complete!");
}

main().catch(console.error);
