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
});
