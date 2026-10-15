import { runMutation } from './runMutation';

describe('runMutation', () => {
  it('resolves to the data of a successful mutation', async () => {
    const mutate = jest.fn().mockResolvedValue({ data: { a: 1 } });
    expect(await runMutation(mutate, { variables: { x: 1 } })).toEqual({ data: { a: 1 }, error: null });
    expect(mutate).toHaveBeenCalledWith({ variables: { x: 1 } });
  });

  it('turns a rejection into { error } instead of throwing', async () => {
    const boom = new Error('Failed to fetch');
    const out = await runMutation(jest.fn().mockRejectedValue(boom));
    expect(out).toEqual({ data: undefined, error: boom });
  });

  it('reports GraphQL errors that resolve under errorPolicy all as `error`, keeping data', async () => {
    const mutate = jest.fn().mockResolvedValue({
      data: { Pool: null },
      errors: [{ message: 'Cannot return null for non-nullable field' }],
    });
    const out = await runMutation(mutate);
    expect(out.error).not.toBeNull();
    expect(out.error.message).toMatch(/non-nullable/);
    expect(out.data).toEqual({ Pool: null });
  });
});
