// Kebab-case alias: the CLI runner and the runtime action discovery load
// action modules by filename, so `create-job` and `create_job` share this
// one definition. Written as import/export-default (not `export { default }
// from`) so the static registry generator — which maps `-` to `_` for TS
// identifiers and would emit a duplicate `a_create_job` — skips this shim;
// runtime discovery has no such content filter and registers both names.
import base from "./create_job.js";

export default base;
