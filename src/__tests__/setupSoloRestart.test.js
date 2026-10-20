import { fireEvent, screen, waitFor } from '@testing-library/react';
import { print } from 'graphql';
import { useLazyQuery, useMutation } from '@apollo/client';
import { renderWithProviders } from '../test-utils';
import Setup from '../pages/setup';

// /setup renders under AuthLayout, where the MINER_BOARDS subscription never runs:
// hasUsbMiners stays at its build-time hint, which a Solo Node no longer has. The
// wizard must restart the miner anyway, or a USB board keeps the previous payout
// address (the miner reads it only at launch).

jest.mock('next/router', () => ({ useRouter: () => ({ reload: jest.fn(), replace: jest.fn() }) }));
jest.mock('../contexts/DeviceConfigContext', () => ({
  useDeviceConfig: () => ({ deviceType: 'solo-node', hasUsbMiners: false }),
}));
jest.mock('@apollo/client', () => ({
  ...jest.requireActual('@apollo/client'),
  useLazyQuery: jest.fn(),
  useMutation: jest.fn(),
}));

// The writes are mutations on v2.2; one stable jest.fn per document.
const fns = {};
beforeEach(() => {
  for (const k of Object.keys(fns)) delete fns[k];
  const stable = (document) => {
    const name = document ? print(document) : '';
    if (!fns[name]) fns[name] = jest.fn(async () => ({ data: {} }));
    return [fns[name], {}];
  };
  useMutation.mockImplementation(stable);
  useLazyQuery.mockImplementation((document) => {
    const name = document ? print(document) : '';
    if (!fns[name]) {
      fns[name] = jest.fn(async () => {
        if (name.includes('login')) {
          return { data: { Auth: { login: { result: { accessToken: 't' } } } } };
        }
        return { data: {} };
      });
    }
    return [fns[name], {}];
  });
});

const fnFor = (needle) => Object.entries(fns).find(([name]) => name.includes(needle))?.[1];

it('Solo Node: finishing setup restarts the miner even with no USB board known', async () => {
  renderWithProviders(<Setup />);
  fireEvent.click(screen.getByRole('button')); // welcome -> wallet
  const wallet = document.querySelector('input');
  fireEvent.change(wallet, { target: { value: `bc1q${'a'.repeat(38)}` } });
  fireEvent.submit(wallet.closest('form'));
  await waitFor(() => expect(document.querySelectorAll('input').length).toBe(2));
  const [pw, verify] = document.querySelectorAll('input');
  fireEvent.change(pw, { target: { value: 'longpass1' } });
  fireEvent.change(verify, { target: { value: 'longpass1' } });
  fireEvent.submit(pw.closest('form'));

  // The last step has the only button on the page.
  const start = await screen.findByRole('button');
  await waitFor(() => expect(fnFor('updateAll')).toHaveBeenCalled());
  fireEvent.click(start);
  const minerRestart = Object.entries(fns).find(
    ([name]) => name.includes('restart') && name.includes('Miner')
  )?.[1];
  await waitFor(() => expect(minerRestart).toHaveBeenCalled());
});
