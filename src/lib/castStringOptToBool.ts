import type { Options as CreateOptions } from '../cmds/versions/create.js';
import type { Options as UpdateOptions } from '../cmds/versions/update.js';

/**
 * Takes a CLI flag that is expected to be a 'true' or 'false' string
 * and casts it to a boolean.
 */
export default function castStringOptToBool(
  opt: 'true' | 'false' | undefined,
  optName: keyof CreateOptions | keyof UpdateOptions,
) {
  if (!opt) {
    return undefined;
  }
  if (opt === 'true') {
    return true;
  }
  if (opt === 'false') {
    return false;
  }
  throw new Error(`Invalid option passed for '${optName}'. Must be 'true' or 'false'.`);
}
