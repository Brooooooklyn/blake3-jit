# BLAKE3-JIT Performance Optimizations

This document describes the 10 performance optimization techniques used in blake3-jit, achieving **1.38 GB/s** peak throughput.

Based on the [Fleek Network BLAKE3 Case Study](https://blog.fleek.network/post/fleek-network-blake3-case-study/) by Parsa Ghadimi, plus our Arena pattern addition.

## Performance Summary

| Input Size | blake3-jit | blake3-fast | Speedup   |
| ---------- | ---------- | ----------- | --------- |
| 96B        | 352 MB/s   | 216 MB/s    | **1.63×** |
| 512B       | 749 MB/s   | 409 MB/s    | **1.83×** |
| 1KB        | 806 MB/s   | 442 MB/s    | **1.83×** |
| 32KB       | 1.35 GB/s  | 1.21 GB/s   | **1.11×** |
| 1MB        | 1.38 GB/s  | 1.24 GB/s   | **1.12×** |

---

## Optimization 1: readLittleEndianWordsFull

**Speedup:** Significant
**Commit:** [add readLittleEndianWordsFull](https://github.com/fleek-network/blake3js-perf/commit/bbb41a158dae1efe6e5e3d66b9b986d9128203e7)

### From the Blog

> Looking at the source of `readLittleEndianWords` we can see that there are a few conditionals that could have been left out if we knew that we are reading a full block of data. And interestingly enough at every part of the code, we always know that we are reading a full block except for the very last block of data.

### Before (Naive)

```typescript
function readLittleEndianWords(array, offset, words, length) {
  for (let i = 0; i < length && offset + 4 <= array.length; i++, offset += 4) {
    words[i] = array[offset] | (array[offset + 1] << 8) | ...;
  }
}
```

### After (Optimized)

```typescript
function readLittleEndianWordsFull(array, offset, words) {
  // Assume full 64-byte block - no conditionals!
  for (let i = 0; i < 16; ++i, offset += 4) {
    words[i] = array[offset] | (array[offset + 1] << 8) | ...;
  }
}
```

### Our Implementation

📁 [`src/utils.ts:23-35`](../src/utils.ts#L23-L35)

---

## Optimization 2: Precomputed Permutations

**Speedup:** 1.6×
**Commit:** [Inline Permutations](https://github.com/fleek-network/blake3js-perf/commit/ca82907bc1ebb4070db6206f0cf8fe3fe9f0ac34)

### From the Blog

> Looking at the code above we can see some annoying things, on the top of the list is the two `new Uint32Array` calls we have which are unnecessary allocations and moves of bytes that could be avoided. The other thing that we can notice is that all 6 permute calls are deterministic and this opens the possibility of pre-computing a look-up table.

### Before (Naive)

```typescript
function permute(m) {
  const copy = new Uint32Array(m);  // Allocation!
  for (let i = 0; i < 16; ++i) {
    m[i] = copy[MSG_PERMUTATION[i]];
  }
}

compress() {
  round(state, block);
  permute(block);
  round(state, block);
  permute(block);
  // ... 7 rounds total
}
```

### After (Optimized)

```typescript
// Precomputed access orders for all 7 rounds
round(state, m, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
round(state, m, [2, 6, 3, 10, 7, 0, 4, 13, 1, 11, 12, 5, 9, 14, 15, 8]);
round(state, m, [3, 4, 10, 12, 13, 2, 7, 14, 6, 5, 9, 0, 11, 15, 8, 1]);
// ... no permute() calls, no allocations
```

### Our Implementation

📁 [`src/compress.ts`](../src/compress.ts) - Hardcoded permutation indices in G function calls

---

## Optimization 3: Inline Round into Compress

**Speedup:** 1.24×
**Commit:** [Inline Round into Compress](https://github.com/fleek-network/blake3js-perf/commit/22eda65bf3ed5f571b8d4d7dd98af3c75d68569b)

### From the Blog

> Continuing to focus on the previous area we can also see that there is no strong need for `round` to be its own function if we could just do the same job in `compress` we could maybe use a for loop even for the 7 rounds we have. And hopefully not having to jump to another function could help us.

### Before (Naive)

```typescript
function round(state, m, p) {
  g(state, 0, 4, 8, 12, m[p[0]], m[p[1]]);
  g(state, 1, 5, 9, 13, m[p[2]], m[p[3]]);
  // ... 8 G calls
}

compress() {
  for (let i = 0; i < 7; i++) {
    round(state, m, PERMUTATIONS[i]);  // Function call overhead
  }
}
```

### After (Optimized)

```typescript
compress() {
  let p = 0;
  for (let i = 0; i < 7; ++i) {
    // Inlined G calls with flat PERMUTATIONS array
    g(state, block_words, p++, p++, 0, 4, 8, 12);
    g(state, block_words, p++, p++, 1, 5, 9, 13);
    // ... all G calls directly in loop
  }
}
```

### Our Implementation

📁 [`src/compress.ts:101-926`](../src/compress.ts#L101-L926) - Fully inlined 7 rounds

---

## Optimization 4: SMI Variables for State ⭐ CRITICAL

**Speedup:** 2.2× (Single most important JS optimization!)
**Commit:** [Use Variables Instead of an Array For State](https://github.com/fleek-network/blake3js-perf/commit/9ccff346c7d7e6d9562958fbec141b43fcbde401)

### From the Blog

> A `Uint32Array` is fast but constantly reading from it and writing to it might not be the best move, especially if we have a lot of writes. A call to `g` performs 8 writes and 18 reads. Compress has 7 rounds and each round has 8 calls to `g` making up a total of **448 writes and 1008 reads** for each 64 byte of the input.

> So what if `state` was not a `Uint32Array` and instead we could use 16 SMI variables?

### Before (Naive)

```typescript
const state = new Uint32Array(16);
state[a] = (((state[a] + state[b]) | 0) + mx) | 0;
state[d] ^= state[a];
state[d] = (state[d] >>> 16) | (state[d] << 16);
```

### After (Optimized)

```typescript
// 16 SMI (Small Integer) variables
let s_0 = cv[0] | 0;
let s_1 = cv[1] | 0;
// ... s_2 through s_15

// V8 uses 32-bit integer ALU for SMI variables!
s_0 = (((s_0 + s_4) | 0) + m[PERMUTATIONS[p++]]) | 0;
s_12 ^= s_0;
s_12 = (s_12 >>> 16) | (s_12 << 16);
```

### Why SMI is Faster

- V8 stores SMI directly in registers (no memory indirection)
- 32-bit integer ALU operations instead of floating point
- No bounds checking overhead
- Better instruction-level parallelism

### Our Implementation

📁 [`src/compress.ts:70-90`](../src/compress.ts#L70-L90) - 16 SMI variables: `s0` through `s15`

---

## Optimization 5: Avoid Copies (Pointer Simulation)

**Speedup:** 3×
**Commit:** [Avoid Copies](https://github.com/fleek-network/blake3js-perf/commit/a65f32d6e0c521a5a8c8367517196ab076ff87b3)

### From the Blog

> We have already seen the impact not copying data around into temporary places can have on performance. So in this step, our goal is simple, instead of giving data to `compress` and getting data back, what if we could use pointers and have an _in-place_ implementation of `compress`?

> Of course, there are no _pointers_ in JavaScript, but not having to construct new instances of `UintNArray` is good enough for us.

### Before (Naive)

```typescript
function compress(cv, block, ...) {
  return new Uint32Array([...]);  // Allocation every call!
}

// Using array of views for CV stack
const cvStack: Uint32Array[] = [];
cvStack.push(cv.subarray(0, 8));  // View allocation
```

### After (Optimized)

```typescript
function compress(
  cv: Uint32Array, cvOffset: number,
  block: Uint32Array, blockOffset: number,
  out: Uint32Array, outOffset: number,  // Caller provides output buffer
  ...
) {
  // Write directly to out buffer at outOffset
  // cv == out is allowed (in-place update)
}

// Single Uint32Array for CV stack
const cvStack = new Uint32Array(maxCvDepth * 8);
let cvStackPos = 0;

// Pop 2, compress in-place, push 1
cvStackPos -= 16;
compress(keyWords, 0, cvStack, cvStackPos, cvStack, cvStackPos, ...);
cvStackPos += 8;
```

### Our Implementation

📁 [`src/compress.ts:38-49`](../src/compress.ts#L38-L49) - Offset-based signature
📁 [`src/hash.ts`](../src/hash.ts) - Unified cvStack buffer

---

## Optimization 6: SMI Variables for Message Words

**Speedup:** 1.5×
**Commit:** [Use Local Variables to Access blockWords](https://github.com/fleek-network/blake3js-perf/commit/7a0d2d0db807c76e129a8c6b27bf5dc74f934c9a)

### From the Blog

> Similar to step 4, our goal here is to do the same thing we did with `state` but this time with `blockWords`. This means that we have to give up on the `PERMUTATIONS` table that we so painfully generated and do the permutations by actually swapping the variables.

### Before (Naive)

```typescript
const m = blockWords;
s_0 = (((s_0 + s_4) | 0) + m[PERMUTATIONS[p++]]) | 0;  // Array access
```

### After (Optimized)

```typescript
// 16 SMI variables for message
let m_0 = blockWords[blockWordsOffset + 0] | 0;
// ... m_1 through m_15

// Direct variable access
s_0 = (((s_0 + s_4) | 0) + m_0) | 0;

// Cycle-based permutation (only 2 temps needed!)
if (i != 6) {
  const t0 = m_0;
  const t1 = m_1;
  m_0 = m_2;
  m_2 = m_3;
  m_3 = m_10;
  // ... cycle decomposition of BLAKE3 permutation
  m_5 = t0;
  m_8 = t1;
}
```

### Our Implementation

📁 [`src/compress.ts:52-67`](../src/compress.ts#L52-L67) - 16 SMI variables with cycle-based swap

---

## Optimization 7: Reuse Internal Buffers

**Speedup:** 1.023× (425 → 435 MB/s)
**Commit:** [Reuse Global Uint8Array](https://github.com/fleek-network/blake3js-perf/commit/568d62dc99a0e04cbd0341befd492868429f3d49)

### From the Blog

> This is a simple change, and the idea is once we create a `Uint32Array` either for `blockWords` or for `cvStack` we should keep them around and reuse them as long as they are big enough. We don't need to make a new one each time.

### Before (Naive)

```typescript
export function hash(input) {
  const blockWords = new Uint32Array(16);      // New allocation
  const cvStack = new Uint32Array(maxDepth);   // New allocation
  // ...
}
```

### After (Optimized)

```typescript
// Module-level (allocated once at load time)
const blockWords = new Uint32Array(16);
let cvStack: Uint32Array | null = null;

function getCvStack(maxDepth) {
  const length = Math.max(maxDepth, 10) * 8;
  if (cvStack == null || cvStack.length < length) {
    cvStack = new Uint32Array(length);
  }
  return cvStack;
}
```

### Our Implementation

📁 [`src/hash.ts:42-104`](../src/hash.ts#L42-L104) - Module-level `HYPER_CV_STACK`, `reusableOut8`, etc.

---

## Optimization 8: Little-Endian Direct Access

**Speedup:** 1.48×
**Commit:** [Optimize for Little Endian Systems](https://github.com/fleek-network/blake3js-perf/commit/c6bb4c3becf0c8acd54ea81331af8aa468a527e7)

### From the Blog

> Blake3 is really Little Endian friendly and since most user-facing systems are indeed Little Endian, this is really good news and we can take advantage of it.

> Right now even if we are running on a Little Endian machine, we still call `readLittleEndianFull` in order to read the input data into `blockWords` first before calling compress, however if we're already on a Little Endian machine read is useless and we could allow `compress` to read directly from the input buffer.

### Before (Naive)

```typescript
// Always byte-by-byte read
readLittleEndianWordsFull(input, offset, blockWords);
compress(..., blockWords, 0, ...);
```

### After (Optimized)

```typescript
const IS_LITTLE_ENDIAN = !new Uint8Array(new Uint32Array([1]).buffer)[0];

// Create Uint32Array view (no copy!) - check alignment
const inputWords = new Uint32Array(input.buffer, input.byteOffset, ...);

if (IS_LITTLE_ENDIAN && aligned) {
  compress(..., inputWords, offset / 4, ...);  // Direct access!
} else {
  readLittleEndianWordsFull(input, offset, blockWords);
  compress(..., blockWords, 0, ...);
}
```

### Our Implementation

📁 [`src/hash.ts:617-621`](../src/hash.ts#L617-L621) - One-time Uint32Array view creation
📁 [`src/utils.ts:13`](../src/utils.ts#L13) - Endianness detection

---

## Optimization 9: WASM SIMD Runtime Codegen

**Speedup:** 1.39× (2.21× vs original WASM)
**Commit:** [Use WASM SIMD](https://github.com/fleek-network/blake3js-perf/commit/833d54fec0121bb4ced4f1062f4cc62139a03c31)

### From the Blog

> Since we already explored meta-programming and saw how small the generator code is, we can try to reuse the same ideas to generate the wasm file on load. This is of course something that is going to require us to understand the WASM binary format at a good enough level to write a WASM file by hand.

### Key SIMD Concepts

```typescript
// v128 register holds 4 × 32-bit values
// One i32x4.add = 4 parallel additions

// Memory layout for compress4x:
// Offset 0-511:   4×16 message words (transposed)
// Offset 512-639: 4×8 chaining values
// Offset 640-767: 4×8 output values

// SIMD rotation tricks:
// ROTR16: i8x16.shuffle [2,3,0,1, 6,7,4,5, ...]  (1 instruction!)
// ROTR8:  i8x16.shuffle [1,2,3,0, 5,6,7,4, ...]  (1 instruction!)
// ROTR12/7: shift+or (can't use shuffle, not byte-aligned)
```

### Three WASM Functions

1. **`compress4x()`** - Single block × 4 chunks in parallel
2. **`compressChunks4x()`** - Batched: 16 blocks × 4 chunks (1 call vs 16!)
3. **`compressParent()`** - Scalar parent merge (keeps tree in WASM arena)

### Our Implementation

📁 [`src/wasm-simd.ts`](../src/wasm-simd.ts) - Complete runtime bytecode generation (1,052 lines)
📁 [`microbench/single-way-simd.ts`](../microbench/single-way-simd.ts) - Scalar WASM compress for comparison

### Microbenchmark Comparison

The benchmark compares 4× sequential JS compress calls vs 1× SIMD `compress4x` call, demonstrating the 4-way parallelism benefit (~2.2× speedup accounting for transpose overhead).

---

## Optimization 10: Arena Pattern (Our Addition) ⭐

**Impact:** Zero GC pressure during hashing
**Microbenchmark Speedup:** ~3.5× (pre-allocated arena vs JS heap allocations)

### The Problem

Standard implementations allocate TypedArrays for:

- CV stack (grows with input size)
- Temporary buffers for parent compression
- Output arrays

These create GC pressure, especially for large inputs.

### Our Solution: WASM Arena

All working buffers live in a single 64KB WASM memory page:

```
WASM Memory Layout (64KB page)
─────────────────────────────────────────────────────────
Offset 0-831:     compress4x working area
Offset 832-5087:  compressChunks4x batch area
Offset 5216-7263: CV Stack (64 levels × 8 words)
Offset 7264-7327: Parent Block (16 words)
Offset 7328-7359: Chunk CV output (8 words)
Offset 7360-7487: Temp CVs (4×8 words)
─────────────────────────────────────────────────────────
```

```typescript
// Arena views - created once at WASM init
let arenaCvStack: Uint32Array;      // Backed by WASM memory
let arenaParentBlock: Uint32Array;  // No JS allocation
let arenaChunkCv: Uint32Array;      // Direct access

function setupArenaViews() {
  const buffer = wasmMemory.buffer;
  arenaCvStack = new Uint32Array(buffer, CV_STACK_OFFSET, 64 * 8);
  // ...
}
```

### Benefits

1. **Zero GC pressure** - No TypedArray allocations in hot paths
2. **Cache locality** - All working data in contiguous 64KB page
3. **Direct WASM access** - JS TypedArray views into WASM memory
4. **Reduced boundary crossing** - Merkle tree merges stay in WASM

### Our Implementation

📁 [`src/wasm-simd.ts:949-976`](../src/wasm-simd.ts#L949-L976) - Memory layout constants
📁 [`src/wasm-simd.ts:881-900`](../src/wasm-simd.ts#L881-L900) - Arena view setup

---

## Running the Microbenchmarks

```bash
# Run all microbenchmarks
npx tsx microbench/index.ts

# Compare against blake3-fast
npx tsx bench/compare-blake3-fast.ts
```

**Note:** The speedup numbers in this document are from the original Fleek blog, measuring cumulative end-to-end improvements. The microbenchmarks (`microbench/`) measure each optimization in isolation, which often shows larger speedups (e.g., SMI variables show 7x in isolation vs 2.2x cumulative). Both perspectives are valuable:

- **Blog numbers:** Real-world impact when combined with other optimizations
- **Microbenchmark numbers:** Theoretical potential of each technique in isolation

---

## Key Insights

1. **SMI variables beat TypedArrays** for hot inner loops (2.2x from state alone)
2. **Avoid allocations** in hot paths - pass offsets, reuse buffers
3. **Little-endian systems** can skip byte manipulation (1.48x)
4. **WASM SIMD** enables 4-way parallelism without threads
5. **Arena pattern** eliminates GC pressure entirely
6. **Batch WASM calls** - one compressChunks4x beats 16 compress4x calls
7. **i8x16.shuffle** is faster than shift+or for 8/16-bit rotations

---

## References

- [Fleek Network BLAKE3 Case Study](https://blog.fleek.network/post/fleek-network-blake3-case-study/) - Original optimization journey
- [BLAKE3 Specification](https://github.com/BLAKE3-team/BLAKE3-specs/blob/master/blake3.pdf)
- [WebAssembly SIMD Proposal](https://github.com/WebAssembly/simd)
