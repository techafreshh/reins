/**
 * CLI spelling shim for action names.
 *
 * The framework CLI validates `process.argv[2]` against
 * `/^[a-z][a-z0-9-]*$/` (underscores rejected), while the HTTP surface
 * keeps serving the legacy `snake_case` paths. This pure mapper rewrites a
 * snake_case CLI argument to its kebab-case file so both spellings dispatch
 * to the canonical implementation.
 *
 * `hasKebabFile` is injected (filesystem in `actions/run.ts`, stubbed in
 * tests) so unknown underscore names still fall through to the framework's
 * "not found" behavior instead of being rewritten to a missing file.
 */
export function resolveCliActionName(
  raw: string | undefined,
  hasKebabFile: (kebabName: string) => boolean,
): string | undefined {
  if (!raw || !raw.includes("_") || raw.startsWith("-")) {
    return raw;
  }
  const kebab = raw.replace(/_/g, "-");
  return hasKebabFile(kebab) ? kebab : raw;
}
