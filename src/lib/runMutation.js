/**
 * Run a useMutation() trigger the way the old lazy-query triggers behaved: it
 * never throws, and resolves to { data, error }. A transport or GraphQL-level
 * failure arrives as `error` (the Apollo error link has already raised the
 * toast), a refusal inside the payload is still read from `data…error` by the
 * caller. Without this a failed save is an unhandled rejection.
 */
export async function runMutation(mutate, options) {
  try {
    const result = await mutate(options);
    return { data: result?.data, error: null };
  } catch (error) {
    return { data: undefined, error };
  }
}
