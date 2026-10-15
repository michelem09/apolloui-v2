import {
  Badge,
  Button,
  Flex,
  FormControl,
  FormLabel,
  IconButton,
  Input,
  Link,
  Text,
  useColorModeValue,
} from '@chakra-ui/react';
import NextLink from 'next/link';
import { useEffect, useState } from 'react';
import { useQuery, useLazyQuery } from '@apollo/client';
import { useIntl } from 'react-intl';
import { useDispatch } from 'react-redux';
import { sendFeedback } from '../../redux/slices/feedbackSlice';
import { MdAdd, MdDelete, MdSearch } from 'react-icons/md';
import Card from '../card/Card';
import { GET_MQTT_QUERY, SET_MQTT_QUERY } from '../../graphql/mqtt';
import MqttBrowseModal from './MqttBrowseModal';

/**
 * MQTT input signals for the automation — the only MQTT config that belongs here.
 * The broker itself is set in Settings → MQTT (shared with the output side); this
 * card just maps topics to input.<name> signals the rules can react to.
 */
const MqttInputsCard = ({ onSaved }) => {
  const intl = useIntl();
  const dispatch = useDispatch();
  const textColor = useColorModeValue('secondaryGray.900', 'white');
  const subTextColor = useColorModeValue('secondaryGray.600', 'secondaryGray.400');
  const rowBg = useColorModeValue('secondaryGray.300', 'whiteAlpha.100');

  const { data, refetch } = useQuery(GET_MQTT_QUERY, { fetchPolicy: 'network-only' });
  const [saveMqtt, { loading: saving }] = useLazyQuery(SET_MQTT_QUERY, { fetchPolicy: 'no-cache' });

  const config = data?.Mqtt?.config?.result;
  const brokerSet = !!(config?.enabled && config?.host);

  const [inputs, setInputs] = useState([]);
  const [browseOpen, setBrowseOpen] = useState(false);

  useEffect(() => {
    if (!config) return;
    // A config saved before duplicates were refused may hold the same name (or the
    // same topic + field) twice: show each once, and the next Save stores it clean.
    const names = new Set();
    const sources = new Set();
    const clean = [];
    for (const i of config.inputs || []) {
      const source = `${i.topic}\u0000${i.jsonPath || ''}`;
      if (names.has(i.name) || sources.has(source)) continue;
      names.add(i.name);
      sources.add(source);
      clean.push({ name: i.name, topic: i.topic, jsonPath: i.jsonPath || '', unit: i.unit || '' });
    }
    setInputs(clean);
  }, [config]);

  // Broker connection for Browse — the backend fills in the stored password.
  const brokerInput = () => ({
    enabled: config?.enabled,
    host: config?.host || null,
    port: config?.port || 1883,
    username: config?.username || null,
    tls: config?.tls || false,
  });

  const setInput = (i, patch) => setInputs((list) => list.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));

  const save = async () => {
    const { data: saved } = await saveMqtt({
      variables: {
        input: {
          inputs: inputs
            .filter((x) => x.name && x.topic)
            .map((x) => ({ name: x.name, topic: x.topic, jsonPath: x.jsonPath || null, unit: x.unit || null })),
        },
      },
    });
    // A refused save (e.g. a duplicate name) must be seen, not swallowed.
    const refused = saved?.Mqtt?.updateConfig?.error;
    if (refused) {
      dispatch(sendFeedback({ message: refused.message, type: 'error' }));
      return;
    }
    await refetch();
    // The saved inputs are input.<name> signals: whoever holds the signal
    // descriptors (the rule editor's condition list) must reload them, or a new,
    // renamed or removed input stays out of sync until a page reload.
    if (onSaved) await onSaved();
  };

  const status = config?.status;

  return (
    <Card p="20px">
      <Flex direction="column" gap="14px">
        <Flex justify="space-between" align="center" wrap="wrap" gap="8px">
          <Flex direction="column">
            <Text color={textColor} fontSize="lg" fontWeight="700">
              {intl.formatMessage({ id: 'automation.mqtt.inputs' })}
            </Text>
            <Text color={subTextColor} fontSize="sm">
              {intl.formatMessage({ id: 'automation.mqtt.inputs_desc' })}
            </Text>
          </Flex>
          {config?.enabled &&
            (status?.connected ? (
              <Badge colorScheme="green">{intl.formatMessage({ id: 'automation.mqtt.connected' })}</Badge>
            ) : (
              <Badge colorScheme="red">{status?.error || intl.formatMessage({ id: 'automation.mqtt.disconnected' })}</Badge>
            ))}
        </Flex>

        {!brokerSet && (
          <Text fontSize="sm" color={subTextColor}>
            {intl.formatMessage(
              { id: 'automation.mqtt.broker_hint' },
              {
                link: (
                  <Link as={NextLink} href="/settings/mqtt" fontWeight="700" textDecoration="underline">
                    {intl.formatMessage({ id: 'automation.mqtt.broker_link' })}
                  </Link>
                ),
              }
            )}
          </Text>
        )}

        <Flex justify="flex-end" gap="8px">
          <Button size="xs" variant="light" leftIcon={<MdSearch />} onClick={() => setBrowseOpen(true)} isDisabled={!brokerSet}>
            {intl.formatMessage({ id: 'automation.mqtt.browse' })}
          </Button>
          <Button
            size="xs"
            variant="light"
            leftIcon={<MdAdd />}
            onClick={() => setInputs((list) => [...list, { name: '', topic: '', jsonPath: '', unit: '' }])}
          >
            {intl.formatMessage({ id: 'automation.mqtt.add_input' })}
          </Button>
        </Flex>

        <MqttBrowseModal
          isOpen={browseOpen}
          onClose={() => setBrowseOpen(false)}
          brokerInput={brokerInput}
          mapped={inputs}
          onPick={(input) =>
            setInputs((list) => {
              // The same topic + field is never mapped twice, and a signal name is
              // unique (input.<name> is the id a rule selects).
              if (list.some((x) => x.topic === input.topic && (x.jsonPath || '') === (input.jsonPath || ''))) return list;
              const taken = new Set(list.map((x) => x.name));
              let name = input.name;
              for (let n = 2; taken.has(name); n += 1) name = `${input.name.slice(0, 22)}_${n}`;
              return [...list, { ...input, name }];
            })
          }
        />

        {!inputs.length && (
          <Text fontSize="xs" color={subTextColor}>{intl.formatMessage({ id: 'automation.mqtt.inputs_hint' })}</Text>
        )}

        {inputs.map((input, i) => (
          <Flex key={i} bg={rowBg} borderRadius="10px" p="10px" gap="8px" align="flex-end" wrap="wrap">
            <FormControl w="120px">
              <FormLabel fontSize="xs" color={subTextColor}>{intl.formatMessage({ id: 'automation.mqtt.name' })}</FormLabel>
              <Input variant="auth" size="sm" value={input.name} onChange={(e) => setInput(i, { name: e.target.value.replace(/[^a-zA-Z0-9_]/g, '') })} placeholder="surplus" />
            </FormControl>
            <FormControl flex="2" minW="160px">
              <FormLabel fontSize="xs" color={subTextColor}>{intl.formatMessage({ id: 'automation.mqtt.topic' })}</FormLabel>
              <Input variant="auth" size="sm" value={input.topic} onChange={(e) => setInput(i, { topic: e.target.value })} placeholder="sun2000/state" />
            </FormControl>
            <FormControl w="130px">
              <FormLabel fontSize="xs" color={subTextColor}>{intl.formatMessage({ id: 'automation.mqtt.json_path' })}</FormLabel>
              <Input variant="auth" size="sm" value={input.jsonPath} onChange={(e) => setInput(i, { jsonPath: e.target.value })} placeholder="total_yield" />
            </FormControl>
            <FormControl w="70px">
              <FormLabel fontSize="xs" color={subTextColor}>{intl.formatMessage({ id: 'automation.mqtt.unit' })}</FormLabel>
              <Input variant="auth" size="sm" value={input.unit} onChange={(e) => setInput(i, { unit: e.target.value })} placeholder="W" />
            </FormControl>
            <IconButton
              aria-label={intl.formatMessage({ id: 'automation.mqtt.remove_input' })}
              icon={<MdDelete />}
              size="sm"
              variant="ghost"
              onClick={() => setInputs((list) => list.filter((_, idx) => idx !== i))}
            />
          </Flex>
        ))}

        <Flex justify="flex-end">
          <Button size="sm" variant="brand" onClick={save} isLoading={saving}>
            {intl.formatMessage({ id: 'automation.actions.save' })}
          </Button>
        </Flex>
      </Flex>
    </Card>
  );
};

export default MqttInputsCard;
