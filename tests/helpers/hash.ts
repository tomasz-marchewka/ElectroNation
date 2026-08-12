import { createHash } from "node:crypto";

/**
 * Content hash of a JSON-serializable value. Key order is insertion order,
 * which the engine produces deterministically, so plain stringify suffices.
 */
export function stateHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
