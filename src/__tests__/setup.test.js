import { fireEvent, screen, waitFor } from '@testing-library/react';
import { print } from 'graphql';
import { useLazyQuery, useMutation } from '@apollo/client';
import { renderWithProviders } from '../test-utils';
import Setup from '../pages/setup';

const mockReplace = jest.fn();
jest.mock('next/router', () => ({ useRouter: () => ({ reload: jest.fn(), replace: mockReplace }) }));
// The miner restart only runs on a Solo Node when a USB hashboard is plugged in.
let mockHasUsbMiners = false;
jest.mock('../contexts/DeviceConfigContext', () => ({
  useDeviceConfig: () => ({ deviceType: 'solo-node', hasUsbMiners: mockHasUsbMiners }),
}));
jest.mock('@apollo/client', () => ({
  ...jest.requireActual('@apollo/client'),
  useLazyQuery: jest.fn(() => [jest.fn(), {}]),
  useMutation: jest.fn(() => [jest.fn(), {}]),
}));

const VALID_ADDR = 'bc1q' + 'a'.repeat(38); // passes isValidBitcoinAddress

// Drive the solo-node wizard: Welcome -> Wallet (valid address) -> Password.
const gotoPasswordStep = async () => {
  renderWithProviders(<Setup />);
  fireEvent.click(screen.getByRole('button')); // Welcome "get started" -> wallet
  const walletInput = document.querySelector('input');
  fireEvent.change(walletInput, { target: { value: VALID_ADDR } });
  fireEvent.submit(walletInput.closest('form')); // valid address -> password step
  await waitFor(() => expect(document.querySelectorAll('input').length).toBe(2));
};

const submitPasswords = (pw, verify) => {
  const [pwInput, verifyInput] = document.querySelectorAll('input');
  fireEvent.change(pwInput, { target: { value: pw } });
  fireEvent.change(verifyInput, { target: { value: verify } });
  fireEvent.submit(pwInput.closest('form'));
};

describe('Setup wizard — password step validation (solo-node path)', () => {
  it('rejects a password shorter than 8 characters', async () => {
    await gotoPasswordStep();
    submitPasswords('123', '123');
    expect(await screen.findByText('Password must be at least 8 characters long')).toBeInTheDocument();
  });

  it('rejects mismatched passwords', async () => {
    await gotoPasswordStep();
    submitPasswords('longpass1', 'longpass2');
    expect(await screen.findByText('Passwords do not match')).toBeInTheDocument();
  });

  it('rejects an invalid wallet address on the wallet step', async () => {
    renderWithProviders(<Setup />);
    fireEvent.click(screen.getByRole('button')); // Welcome -> wallet
    const walletInput = document.querySelector('input');
    fireEvent.change(walletInput, { target: { value: 'not-a-btc-address' } });
    fireEvent.submit(walletInput.closest('form'));
    expect(await screen.findByText('Please add a valid Bitcoin address')).toBeInTheDocument();
    // stays on the wallet step (no password inputs yet)
    expect(document.querySelectorAll('input').length).toBe(1);
  });
});


// The wizard used to CREATE a pool, which left whatever was already configured
// in place. The miner config is built from the lowest priority first, so with
// two pools sharing priority 1 the older one won and the pool chosen here
// silently became the backup — the device kept mining to the previous pool.
// A factory-fresh device hid it: the only other pool sits at priority 99.
describe('Setup wizard — pools', () => {
  it('replaces the pool set rather than adding to it', () => {
    renderWithProviders(<Setup />);

    // The pool write is a mutation, not a lazy query.
    const documents = useMutation.mock.calls
      .map(([document]) => (document ? print(document) : ''))
      .join('\n');

    expect(documents).toContain('mutation UPDATE_POOLS');
    expect(documents).toContain('updateAll');
    expect(documents).not.toContain('create (input: $input)');
  });
});

// The client runs mutations with errorPolicy 'all': a GraphQL failure resolves
// with { data, errors } instead of rejecting. The wizard must stop on it, not
// announce "complete" with the pool unsaved.
describe('Setup wizard — a GraphQL error on the pool write', () => {
  afterEach(() => {
    useMutation.mockImplementation(() => [jest.fn(), {}]);
    useLazyQuery.mockImplementation(() => [jest.fn(), {}]);
  });

  it('stops with the error and does not reach the complete step', async () => {
    const ok = { data: { Auth: { setup: { error: null } } } };
    useMutation.mockImplementation((doc) => {
      const text = print(doc);
      if (text.includes('UPDATE_POOLS')) {
        return [jest.fn().mockResolvedValue({ data: { Pool: null }, errors: [{ message: 'pool write exploded' }] }), {}];
      }
      return [jest.fn().mockResolvedValue(ok), {}];
    });
    useLazyQuery.mockImplementation(() => [
      jest.fn().mockResolvedValue({ data: { Auth: { login: { result: { accessToken: 't' }, error: null } } } }),
      {},
    ]);

    await gotoPasswordStep();
    submitPasswords('longpass1', 'longpass1');

    expect(await screen.findByText(/pool write exploded/)).toBeInTheDocument();
  });
});


// The last step restarts the miner and then leaves for /signin. A call that
// fails outright (UNAUTHENTICATED, network) arrives as `error`, not inside the
// payload: it used to be ignored and the wizard went on as if the miner had
// restarted.
describe('Setup wizard — starting mining', () => {
  afterEach(() => {
    mockHasUsbMiners = false;
    useMutation.mockImplementation(() => [jest.fn(), {}]);
    useLazyQuery.mockImplementation(() => [jest.fn(), {}]);
  });

  const reachCompleteStep = async (restartResult) => {
    mockHasUsbMiners = true;
    const restart = jest.fn().mockResolvedValue(restartResult);
    const ok = { data: { Auth: { setup: { error: null } }, Pool: { updateAll: { error: null } }, Node: { start: { error: null } } } };
    useMutation.mockImplementation((doc) => {
      const text = print(doc);
      if (text.includes('MINER_RESTART')) return [restart, {}];
      return [jest.fn().mockResolvedValue(ok), {}];
    });
    useLazyQuery.mockImplementation(() => [
      jest.fn().mockResolvedValue({ data: { Auth: { login: { result: { accessToken: 't' }, error: null } } } }),
      {},
    ]);
    await gotoPasswordStep();
    submitPasswords('longpass1', 'longpass1');
    // the complete step's only button
    fireEvent.click(await screen.findByRole('button', { name: /start/i }));
    return restart;
  };

  it('stays on the wizard with the message when the restart call itself fails', async () => {
    const restart = await reachCompleteStep({ data: undefined, errors: [{ message: 'not authenticated' }] });
    await waitFor(() => expect(restart).toHaveBeenCalled());
    expect(await screen.findByText(/not authenticated/)).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('goes to /signin when the restart is clean', async () => {
    const restart = await reachCompleteStep({ data: { Miner: { restart: { error: null } } } });
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/signin'));
    expect(restart).toHaveBeenCalled();
  });
});
