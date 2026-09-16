/**
 * Server-side only: Kariyer Portresi (Arayanlar) preparation model config.
 * Do not import from client components.
 */

export const ARAYANLAR_PREP_MODEL_DEFAULT = "gpt-5.6-sol";

/** Moderate reasoning for CV/fact analysis and personalized prep — not max. */
export const ARAYANLAR_PREP_REASONING_EFFORT = "medium" as const;

/**
 * Explicit prep-model override. Falls back to gpt-5.6-sol.
 * Intentionally separate from OPENAI_MODEL (profile prepare / other AI).
 */
export function resolveArayanlarPrepModel(): string {
  const fromEnv = process.env.ARAYANLAR_PREP_MODEL?.trim();
  return fromEnv && fromEnv.length > 0 ? fromEnv : ARAYANLAR_PREP_MODEL_DEFAULT;
}
