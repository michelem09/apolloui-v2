import { fireEvent, screen, waitFor } from '@testing-library/react';
import { print } from 'graphql';
import { useLazyQuery, useMutation } from '@apollo/client';
import { renderWithProviders } from '../test-utils';
import Setup from '../pages/setup';
import { presetPools } from '../lib/utils';

// John: "If you add a space before or after the pool url it throws error".
// Setup accepted it (its URL check is unanchored) and saved the padded value, so
// this drives the wizard from the pool step to the save that follows setup.

jest.mock('next/router', () => ({ useRouter: () => ({ reload: jest.fn(), replace: jest.fn() }) }));
jest.mock('../contexts/DeviceConfigContext', () => ({
  useDeviceConfig: () => ({ deviceType: 'apollo', hasUsbMiners: false }),
}));
jest.mock('@apollo/client', () => ({
  ...jest.requireActual('@apollo/client'),
  useLazyQuery: jest.fn(),
  useMutation: jest.fn(() => [jest.fn(), {}]),
}));

const fns = {};
const calls = {};

beforeEach(() => {
  for (const k of Object.keys(calls)) delete calls[k];
  for (const k of Object.keys(fns)) delete fns[k];
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
    calls[name] = fns[name];
    return [fns[name], {}];
  });
  // v2.2 writes are mutations (login stays a lazy query): the pool write is
  // looked up by its document, like the query ones above.
  useMutation.mockImplementation((document) => {
    const name = document ? print(document) : '';
    if (!fns[name]) {
      fns[name] = jest.fn(async () => ({ data: { Auth: { setup: { error: null } } } }));
    }
    return [fns[name], {}];
  });
});

afterEach(() => {
  useMutation.mockImplementation(() => [jest.fn(), {}]);
  useLazyQuery.mockImplementation(() => [jest.fn(), {}]);
});

const savePoolsFn = () =>
  Object.entries(fns).find(([name]) => name.includes('updateAll'))[1];

const change = (selector, value) =>
  fireEvent.change(document.querySelector(selector), { target: { value } });

describe('Setup wizard — edge whitespace in the pool', () => {
  it('saves the URL and worker trimmed, and the password as typed', async () => {
    renderWithProviders(<Setup />);

    fireEvent.click(screen.getByRole('button')); // welcome -> mining type
    // Mining type: the second button chooses a pool (the first is solo).
    const customIndex = presetPools.findIndex((p) => p.id === 'custom');
    fireEvent.click(screen.getAllByRole('button')[1]);

    await waitFor(() => expect(document.querySelector('#poolPreset')).toBeInTheDocument());
    change('#poolPreset', String(customIndex));
    change('#poolUrl', '  stratum+tcp://pool.example.com:3333 ');
    change('#poolUsername', ' wallet.w1 ');
    change('#poolPassword', ' pw ');
    fireEvent.submit(document.querySelector('#poolUrl').closest('form'));

    await waitFor(() => expect(document.querySelectorAll('input').length).toBe(2));
    const [pw, verify] = document.querySelectorAll('input');
    fireEvent.change(pw, { target: { value: 'longpass1' } });
    fireEvent.change(verify, { target: { value: 'longpass1' } });
    fireEvent.submit(pw.closest('form'));

    await waitFor(() => expect(savePoolsFn()).toHaveBeenCalled());
    const { pools } = savePoolsFn().mock.calls[0][0].variables.input;
    expect(pools).toEqual([
      {
        enabled: true,
        url: 'stratum+tcp://pool.example.com:3333',
        username: 'wallet.w1',
        password: ' pw ',
        index: 1,
      },
    ]);
  });
});
