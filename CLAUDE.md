# BLAKE3-Ultra: High-Performance JavaScript Implementation

## Project Overview

**blake3-ultra** is a high-performance, pure JavaScript/WebAssembly implementation of the BLAKE3 cryptographic hash function. It achieves **1.38 GB/s** peak throughput - **1.6-1.8x faster** than blake3-fast for small inputs and **1.1-1.2x faster** for large inputs.

### Origins

This project started from [potential-guacamole](https://github.com/zooko/potential-guacamole) - a community challenge by Zooko to create the best JavaScript BLAKE3 implementation incorporating optimizations from the [Fleek Network case study](https://blog.fleek.network/post/fleek-network-blake3-case-study/).

Key learnings came from:

- `tmp/blog.md` - Fleek Network's detailed optimization journey (Steps 1-9)
- `tmp/blake3-fast/` - Reference implementation with WASM SIMD

---

## Architecture

```
blake3-ultra (Public API)
├── hash() / hashInto()           One-shot hashing
├── Hasher class                   Incremental hashing
├── XofReader class                Variable-length output (XOF)
├── createKeyed()                  MAC mode
├── createDeriveKey()              Key derivation
├── warmupSimd()                   SIMD pre-initialization
│
├── JS Path (<4KB)                 Pure JavaScript, SMI variables
│   └── compress()                 7 rounds, inlined G function
│
└── WASM SIMD Path (≥4KB)         4-way parallel compression
    ├── compress4x()              Single block × 4 chunks
    ├── compressChunks4x()        16 blocks × 4 chunks batched
    └── compressParent()          Merkle tree parent merge
```

### File Structure

```
src/
├── index.ts        Public API, SIMD pre-warming (106 lines)
├── hash.ts         Merkle tree, transpose, SIMD orchestration (1,300 lines)
├── compress.ts     Hot path: SMI-optimized compression (404 lines)
├── hasher.ts       Stateful incremental hashing (524 lines)
├── wasm-simd.ts    Runtime WASM bytecode generation (1,052 lines)
├── constants.ts    IV, flags, permutations (63 lines)
└── utils.ts        Endianness, de Bruijn ctz32 (262 lines)
```

---

## The Arena Pattern (Our Key Advantage)

The **Arena pattern** is our primary differentiator over other implementations. All working buffers live in WASM linear memory, eliminating JavaScript heap allocations during hashing.

### Why Arena Matters

1. **Zero GC pressure** - No TypedArray allocations in hot paths
2. **Cache locality** - All working data in contiguous 64KB WASM page
3. **Direct WASM access** - JS TypedArray views into WASM memory
4. **Reduced boundary crossing** - Merkle tree merges stay in WASM

### WASM Memory Layout

```
Offset (bytes)   Size      Purpose
─────────────────────────────────────────────────────────
0-511            512B      compress4x: 4×16 message words (transposed)
512-639          128B      compress4x: 4×8 chaining values
640-767          128B      compress4x: 4×8 output values
768-783          16B       compress4x: 4× counter low
784-799          16B       compress4x: 4× counter high
800-815          16B       compress4x: 4× block length
816-831          16B       compress4x: 4× flags
─────────────────────────────────────────────────────────
832-4927         4096B     compressChunks4x: 16 positions × 256B
4928-5055        128B      Batch CVs (4×8 words)
5056-5071        16B       Batch counters
5072-5087        16B       Batch flags
5088-5215        128B      Batch output
─────────────────────────────────────────────────────────
5216-7263        2048B     Arena: CV stack (64 levels × 8 words)
7264-7327        64B       Arena: Parent block (16 words)
7328-7359        32B       Arena: Chunk CV output (8 words)
7360-7487        128B      Arena: Temp CVs (4×8 words)
─────────────────────────────────────────────────────────
Total: ~7.5KB of 64KB page
```

### Arena Implementation

```typescript
// src/wasm-simd.ts
export const SIMD_MEMORY = {
  CV_STACK: 5216,        // 64 levels × 8 words × 4 bytes
  PARENT_BLOCK: 7264,    // 16 words for parent compression
  CHUNK_CV: 7328,        // Output of compressParent()
  TEMP_CVS: 7360,        // 4 chunk CVs for batch processing
} as const;

// Arena views - created once at SIMD init
let arenaCvStack: Uint32Array;      // Backed by WASM memory
let arenaParentBlock: Uint32Array;  // No JS allocation
let arenaChunkCv: Uint32Array;      // Direct access
```

---

## Optimization Techniques

### From Fleek Network Blog (blog.md)

#### Step 1: `readLittleEndianWordsFull()`

Remove conditionals from hot path - assume full 64-byte blocks.

#### Step 2: Precomputed Permutations

```typescript
const MSG_ACCESS_ORDER = [
  // Round 1: identity
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
  // Round 2: permuted
  2, 6, 3, 10, 7, 0, 4, 13, 1, 11, 12, 5, 9, 14, 15, 8,
  // ... 7 rounds total
];
```

#### Step 3: Inlined Round into Compress

Removed `round()` function call overhead - loop directly in compress.

#### Step 4: SMI Variables for State (Critical!)

```typescript
// Instead of Uint32Array state[16]:
let s_0 = cv[0] | 0;
let s_1 = cv[1] | 0;
// ... 16 SMI variables
// Forces V8 to use 32-bit integer ALU
```

**Impact:** 2.2x speedup - single most important JS optimization.

#### Step 5: Avoid Copies (Pointer Simulation)

```typescript
// Signature change: pass offset instead of creating views
function compress(
  cv: Uint32Array, cvOffset: number,
  block: Uint32Array, blockOffset: number,
  out: Uint32Array, outOffset: number,
  ...
)
```

**Impact:** 3x speedup from eliminated allocations.

#### Step 6: SMI Variables for Message Words

Same pattern as state - 16 SMI variables `m_0` through `m_15`.

#### Step 7: Module-Level Reusable Buffers

```typescript
// src/hash.ts - allocated once at module load
const HYPER_CV_STACK = new Uint32Array(64 * 8);  // Merkle tree
const reusableOut8 = new Uint32Array(8);          // 32-byte output
const reusableOut8View = new Uint8Array(reusableOut8.buffer, 0, 32);
```

#### Step 8: Little-Endian Direct Access

```typescript
// Create Uint32Array view ONCE per hash call
let inputWords: Uint32Array | null = null;
if (IS_LITTLE_ENDIAN && input.byteOffset % 4 === 0) {
  inputWords = new Uint32Array(input.buffer, input.byteOffset, ...);
}
// Reuse in all block processing - no view allocation in hot loop
```

**Impact:** 1.48x speedup for aligned LE data.

#### Step 9: WASM SIMD Runtime Codegen

Generate WASM bytecode at runtime - no `.wasm` file shipping:

```typescript
// src/wasm-simd.ts
function generateWasmBytes(): Uint8Array {
  // Build complete WASM module in memory
  const code: number[] = [];
  put([0x00, 0x61, 0x73, 0x6d]); // Magic
  put([0x01, 0x00, 0x00, 0x00]); // Version
  // ... generate compress4x, compressChunks4x, compressParent
}
```

### Our Additional Optimizations

#### Task 1: Eliminated `.slice()` Allocations

```typescript
// Before: creates view AND copies
return new Uint8Array(out.buffer, out.byteOffset, 32).slice();

// After: pre-created view, only copies
const reusableOut8View = new Uint8Array(reusableOut8.buffer, 0, 32);
return reusableOut8View.slice();
```

#### Task 4: Cache-Friendly Transposition

```typescript
// Write 4 consecutive u32s per word (16 bytes)
for (let w = 0; w < 16; w++) {
  const dstBase = posBase + w * 4;
  mem32[dstBase] = inputWords[chunk0WordBase + blockWordOff + w];
  mem32[dstBase + 1] = inputWords[chunk1WordBase + blockWordOff + w];
  mem32[dstBase + 2] = inputWords[chunk2WordBase + blockWordOff + w];
  mem32[dstBase + 3] = inputWords[chunk3WordBase + blockWordOff + w];
}
```

#### Task 6: Zero-Allocation `hashInto()` API

```typescript
export function hashInto(
  input: Uint8Array,
  output: Uint8Array,  // Caller-provided buffer
  outputLength: number = 32
): void
```

#### Task 7: Unrolled CV Copy

```typescript
function copyCV8(src: Uint32Array, srcOff: number,
                 dst: Uint32Array, dstOff: number): void {
  dst[dstOff] = src[srcOff];
  dst[dstOff + 1] = src[srcOff + 1];
  // ... 8 direct assignments, V8 inlines this
}
```

---

## WASM SIMD Deep Dive

### SIMD Strategy

BLAKE3 processes 1024-byte chunks independently (Merkle tree structure). Our WASM SIMD packs 4 chunks into v128 lanes:

```
v128 register (4 × 32-bit lanes)
┌─────────┬─────────┬─────────┬─────────┐
│ chunk0  │ chunk1  │ chunk2  │ chunk3  │
│ state[i]│ state[i]│ state[i]│ state[i]│
└─────────┴─────────┴─────────┴─────────┘

One i32x4.add = 4 parallel 32-bit additions
```

### Three WASM Functions

1. **`compress4x()`** - Single block compression
   - Input: 4 blocks transposed into memory
   - Output: 4 CVs (chaining values)
   - Used for block-by-block processing

2. **`compressChunks4x()`** - Batched 16-block compression
   - Processes all 16 blocks of 4 chunks in ONE call
   - Reduces JS↔WASM boundary crossings from 16 to 1
   - Main fast path for large inputs

3. **`compressParent()`** - Merkle tree merge
   - Scalar i32 operations (not SIMD)
   - Reads from PARENT_BLOCK, writes to CHUNK_CV
   - Keeps tree merges in WASM arena

### SIMD Rotation Tricks

```typescript
// ROTR16: Use i8x16.shuffle instead of shift+or
// Pattern: [2,3,0,1, 6,7,4,5, 10,11,8,9, 14,15,12,13]
put([0xfd, 0x0d, 2, 3, 0, 1, 6, 7, 4, 5, 10, 11, 8, 9, 14, 15, 12, 13]);

// ROTR8: Another shuffle pattern
// Pattern: [1,2,3,0, 5,6,7,4, 9,10,11,8, 13,14,15,12]

// ROTR12 and ROTR7: Must use shift+or (no byte-aligned shuffle)
```

---

## Performance Characteristics

### Benchmark Results

| Input Size | blake3-ultra | blake3-fast | Ratio |
| ---------- | ------------ | ----------- | ----- |
| 96B        | 352 MB/s     | 216 MB/s    | 1.63× |
| 512B       | 749 MB/s     | 409 MB/s    | 1.83× |
| 1KB        | 806 MB/s     | 442 MB/s    | 1.83× |
| 32KB       | 1.35 GB/s    | 1.21 GB/s   | 1.11× |
| 64KB       | 1.37 GB/s    | 1.23 GB/s   | 1.11× |
| 256KB      | 1.38 GB/s    | 1.23 GB/s   | 1.12× |
| 1MB        | 1.38 GB/s    | 1.24 GB/s   | 1.12× |

### Path Selection

```typescript
const SIMD_THRESHOLD = 4 * CHUNK_LEN; // 4KB

// < 4KB: Pure JS (SMI variables, no transpose overhead)
// ≥ 4KB: WASM SIMD (4-way parallel, batched)
```

### Why Small Inputs Are Faster

For inputs < 4KB:

- No WASM initialization latency
- No transpose overhead
- SMI variables are extremely fast in V8
- Single-chunk root optimization

---

## BLAKE3 Algorithm Notes

### Constants

```typescript
// Same IV as SHA-256 (first 32 bits of √primes 2-19)
const IV = [
  0x6A09E667, 0xBB67AE85, 0x3C6EF372, 0xA54FF53A,
  0x510E527F, 0x9B05688C, 0x1F83D9AB, 0x5BE0CD19
];

// Domain separation flags
const CHUNK_START = 1;
const CHUNK_END = 2;
const PARENT = 4;
const ROOT = 8;
const KEYED_HASH = 16;
const DERIVE_KEY_CONTEXT = 32;
const DERIVE_KEY_MATERIAL = 64;

// Sizes
const BLOCK_LEN = 64;   // bytes
const CHUNK_LEN = 1024; // bytes (16 blocks)
const OUT_LEN = 32;     // default hash output
```

### Merkle Tree Merge Pattern

```typescript
// Trailing zeros determine merge count
let totalChunks = chunkIdx + 1;
while ((totalChunks & 1) === 0 && stackLen > 0) {
  // Pop two, compress as parent, push result
  stackLen--;
  mergeParent(stack[stackLen], newCv);
  totalChunks >>>= 1;
}
stack[stackLen++] = newCv;
```

### De Bruijn CTZ32

```typescript
// O(1) trailing zero count using multiplication trick
const CTZ32_TABLE = new Uint8Array([
  0, 1, 28, 2, 29, 14, 24, 3, 30, 22, 20, 15, ...
]);

function ctz32(n: number): number {
  if (n === 0) return 32;
  // (n & -n) isolates lowest set bit
  // Multiply by de Bruijn constant maps to unique 5-bit index
  return CTZ32_TABLE[(((n & -n) * 0x077CB531) >>> 27) & 31];
}
```

---

## Development Commands

```bash
# Build
yarn build

# Test (22 official vectors)
yarn test

# Benchmark
npx tsx bench/benchmark.ts
npx tsx bench/compare-blake3-fast.ts

# Lint
npx oxlint
```

---

## Key Implementation Insights

1. **SMI variables beat TypedArrays** for hot inner loops (V8 32-bit integer ALU)
2. **Pre-create views once** per hash call, not per block/chunk
3. **Arena pattern** eliminates GC pressure entirely for working buffers
4. **Batch WASM calls** - one compressChunks4x beats 16 compress4x calls
5. **i8x16.shuffle** is faster than shift+or for 8/16-bit rotations
6. **Unroll small loops** - V8 will inline, avoiding loop overhead
7. **Cache-friendly writes** - write consecutive memory locations together

---

## Known Limitations

- **Single-threaded only** - Module-level buffers assume single thread
- **No streaming in hashInto()** - Each call is independent
- **64KB WASM memory** - Fixed arena size (sufficient for all practical inputs)
- **Node.js/Browser focus** - V8 optimizations may not apply to other engines
