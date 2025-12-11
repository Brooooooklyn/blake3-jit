/**
 * Single-way WASM Compression (Non-SIMD baseline)
 *
 * This module generates a WASM module with a scalar (non-SIMD) compress function.
 * Used as the baseline to compare against the 4-way SIMD compress4x.
 *
 * The key difference:
 * - compress1x: Process 1 block at a time (scalar i32 operations)
 * - compress4x: Process 4 blocks in parallel (SIMD i32x4 operations)
 */

// Signed LEB128 for i32 constants (used by all i32.const instructions)
function toSignedLeb128(n: number): number[] {
  const bytes: number[] = [];
  let value = n | 0;
  let more = true;
  while (more) {
    let byte = value & 0x7f;
    value >>= 7;
    if ((value === 0 && (byte & 0x40) === 0) || (value === -1 && (byte & 0x40) !== 0)) {
      more = false;
    } else {
      byte |= 0x80;
    }
    bytes.push(byte);
  }
  return bytes;
}

// LEB128 padded to 5 bytes for backpatching
function toLebU32Padded5(n: number): number[] {
  return [
    (n & 0x7f) | 0x80,
    ((n >>> 7) & 0x7f) | 0x80,
    ((n >>> 14) & 0x7f) | 0x80,
    ((n >>> 21) & 0x7f) | 0x80,
    (n >>> 28) & 0x0f,
  ];
}

// Message permutation for BLAKE3
const MSG_PERMUTATION = [2, 6, 3, 10, 7, 0, 4, 13, 1, 11, 12, 5, 9, 14, 15, 8];

// Precomputed access orders for all 7 rounds
function computePermutations(): number[][] {
  const perms: number[][] = [];
  let current = Array.from({ length: 16 }, (_, i) => i);
  for (let round = 0; round < 7; round++) {
    perms.push([...current]);
    current = MSG_PERMUTATION.map((p) => current[p]);
  }
  return perms;
}

const PERMUTATIONS = computePermutations();
const IV = [
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
];

/**
 * Memory layout for single-way compress:
 *   0-63:    16 message words (64 bytes)
 *   64-95:   8 chaining value words (32 bytes)
 *   96-127:  8 output words (32 bytes)
 *   128-131: counter low (4 bytes)
 *   132-135: counter high (4 bytes)
 *   136-139: block length (4 bytes)
 *   140-143: flags (4 bytes)
 */
export const MEMORY_LAYOUT = {
  BLOCK_WORDS: 0, // 64 bytes
  CHAINING_VALUE: 64, // 32 bytes
  OUTPUT: 96, // 32 bytes
  COUNTER_LOW: 128,
  COUNTER_HIGH: 132,
  BLOCK_LEN: 136,
  FLAGS: 140,
} as const;

/**
 * Generate WASM bytecode for scalar (non-SIMD) compress function.
 */
