import { mongo } from "mongoose";

// Lean queries return BSON Binary for Buffer fields; documents return Buffers. Accept both.
export function toBuffer(value: Buffer | mongo.Binary | Uint8Array): Buffer {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof mongo.Binary) return Buffer.from(value.buffer);
  return Buffer.from(value);
}
