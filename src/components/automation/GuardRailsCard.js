import {
  Box,
  Button,
  Flex,
  FormControl,
  FormLabel,
  Icon,
  Input,
  Select,
  SimpleGrid,
  Text,
  Tooltip,
  useColorModeValue,
  VisuallyHidden,
} from '@chakra-ui/react';
import { MdPlayCircleOutline, MdPowerSettingsNew, MdWarningAmber } from 'react-icons/md';
import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import Card from '../card/Card';

const FIELDS = [
  { key: 'minOnMinutes', unit: 'min' },
  { key: 'minOffMinutes', unit: 'min' },
  { key: 'minChangeMinutes', unit: 'min' },
  { key: 'maxCyclesPerHour', unit: '/h' },
  { key: 'defaultHysteresis', unit: '' },
  { key: 'overrideMinutes', unit: 'min' },
];

// Colour-coded on purpose: "off" is the safe one (green), "keep" can leave the
// miner running on battery overnight (amber), "on" runs a chosen mode (blue).
const FALLBACK_TILES = [
  { value: 'off', icon: MdPowerSettingsNew, scheme: 'green' },
  { value: 'keep', icon: MdWarningAmber, scheme: 'orange' },
  { value: 'on', icon: MdPlayCircleOutline, scheme: 'blue' },
];

// Native radios on purpose (not Chakra's useRadio): same keyboard behaviour for
// free (shared name = arrow keys), and focus ring via CSS :focus-visible, since
// useRadio's focus tracking throws under jsdom when two tests mount it.
const FallbackTile = ({ tile, checked, onSelect, children }) => {
  const { value, icon, scheme } = tile;
  const intl = useIntl();
  const accent = useColorModeValue(`${scheme}.500`, `${scheme}.300`);
  const selectedBg = useColorModeValue(`${scheme}.50`, `${scheme}.900`);
  const idleBorder = useColorModeValue('secondaryGray.400', 'whiteAlpha.300');
  const titleColor = useColorModeValue('secondaryGray.900', 'white');
  const bodyColor = useColorModeValue('secondaryGray.700', 'secondaryGray.400');

  return (
    <Flex direction="column" gap="8px">
    <Box as="label" cursor="pointer" display="block" flex="1">
      <VisuallyHidden
        as="input"
        type="radio"
        name="fallbackAction"
        value={value}
        checked={checked}
        onChange={() => onSelect(value)}
      />
      <Flex
        gap="12px"
        align="flex-start"
        p="14px"
        h="100%"
        borderWidth="2px"
        borderRadius="16px"
        borderColor={checked ? accent : idleBorder}
        bg={checked ? selectedBg : 'transparent'}
        opacity={checked ? 1 : 0.85}
        transition="all 0.15s"
        _hover={{ borderColor: accent, opacity: 1 }}
        sx={{ 'input:focus-visible + &': { boxShadow: 'outline' } }}
      >
        <Icon as={icon} boxSize="28px" color={accent} flexShrink={0} />
        <Flex direction="column">
          <Text color={titleColor} fontWeight="700" fontSize="md">
            {intl.formatMessage({ id: `automation.guards.fallback.${value}` })}
          </Text>
          <Text color={bodyColor} fontSize="sm">
            {intl.formatMessage({ id: `automation.guards.fallback.${value}.desc` })}
          </Text>
        </Flex>
      </Flex>
    </Box>
    {children}
    </Flex>
  );
};

const FallbackTiles = ({ value, onChange, modes }) => {
  const intl = useIntl();
  const onMode = value?.startsWith('on:') ? value.slice(3) : null;
  // A stored "on:<mode>" whose mode is not offered on this device checks no tile:
  // the value stays untouched until the user picks one.
  const modeKnown = onMode !== null && modes.includes(onMode);
  const tiles = modes.length ? FALLBACK_TILES : FALLBACK_TILES.filter((t) => t.value !== 'on');

  const select = (v) => {
    // Modes are listed most conservative first, so the first one is the default.
    onChange(v === 'on' ? `on:${modeKnown ? onMode : modes[0]}` : v);
  };

  return (
    <SimpleGrid
      role="radiogroup"
      aria-label={intl.formatMessage({ id: 'automation.guards.fallback' })}
      columns={{ base: 1, md: tiles.length }}
      spacing="12px"
    >
      {tiles.map((tile) => {
        const checked = tile.value === 'on' ? modeKnown : value === tile.value;
        return (
          <FallbackTile key={tile.value} tile={tile} checked={checked} onSelect={select}>
            {tile.value === 'on' && checked && (
              <Select
                variant="auth"
                size="sm"
                aria-label={intl.formatMessage({ id: 'automation.guards.fallback.on.mode' })}
                value={onMode}
                onChange={(e) => onChange(`on:${e.target.value}`)}
              >
                {modes.map((m) => (
                  <option key={m} value={m}>
                    {intl.formatMessage({ id: `settings.sections.miner.modes.${m}.title`, defaultMessage: m })}
                  </option>
                ))}
              </Select>
            )}
          </FallbackTile>
        );
      })}
    </SimpleGrid>
  );
};