function generateWasmBytes(): Uint8Array {
  const code: number[] = [];

  function put(bytes: number[]): void {
    code.push(...bytes);
  }

  // WASM module header
  put([0x00, 0x61, 0x73, 0x6d]); // Magic
  put([0x01, 0x00, 0x00, 0x00]); // Version

  // Section 1: Types
  put([0x01]); // Section ID
  put([0x04]); // Section size
  put([0x01]); // 1 type
  put([0x60, 0x00, 0x00]); // func () -> ()

  // Section 2: Imports (memory from JS)
  put([0x02]); // Section ID
  put([0x0b]); // Section size
  put([0x01]); // 1 import
  put([0x02, 0x6a, 0x73]); // "js"
  put([0x03, 0x6d, 0x65, 0x6d]); // "mem"
  put([0x02, 0x00, 0x01]); // memory min=1, no max

  // Section 3: Functions
  put([0x03]); // Section ID
  put([0x02]); // Section size
  put([0x01]); // 1 function
  put([0x00]); // Function 0: type index 0

  // Section 7: Exports
  put([0x07]); // Section ID
  put([0x0e]); // Section size
  put([0x01]); // 1 export
  put([0x0a]); // name length
  put([0x63, 0x6f, 0x6d, 0x70, 0x72, 0x65, 0x73, 0x73, 0x31, 0x78]); // "compress1x"
  put([0x00, 0x00]); // func index 0

  // Section 10: Code
  put([0x0a]); // Section ID
  const sectionSizeOffset = code.length;
  put([0x00, 0x00, 0x00, 0x00, 0x00]); // Reserved for section size

  put([0x01]); // 1 function

  // Function body
  const funcSizeOffset = code.length;
  put([0x00, 0x00, 0x00, 0x00, 0x00]); // Reserved for function size

  const funcBodyStart = code.length;

  // 32 i32 locals: m0-m15, s0-s15
  put([0x01]); // 1 local declaration
  put([0x20, 0x7f]); // 32 x i32

  // Helper: generate G function inline
  function emitG(a: number, b: number, c: number, d: number, mx: number, my: number): void {
    // s[a] = (s[a] + s[b] + m[x]) | 0
    put([0x20, 16 + a]); // local.get s[a]
    put([0x20, 16 + b]); // local.get s[b]
    put([0x6a]); // i32.add
    put([0x20, mx]); // local.get m[x]
    put([0x6a]); // i32.add
    put([0x21, 16 + a]); // local.set s[a]

    // s[d] ^= s[a]
    put([0x20, 16 + d]); // local.get s[d]
    put([0x20, 16 + a]); // local.get s[a]
    put([0x73]); // i32.xor
    put([0x21, 16 + d]); // local.set s[d]

    // s[d] = rotr(s[d], 16)
    put([0x20, 16 + d]); // local.get s[d]
    put([0x41, 0x10]); // i32.const 16
    put([0x78]); // i32.rotr
    put([0x21, 16 + d]); // local.set s[d]

    // s[c] = (s[c] + s[d]) | 0
    put([0x20, 16 + c]); // local.get s[c]
    put([0x20, 16 + d]); // local.get s[d]
    put([0x6a]); // i32.add
    put([0x21, 16 + c]); // local.set s[c]

    // s[b] ^= s[c]
    put([0x20, 16 + b]); // local.get s[b]
    put([0x20, 16 + c]); // local.get s[c]
    put([0x73]); // i32.xor
    put([0x21, 16 + b]); // local.set s[b]

    // s[b] = rotr(s[b], 12)
    put([0x20, 16 + b]); // local.get s[b]
    put([0x41, 0x0c]); // i32.const 12
    put([0x78]); // i32.rotr
    put([0x21, 16 + b]); // local.set s[b]

    // s[a] = (s[a] + s[b] + m[y]) | 0
    put([0x20, 16 + a]); // local.get s[a]
    put([0x20, 16 + b]); // local.get s[b]
    put([0x6a]); // i32.add
    put([0x20, my]); // local.get m[y]
    put([0x6a]); // i32.add
    put([0x21, 16 + a]); // local.set s[a]

    // s[d] ^= s[a]
    put([0x20, 16 + d]); // local.get s[d]
    put([0x20, 16 + a]); // local.get s[a]
    put([0x73]); // i32.xor
    put([0x21, 16 + d]); // local.set s[d]

    // s[d] = rotr(s[d], 8)
    put([0x20, 16 + d]); // local.get s[d]
    put([0x41, 0x08]); // i32.const 8
    put([0x78]); // i32.rotr
    put([0x21, 16 + d]); // local.set s[d]

    // s[c] = (s[c] + s[d]) | 0
    put([0x20, 16 + c]); // local.get s[c]
    put([0x20, 16 + d]); // local.get s[d]
    put([0x6a]); // i32.add
    put([0x21, 16 + c]); // local.set s[c]

    // s[b] ^= s[c]
    put([0x20, 16 + b]); // local.get s[b]
    put([0x20, 16 + c]); // local.get s[c]
    put([0x73]); // i32.xor
    put([0x21, 16 + b]); // local.set s[b]

    // s[b] = rotr(s[b], 7)
    put([0x20, 16 + b]); // local.get s[b]
    put([0x41, 0x07]); // i32.const 7
    put([0x78]); // i32.rotr
    put([0x21, 16 + b]); // local.set s[b]
  }

  // Load message words (offset 0)
  // NOTE: i32.const uses SIGNED LEB128, so we must use toSignedLeb128
  for (let i = 0; i < 16; i++) {
    put([0x41, ...toSignedLeb128(i * 4)]); // i32.const offset
    put([0x28, 0x02, 0x00]); // i32.load align=4 offset=0
    put([0x21, i]); // local.set $i (m0-m15)
  }

  // Load chaining value (offset 64)
  for (let i = 0; i < 8; i++) {
    put([0x41, ...toSignedLeb128(64 + i * 4)]); // i32.const offset
    put([0x28, 0x02, 0x00]); // i32.load
    put([0x21, 16 + i]); // local.set s0-s7
  }

  // s8-s11 = IV[0-3]
  for (let i = 0; i < 4; i++) {
    put([0x41, ...toSignedLeb128(IV[i])]); // i32.const IV[i]
    put([0x21, 24 + i]); // local.set s8-s11
  }

  // s12 = counter_low (offset 128)
  put([0x41, ...toSignedLeb128(128)]); // i32.const
  put([0x28, 0x02, 0x00]); // i32.load
  put([0x21, 28]); // local.set s12

  // s13 = counter_high (offset 132)
  put([0x41, ...toSignedLeb128(132)]); // i32.const
  put([0x28, 0x02, 0x00]); // i32.load
  put([0x21, 29]); // local.set s13

  // s14 = block_len (offset 136)
  put([0x41, ...toSignedLeb128(136)]); // i32.const
  put([0x28, 0x02, 0x00]); // i32.load
  put([0x21, 30]); // local.set s14

  // s15 = flags (offset 140)
  put([0x41, ...toSignedLeb128(140)]); // i32.const
  put([0x28, 0x02, 0x00]); // i32.load
  put([0x21, 31]); // local.set s15

  // 7 rounds of mixing
  for (let round = 0; round < 7; round++) {
    const p = PERMUTATIONS[round];

    // Column mixing: G(0,4,8,12), G(1,5,9,13), G(2,6,10,14), G(3,7,11,15)
    emitG(0, 4, 8, 12, p[0], p[1]);
    emitG(1, 5, 9, 13, p[2], p[3]);
    emitG(2, 6, 10, 14, p[4], p[5]);
    emitG(3, 7, 11, 15, p[6], p[7]);

    // Diagonal mixing: G(0,5,10,15), G(1,6,11,12), G(2,7,8,13), G(3,4,9,14)
    emitG(0, 5, 10, 15, p[8], p[9]);
    emitG(1, 6, 11, 12, p[10], p[11]);
    emitG(2, 7, 8, 13, p[12], p[13]);
    emitG(3, 4, 9, 14, p[14], p[15]);
  }

  // Store output (offset 96): out[i] = s[i] ^ s[i+8]
  for (let i = 0; i < 8; i++) {
    put([0x41, ...toSignedLeb128(96 + i * 4)]); // i32.const offset
    put([0x20, 16 + i]); // local.get s[i]
    put([0x20, 24 + i]); // local.get s[i+8]
    put([0x73]); // i32.xor
    put([0x36, 0x02, 0x00]); // i32.store align=4 offset=0
  }

  put([0x0b]); // end

  // Backpatch function size
  const funcBodyEnd = code.length;
  const funcSize = funcBodyEnd - funcBodyStart;
  const funcSizeBytes = toLebU32Padded5(funcSize);
  for (let i = 0; i < 5; i++) {
    code[funcSizeOffset + i] = funcSizeBytes[i];
  }

  // Backpatch section size
  const sectionEnd = code.length;
  const sectionSize = sectionEnd - sectionSizeOffset - 5;
  const sectionSizeBytes = toLebU32Padded5(sectionSize);
  for (let i = 0; i < 5; i++) {
    code[sectionSizeOffset + i] = sectionSizeBytes[i];
  }

  return new Uint8Array(code);
}

