import { ApolloError } from '@apollo/client';

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
    // The client runs mutations with errorPolicy 'all', so a GraphQL failure
    // RESOLVES with { data, errors } instead of rejecting: surface it as `error`.
    const error = result?.errors?.length ? new ApolloError({ graphQLErrors: result.errors }) : null;
    return { data: result?.data, error };
  } catch (error) {
    return { data: undefined, error };
  }
}
