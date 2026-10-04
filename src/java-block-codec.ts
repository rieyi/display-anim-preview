/** Resolves Blockbench's built-in Java block/item compiler without owning another format. */

export interface JavaBlockCodec {
  compile(options?: { prevent_dialog?: boolean }): string;
}

function isCompilingCodec(value: unknown): value is JavaBlockCodec {
  return Boolean(
    value && typeof (value as { compile?: unknown }).compile === "function"
  );
}

/**
 * Some third-party formats remove `Codecs.java_block` from the registry when they unload, while
 * Blockbench's built-in Java format still retains the live codec instance. Fall back from the
 * built-in Java format to the codec registry.
 *
 * `Format.codec` is deliberately NOT consulted: the live JDA format object's `codec` resolves to
 * `Codecs.project` (Blockbench reassigns it after registration), whose `compile()` serializes the
 * whole bbmodel project instead of producing a Java item model — that mismatch used to crash the
 * resource pack writer with `value.startsWith is not a function` when it received Texture objects
 * instead of texture reference strings.
 */
export function resolveJavaBlockCodec(): JavaBlockCodec {
  const candidates: unknown[] = [
    typeof Formats !== "undefined" ? Formats.java_block?.codec : undefined,
    typeof Codecs !== "undefined" ? Codecs.java_block : undefined,
  ];

  const codec = candidates.find(isCompilingCodec);
  if (!codec) {
    throw new Error(
      "Blockbench's Java block/item model compiler is unavailable. Reload Blockbench and try again."
    );
  }
  return codec;
}