// WASM instance
let wasmMemory: WebAssembly.Memory | null = null;
let wasmCompress1x: (() => void) | null = null;
let mem32: Uint32Array | null = null;

/**
 * Initialize the single-way WASM module
 */
export async function initSingleWayWasm(): Promise<void> {
  if (wasmCompress1x) return;

  wasmMemory = new WebAssembly.Memory({ initial: 1 });
  const wasmBytes = generateWasmBytes();

  const module = await WebAssembly.compile(wasmBytes as BufferSource);
  const instance = await WebAssembly.instantiate(module, {
    js: { mem: wasmMemory },
  });

  wasmCompress1x = instance.exports.compress1x as () => void;
  mem32 = new Uint32Array(wasmMemory.buffer);
}

/**
 * Synchronous initialization
 */
export function initSingleWayWasmSync(): void {
  if (wasmCompress1x) return;

  wasmMemory = new WebAssembly.Memory({ initial: 1 });
  const wasmBytes = generateWasmBytes();

  const module = new WebAssembly.Module(wasmBytes as BufferSource);
  const instance = new WebAssembly.Instance(module, {
    js: { mem: wasmMemory },
  });

  wasmCompress1x = instance.exports.compress1x as () => void;
  mem32 = new Uint32Array(wasmMemory.buffer);
}

/**
 * Get the memory view for setting up inputs
 */
export function getMemory(): { mem32: Uint32Array; memory: WebAssembly.Memory } {
  if (!mem32 || !wasmMemory) {
    throw new Error("WASM not initialized");
  }
  return { mem32, memory: wasmMemory };
}

/**
 * Run the compress1x function
 */
export function compress1x(): void {
  if (!wasmCompress1x) {
    throw new Error("WASM not initialized");
  }
  wasmCompress1x();
}
