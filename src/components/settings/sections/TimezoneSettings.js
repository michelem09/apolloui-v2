import React, { useState } from 'react';
import {
  Box,
  Button,
  Flex,
  FormControl,
  Select,
  Text,
  useColorModeValue,
} from '@chakra-ui/react';
import { useQuery, useMutation } from '@apollo/client';
import { useDispatch } from 'react-redux';
import { useIntl } from 'react-intl';
import { MdSchedule, MdWarningAmber } from 'react-icons/md';
import moment from 'moment';
import PanelCard from '../../UI/PanelCard';
import SimpleCard from '../../UI/SimpleCard';
import { useSettings } from '../context/SettingsContext';
import { MCU_TIMEZONE_QUERY, MCU_REBOOT_MUTATION } from '../../../graphql/mcu';
import { sendFeedback } from '../../../redux/slices/feedbackSlice';

/**
 * System timezone.
 *
 * Devices ship with the factory image default and most owners never change it,
 * so the clock is right but the *label* on it is wrong. That skews log
 * timestamps, the timestamps behind the charts, and the hour at which a
 * time-based automation rule fires.
 *
 * Edited into the shared settings state, exactly like the temperature unit:
 * the global save/discard bar picks up the change and applies it on save. No
 * private save button, and nothing restarts.
 */
const TimezoneSettings = () => {
  const intl = useIntl();
  const dispatch = useDispatch();
  const { settings, setSettings } = useSettings();
  const textColor = useColorModeValue('brands.900', 'white');
  const warnBg = useColorModeValue('orange.100', 'whiteAlpha.100');
  const warnText = useColorModeValue('#6B4D00', 'orange.200');
  const [confirmingReboot, setConfirmingReboot] = useState(false);

  // Read-only: fetches the dropdown options and the current system value. The
  // pending selection lives in the settings context, seeded by the settings page.
  // cache-and-network: the warning below must be true every time this page is
  // opened, not whatever the cache happened to keep from the last visit.
  const { data, loading } = useQuery(MCU_TIMEZONE_QUERY, {
    fetchPolicy: 'cache-and-network',
  });
  const available = data?.Mcu?.timezone?.result?.available || [];

  // What the device is on NOW. The select shows the pending choice; this line
  // has to keep telling the truth until the save bar applies it, or it claims a
  // zone change that has not happened.
  const systemZone = data?.Mcu?.timezone?.result?.timezone;

  const value = settings?.timezone || '';

  const handleChange = (e) => setSettings({ ...settings, timezone: e.target.value });

  // Set by the device, not by this page: it compares /etc/localtime against the
  // boot time, so the warning comes back on every visit, in any browser, until
  // the machine has actually restarted.
  const rebootPending = data?.Mcu?.timezone?.result?.rebootPending;

  const [reboot, { loading: rebooting }] = useMutation(MCU_REBOOT_MUTATION, {
    onError: () => {},
  });

  const handleReboot = async () => {
    setConfirmingReboot(false);

    // The backend reports a refusal in the payload, and onError swallows a
    // request that never landed. Announcing a restart either way would leave
    // the user waiting for a machine that never went down, with the warning
    // still on screen and nothing to explain it.
    let failure;
    try {
      const result = await reboot();
      failure = result?.data?.Mcu?.reboot?.error?.message;
    } catch (error) {
      failure = error.message;
    }

    dispatch(
      failure
        ? sendFeedback({ message: failure, type: 'error' })
        : sendFeedback({
            message: intl.formatMessage({ id: 'settings.sections.system.timezone.rebooting' }),
            type: 'info',
          })
    );
  };

  // The browser's own ICU data, which can name a zone this device's tzdata does
  // not have (Europe/Kyiv on an older image): offering it would seed a value the
  // backend refuses.
  const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const detected = available.includes(browserZone) ? browserZone : null;

  // The clock read IN that zone — `moment()` would format the browser's own
  // zone and print an hour that has nothing to do with the name beside it.
  const timeThere = (zone) => {
    if (!zone) return '—';
    try {
      return new Intl.DateTimeFormat('en-GB', {
        timeZone: zone,
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date());
    } catch {
      return moment().format('HH:mm');
    }
  };

  return (
    <PanelCard
      title={intl.formatMessage({ id: 'settings.sections.system.timezone.title' })}
      description={intl.formatMessage({ id: 'settings.sections.system.timezone.description' })}
      textColor={textColor}
      icon={MdSchedule}
      mb="20px"
    >
      <SimpleCard textColor={textColor}>
        <Flex direction="column" gap="10px">
          <FormControl>
            <Select
              value={value}
              onChange={handleChange}
              isDisabled={loading}
              size="lg"
              fontSize="sm"
            >
              {/* Keep the current value selectable even before the list resolves. */}
              {value && !available.includes(value) && <option value={value}>{value}</option>}
              {available.map((zone) => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </Select>
          </FormControl>

          <Text fontSize="xs" color="secondaryGray.600">
            {intl.formatMessage(
              { id: 'settings.sections.system.timezone.current' },
              { timezone: systemZone || '—', time: timeThere(systemZone) }
            )}
          </Text>

          {/* The browser knows where the user is; the device often does not. */}
          {detected && detected !== value && (
            <Button
              size="xs"
              variant="link"
              alignSelf="flex-start"
              onClick={() => setSettings({ ...settings, timezone: detected })}
            >
              {intl.formatMessage(
                { id: 'settings.sections.system.timezone.use_browser' },
                { timezone: detected }
              )}
            </Button>
          )}

          {/* Changing the zone does not reach the processes already running, so
              the logs keep showing the old hour until the system restarts. */}
          {rebootPending && (
            <Box bg={warnBg} borderRadius="12px" p="12px 14px" mt="4px">
              <Flex gap="10px" align="flex-start">
                <Box as={MdWarningAmber} color={warnText} mt="2px" flexShrink={0} size="18px" />
                <Flex direction="column" gap="8px">
                  <Text fontSize="xs" lineHeight="1.45" color={warnText}>
                    {intl.formatMessage({ id: 'settings.sections.system.timezone.reboot_needed' })}
                  </Text>

                  {!confirmingReboot ? (
                    <Button
                      size="xs"
                      colorScheme="orange"
                      alignSelf="flex-start"
                      onClick={() => setConfirmingReboot(true)}
                    >
                      {intl.formatMessage({ id: 'settings.sections.system.timezone.reboot_now' })}
                    </Button>
                  ) : (
                    // Rebooting from a settings panel is one misplaced click away
                    // from cutting the miner off, so it asks first.
                    <Flex gap="8px" align="center">
                      <Button
                        size="xs"
                        colorScheme="orange"
                        isLoading={rebooting}
                        onClick={handleReboot}
                      >
                        {intl.formatMessage({ id: 'settings.sections.system.timezone.reboot_confirm' })}
                      </Button>
                      <Button size="xs" variant="ghost" onClick={() => setConfirmingReboot(false)}>
                        {intl.formatMessage({ id: 'settings.sections.system.timezone.reboot_cancel' })}
                      </Button>
                    </Flex>
                  )}
                </Flex>
              </Flex>
            </Box>
          )}
        </Flex>
      </SimpleCard>
    </PanelCard>
  );
};

export default TimezoneSettings;
