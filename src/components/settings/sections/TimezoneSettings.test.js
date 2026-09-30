import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MockedProvider } from '@apollo/client/testing';
import { ChakraProvider } from '@chakra-ui/react';
import { IntlProvider } from 'react-intl';

import en from '../../../locales/en.json';
import { flattenMessages } from '../../../lib/utils';
import { SettingsProvider } from '../context/SettingsContext';
import { MCU_TIMEZONE_QUERY, MCU_REBOOT_MUTATION } from '../../../graphql/mcu';
import TimezoneSettings from './TimezoneSettings';

// The panel dispatches one feedback toast when it triggers a reboot; the store
// itself is not what these assertions are about.
const mockDispatch = jest.fn();
jest.mock('react-redux', () => ({ useDispatch: () => mockDispatch }));

// A settings section is only ever exercised at render time; a build passes right
// over one that throws on mount. Mount it, and check it drives the shared
// settings state instead of a private save button.
const timezoneMock = {
  request: { query: MCU_TIMEZONE_QUERY },
  result: {
    data: {
      Mcu: {
        timezone: {
          result: {
            timezone: 'America/New_York',
            available: ['America/New_York', 'Europe/Rome', 'UTC'],
            rebootPending: false,
          },
          error: null,
        },
      },
    },
  },
};

const pendingRebootMock = {
  request: { query: MCU_TIMEZONE_QUERY },
  result: {
    data: {
      Mcu: {
        timezone: {
          result: {
            timezone: 'Europe/Rome',
            available: ['America/New_York', 'Europe/Rome', 'UTC'],
            rebootPending: true,
          },
          error: null,
        },
      },
    },
  },
};

const renderUI = (settings, setSettings, mocks = [timezoneMock]) =>
  render(
    <MockedProvider mocks={mocks} addTypename={false}>
      <ChakraProvider>
        <IntlProvider locale="en" messages={flattenMessages(en)}>
          <SettingsProvider value={{ settings, setSettings }}>
            <TimezoneSettings />
          </SettingsProvider>
        </IntlProvider>
      </ChakraProvider>
    </MockedProvider>
  );

describe('TimezoneSettings', () => {
  it('mounts and lists the zones the device reported', async () => {
    renderUI({ timezone: 'America/New_York' }, () => {});

    expect(await screen.findByRole('option', { name: 'Europe/Rome' })).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toHaveValue('America/New_York');
  });

  it('writes the choice into the shared settings, not a private save', async () => {
    const setSettings = jest.fn();
    renderUI({ timezone: 'America/New_York' }, setSettings);

    await screen.findByRole('option', { name: 'Europe/Rome' });
    await userEvent.selectOptions(screen.getByRole('combobox'), 'Europe/Rome');

    // No own Save button — the global save/discard bar handles it.
    expect(screen.queryByRole('button', { name: /save/i })).not.toBeInTheDocument();
    expect(setSettings).toHaveBeenCalledWith(expect.objectContaining({ timezone: 'Europe/Rome' }));
  });
  // The caption is the only thing on screen that says what the device is on
  // right now. Bound to the pending choice it announced a zone change that had
  // not been applied yet.
  it('keeps naming the zone the device is on while another one is picked', async () => {
    renderUI({ timezone: 'Europe/Rome' }, () => {});

    await screen.findByRole('option', { name: 'Europe/Rome' });
    expect(screen.getByRole('combobox')).toHaveValue('Europe/Rome');

    await waitFor(() =>
      expect(screen.getByText(/Device is on America\/New_York/)).toBeInTheDocument()
    );
    expect(screen.queryByText(/Device is on Europe\/Rome/)).not.toBeInTheDocument();
  });
  // The device decides this, not the browser: the warning has to be there on a
  // plain visit, with no memory of who changed what.
  it('warns that a restart is owed, and asks before doing it', async () => {
    renderUI({ timezone: 'Europe/Rome' }, () => {}, [pendingRebootMock]);

    expect(await screen.findByText(/Restart the system/i)).toBeInTheDocument();

    // One click does not reboot the device.
    await userEvent.click(screen.getByRole('button', { name: /Restart now/i }));
    expect(screen.getByRole('button', { name: /Yes, restart/i })).toBeInTheDocument();
  });

  it('says nothing when no restart is owed', async () => {
    renderUI({ timezone: 'America/New_York' }, () => {});

    await screen.findByRole('option', { name: 'Europe/Rome' });
    expect(screen.queryByText(/Restart the system/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Restart now/i })).not.toBeInTheDocument();
  });
  // A reboot the device refused, announced as if it had happened, leaves the
  // user waiting for a machine that never went down.
  it('reports a refused reboot instead of announcing one', async () => {
    const rebootRefused = {
      request: { query: MCU_REBOOT_MUTATION },
      result: { data: { Mcu: { reboot: { error: { message: 'Failed to reboot device: sudo' } } } } },
    };

    renderUI({ timezone: 'Europe/Rome' }, () => {}, [pendingRebootMock, rebootRefused]);

    await screen.findByText(/Restart the system/i);
    await userEvent.click(screen.getByRole('button', { name: /Restart now/i }));
    await userEvent.click(screen.getByRole('button', { name: /Yes, restart/i }));

    await waitFor(() =>
      expect(mockDispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({ type: 'error' }),
        })
      )
    );
  });

  // The browser can name a zone this device's tzdata does not have.
  it('does not offer a browser zone the device would refuse', async () => {
    const elsewhere = {
      request: { query: MCU_TIMEZONE_QUERY },
      result: {
        data: {
          Mcu: {
            timezone: {
              result: { timezone: 'UTC', available: ['UTC'], rebootPending: false },
              error: null,
            },
          },
        },
      },
    };

    renderUI({ timezone: 'UTC' }, () => {}, [elsewhere]);

    await screen.findByRole('option', { name: 'UTC' });
    expect(screen.queryByRole('button', { name: /browser/i })).not.toBeInTheDocument();
  });
});
