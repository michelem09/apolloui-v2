import { fireEvent, screen, act } from '@testing-library/react';
import { MockedProvider } from '@apollo/client/testing';
import { renderWithProviders } from '../../test-utils';
import BlockFoundCelebration from './BlockFoundCelebration';
import { RESET_BLOCK_FOUND_MUTATION } from '../../graphql/miner';

const mockDispatch = jest.fn();
jest.mock('react-redux', () => ({ useDispatch: () => mockDispatch }));
jest.mock('./Confetti', () => () => null);

const mutationMock = (result) => ({
  request: { query: RESET_BLOCK_FOUND_MUTATION },
  result,
});

const renderWith = (result) =>
  renderWithProviders(
    <MockedProvider mocks={[mutationMock(result)]} addTypename={false}>
      <BlockFoundCelebration blockFound />
    </MockedProvider>
  );

const confirm = async () => {
  fireEvent.click(screen.getByText('Confirm and Reset'));
  await act(() => new Promise((r) => setTimeout(r, 30)));
};

describe('BlockFoundCelebration reset', () => {
  it('a refusal inside the payload is an error, and the celebration stays open', async () => {
    renderWith({
      data: { Miner: { resetBlockFoundFlag: { error: { message: 'database is locked', type: 'DB', path: null, severity: 'error', reasons: [] } } } },
    });
    await confirm();

    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          type: 'error',
          message: expect.stringContaining('database is locked'),
        }),
      })
    );
    // still there, and no success toast
    expect(screen.getByText('Confirm and Reset')).toBeInTheDocument();
    expect(screen.queryByText('The block found notification has been reset')).not.toBeInTheDocument();
  });

  it('a clean answer closes it with the success toast', async () => {
    renderWith({ data: { Miner: { resetBlockFoundFlag: { error: null } } } });
    await confirm();

    expect(screen.queryByText('Confirm and Reset')).not.toBeInTheDocument();
    expect(mockDispatch).not.toHaveBeenCalled();
    expect(await screen.findByText('The block found notification has been reset')).toBeInTheDocument();
  });
});
