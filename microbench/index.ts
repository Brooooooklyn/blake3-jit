/**
 * BLAKE3-JIT Optimization Microbenchmarks
 *
 * Demonstrates the performance impact of 10 optimization techniques
 * used in the blake3-jit implementation.
 *
 * Run with: npx tsx microbench/index.ts
 */

import { run as run01 } from "./01-read-words.js";
import { run as run02 } from "./02-permutations.js";
import { run as run03 } from "./03-inline-round.js";
import { run as run04 } from "./04-smi-state.js";
import { run as run05 } from "./05-avoid-copies.js";
import { run as run06 } from "./06-smi-message.js";
import { run as run07 } from "./07-buffer-reuse.js";
import { run as run08 } from "./08-le-direct.js";
import { run as run09 } from "./09-wasm-simd.js";
import { run as run10 } from "./10-arena.js";
import { printTable, type BenchmarkResult } from "./utils.js";

async function main() {
  console.log("\nRunning BLAKE3-JIT Optimization Microbenchmarks...\n");
  console.log("Each benchmark compares naive vs optimized implementation.");
  console.log("Minimum duration: 1000ms per measurement.\n");

  const benchmarks = [
    { name: "1. readLittleEndianWordsFull", run: run01 },
    { name: "2. Precomputed Permutations", run: run02 },
    { name: "3. Inline Round into Compress", run: run03 },
    { name: "4. SMI Variables for State", run: run04 },
    { name: "5. Avoid Copies (Pointer Sim)", run: run05 },
    { name: "6. SMI Variables for Message", run: run06 },
    { name: "7. Reuse Internal Buffers", run: run07 },
    { name: "8. Little-Endian Direct Access", run: run08 },
    { name: "9. WASM SIMD 4-way Parallel", run: run09 },
    { name: "10. Arena Pattern (Zero GC)", run: run10 },
  ];

  const results: BenchmarkResult[] = [];

  for (const bench of benchmarks) {
    process.stdout.write(`Running ${bench.name}... `);
    const result = bench.run();
    results.push(result);
    console.log(`done (${result.speedup.toFixed(2)}x)`);
  }

  console.log("\n");
  printTable(results);

  // Summary statistics
  const totalSpeedup = results.reduce((acc, r) => acc * r.speedup, 1);
  const avgSpeedup = Math.pow(totalSpeedup, 1 / results.length);
  const maxSpeedup = Math.max(...results.map((r) => r.speedup));
  const maxResult = results.find((r) => r.speedup === maxSpeedup)!;

  console.log("\n📊 Summary:");
  console.log(`  • Average speedup: ${avgSpeedup.toFixed(2)}×`);
  console.log(`  • Highest impact: ${maxResult.name} (${maxSpeedup.toFixed(2)}×)`);
  console.log(`  • Cumulative potential: ${totalSpeedup.toFixed(1)}× (if applied sequentially)`);

  console.log("\n✅ Microbenchmarks complete!");
  console.log("\nNote: These microbenchmarks isolate individual optimizations.");
  console.log("Real-world performance depends on how they combine in the full");
  console.log("implementation. See bench/compare-blake3-fast.ts for end-to-end results.");
}

main().catch(console.error);
