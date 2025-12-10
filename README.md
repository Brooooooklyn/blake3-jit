# blake3-jit

[![CI](https://github.com/Brooooooklyn/blake3-jit/actions/workflows/ci.yml/badge.svg)](https://github.com/Brooooooklyn/blake3-jit/actions/workflows/ci.yml)

High-performance BLAKE3 implementation with runtime JIT WASM SIMD.

## Features

- **1.38 GB/s** peak throughput on large inputs
- **Pure JS + JIT WASM SIMD** - no `.wasm` files to ship
- All BLAKE3 modes: hash, keyed (MAC), derive_key
- XOF (eXtendable Output Function) support
- Zero dependencies, tree-shakeable

## Installation

```bash
npm install blake3-jit
```

## Usage

```typescript
import { hash, createHasher, createKeyed, createDeriveKey } from 'blake3-jit';

// One-shot hashing
const digest = hash(new Uint8Array([1, 2, 3]));

// Incremental hashing
const hasher = createHasher();
hasher.update(chunk1);
hasher.update(chunk2);
const result = hasher.finalize();

// Keyed hashing (MAC)
const mac = createKeyed(key).update(message).finalize();

// Key derivation
const derived = createDeriveKey("my-app v1").update(material).finalize(32);
```

## API

### One-shot Functions

```typescript
hash(input: Uint8Array, outputLength?: number): Uint8Array
hashInto(input: Uint8Array, output: Uint8Array, outputLength?: number): void
```

### Incremental Hashing

```typescript
createHasher(): Hasher
createKeyed(key: Uint8Array): Hasher    // 32-byte key for MAC
createDeriveKey(context: string): Hasher // Key derivation

class Hasher {
  update(data: Uint8Array): this
  finalize(outputLength?: number): Uint8Array
  finalizeXof(): XofReader
}

class XofReader {
  read(length: number): Uint8Array
}
```

### SIMD Control

```typescript
warmupSimd(): boolean  // Pre-initialize WASM SIMD
```

## Architecture

```
blake3-jit
├── JS Path (<4KB)      Pure JavaScript, SMI-optimized compress
└── WASM SIMD (>=4KB)   4-way parallel, JIT-generated at runtime
    ├── compress4x      Single block x 4 chunks
    ├── compressChunks4x 16 blocks x 4 chunks batched
    └── compressParent   Merkle tree merges
```

**Key optimizations:**

- SMI variables force V8 32-bit integer ALU
- Arena pattern: all buffers in WASM linear memory (zero GC)
- Runtime WASM codegen eliminates `.wasm` file dependency

## Benchmarks

Compared against native Rust (`@napi-rs/blake-hash`):

| Size | blake3-jit | @napi-rs  | Notes           |
| ---- | ---------- | --------- | --------------- |
| 96B  | 362 MB/s   | 149 MB/s  | **2.4x faster** |
| 512B | 748 MB/s   | 521 MB/s  | **1.4x faster** |
| 1KB  | 811 MB/s   | 701 MB/s  | **1.2x faster** |
| 32KB | 1.36 GB/s  | 1.97 GB/s | native wins     |
| 1MB  | 1.38 GB/s  | 2.06 GB/s | native wins     |

**Pure JS beats native Rust for small inputs** due to FFI overhead.

## License

MIT