const GuardRailsCard = ({ config, minerModes = [], onSave, isSaving }) => {
  const intl = useIntl();
  const textColor = useColorModeValue('secondaryGray.900', 'white');
  const subTextColor = useColorModeValue('secondaryGray.600', 'secondaryGray.400');

  const [draft, setDraft] = useState({});

  useEffect(() => {
    if (!config) return;
    setDraft({
      minOnMinutes: config.minOnMinutes,
      minOffMinutes: config.minOffMinutes,
      minChangeMinutes: config.minChangeMinutes,
      maxCyclesPerHour: config.maxCyclesPerHour,
      defaultHysteresis: config.defaultHysteresis,
      overrideMinutes: config.overrideMinutes,
      fallbackAction: config.fallbackAction,
    });
  }, [config]);

  // Only send fields the user actually left set. An emptied number input is
  // Number('') === 0, which would silently disable that guard rail; the backend
  // patches (an omitted key stays unchanged), so skip blank/invalid fields and
  // keep the stored value instead of clobbering it with 0.
  const handleSave = () => {
    const payload = { fallbackAction: draft.fallbackAction };
    for (const { key } of FIELDS) {
      const raw = draft[key];
      if (raw === '' || raw === null || raw === undefined) continue;
      const n = Number(raw);
      if (Number.isFinite(n)) payload[key] = n;
    }
    onSave(payload);
  };

  return (
    <Card p="20px">
      <Flex direction="column" gap="14px">
        <Flex direction="column">
          <Text color={textColor} fontSize="lg" fontWeight="700">
            {intl.formatMessage({ id: 'automation.guards.title' })}
          </Text>
          {/* Why these exist, in one line: an ASIC that is cycled every minute dies. */}
          <Text color={subTextColor} fontSize="sm">
            {intl.formatMessage({ id: 'automation.guards.description' })}
          </Text>
        </Flex>

        {/* The one choice that decides what the miner does at night or without
            data, so it gets its own prominent block above the numeric fields. */}
        <Flex direction="column" gap="8px">
          <Tooltip label={intl.formatMessage({ id: 'automation.guards.fallback.tooltip' })}>
            <Text color={textColor} fontSize="md" fontWeight="700" w="fit-content">
              {intl.formatMessage({ id: 'automation.guards.fallback' })}
            </Text>
          </Tooltip>
          <Text color={subTextColor} fontSize="sm">
            {intl.formatMessage({ id: 'automation.guards.fallback.hint' })}
          </Text>
          <FallbackTiles
            value={draft.fallbackAction}
            onChange={(v) => setDraft({ ...draft, fallbackAction: v })}
            modes={minerModes}
          />
          {draft.fallbackAction?.startsWith('on:') && !minerModes.includes(draft.fallbackAction.slice(3)) && (
            <Text color={subTextColor} fontSize="xs">
              {intl.formatMessage(
                { id: 'automation.guards.fallback.current' },
                { value: draft.fallbackAction }
              )}
            </Text>
          )}
        </Flex>

        {/* Two even columns, so a longer label like "Min interval (min)" has room
            instead of wrapping in the narrow card. */}
        <SimpleGrid columns={2} spacingX="12px" spacingY="10px">
          {FIELDS.map(({ key, unit }) => (
            <FormControl key={key}>
              <Tooltip label={intl.formatMessage({ id: `automation.guards.${key}.tooltip` })}>
                <FormLabel fontSize="xs" color={subTextColor} noOfLines={1}>
                  {intl.formatMessage({ id: `automation.guards.${key}` })}
                  {unit && ` (${unit})`}
                </FormLabel>
              </Tooltip>
              <Input
                variant="auth"
                size="sm"
                type="number"
                value={draft[key] ?? ''}
                onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
              />
            </FormControl>
          ))}

        </SimpleGrid>

        <Flex justify="flex-end">
          <Button
            size="sm"
            variant="brand"
            isLoading={isSaving}
            onClick={handleSave}
          >
            {intl.formatMessage({ id: 'automation.actions.save' })}
          </Button>
        </Flex>
      </Flex>
    </Card>
  );
};

export default GuardRailsCard;
