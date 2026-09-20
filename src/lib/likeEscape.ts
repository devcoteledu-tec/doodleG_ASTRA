/**
 * Escape SQL LIKE/ILIKE metacharacters so caller-supplied strings behave
 * as literal matches rather than patterns.
 *
 * Any userName / display name / free-text lookup that ends up in a
 * `.ilike()` or `.like()` filter must pass through this first. Without it,
 * a value containing `%` or `_` silently becomes a wildcard: e.g.
 *   .ilike('user_name', 'j%n')   ← matches 'jon', 'john', 'jason', ...
 * The `\` character is also escaped, so an attacker can't smuggle in an
 * escape of their own.
 *
 * Previously duplicated inline in signin/route.ts; signup/route.ts didn't
 * have it at all, which allowed pattern injection into the uniqueness
 * check. Consolidating here removes the drift risk.
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}
