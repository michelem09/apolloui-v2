import { useCallback, useEffect, useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Flex,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Progress,
  Text,
  useColorModeValue,
} from '@chakra-ui/react';
import { useApolloClient } from '@apollo/client';
import { useDispatch, useSelector } from 'react-redux';
import { useIntl } from 'react-intl';
import { DISCOVER_MQTT_QUERY, CACHED_MQTT_TOPICS_QUERY, END_MQTT_BROWSE_QUERY } from '../../graphql/mqtt';
import {
  cacheFailed,
  cacheLoaded,
  filterChanged,
  filterTopics,
  scanFailed,
  scanFinished,
  scanStarted,
} from '../../redux/slices/mqttBrowseSlice';

// The explicit scan runs a fixed wildcard subscription window (kept in sync with
// the backend cap in services/mqtt/client.js discoverTopics). Long enough to catch
// an interval publisher (e.g. a ~40s solar bridge) that isn't retained. The modal
// itself opens on the backend's topic cache and does not need it.
const SCAN_SECONDS = 60;
// While the modal is open, re-read the cache so values and ages stay current.
const CACHE_POLL_MS = 5000;

// A short segment name for a topic, sanitized for use as a signal name.
const nameFromTopic = (topic) =>
  (topic.split('/').filter(Boolean).pop() || 'input').replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 24);

const pathValue = (t, path) => (t.pathValues || []).find((x) => x.path === path)?.value ?? null;

const sanitizeName = (s) => String(s || '').replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 24);

/**
 * Browse the broker: scan for topics (wildcard subscription for a few seconds),
 * then pick one — or a numeric field inside a JSON payload — to add as an input.
 */
const MqttBrowseModal = ({ isOpen, onClose, brokerInput, onPick, mapped = [] }) => {
  const intl = useIntl();
  const rowBg = useColorModeValue('secondaryGray.300', 'whiteAlpha.100');
  // Fill and track from tokens with real contrast in both modes (the app's dark
  // mode is Chakra's color mode, not prefers-color-scheme).
  const trackBg = useColorModeValue('secondaryGray.400', 'whiteAlpha.300');
  const fillBg = useColorModeValue('brand.500', 'white');
  const subTextColor = useColorModeValue('secondaryGray.600', 'secondaryGray.400');

  const client = useApolloClient();
  const dispatch = useDispatch();
  const { topics, cacheError, cacheWarning, scan, filter } = useSelector((state) => state.mqttBrowse);
  const loading = scan.running;

  // The cache read: what the device's own broker connection has seen so far.
  const loadCache = useCallback(async () => {
    try {
      const { data } = await client.query({ query: CACHED_MQTT_TOPICS_QUERY, fetchPolicy: 'no-cache' });
      const r = data?.Mqtt?.cachedTopics;
      if (r?.error) return dispatch(cacheFailed(r.error.message));
      if (!r?.result?.ok) return dispatch(cacheFailed(r?.result?.error || ''));
      return dispatch(cacheLoaded({ topics: r.result.topics, loadedAt: Date.now(), warning: r.result.error }));
    } catch (e) {
      return dispatch(cacheFailed(e.message));
    }
  }, [client, dispatch]);

  // Each read renews the device's browse session (it listens to the whole broker
  // only while someone is looking); closing the modal ends it, and if the browser
  // just vanishes the device ends it itself after a few minutes.
  useEffect(() => {
    if (!isOpen) return undefined;
    loadCache();
    const id = setInterval(loadCache, CACHE_POLL_MS);
    return () => {
      clearInterval(id);
      client.query({ query: END_MQTT_BROWSE_QUERY, fetchPolicy: 'no-cache' }).catch(() => {});
    };
  }, [isOpen, loadCache, client]);

  // The scan duration is fixed (SCAN_SECONDS), so show a real progress bar and a
  // countdown. The start time is in the store, so reopening the modal mid-scan
  // picks the bar up where it is.
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!loading) return undefined;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [loading]);

  const elapsed = loading ? Math.max((now - scan.startedAt) / 1000, 0) : 0;
  // Cap at 99% until the results actually arrive (a hair past SCAN_SECONDS).
  const progress = Math.min((elapsed / SCAN_SECONDS) * 100, 99);
  const remaining = Math.max(Math.ceil(SCAN_SECONDS - elapsed), 0);

  // On demand only. The promise belongs to the store, not to this component, so
  // closing the modal does not lose the scan.
  const runScan = async () => {
    if (scan.running) return;
    dispatch(scanStarted(Date.now()));
    try {
      const { data } = await client.query({
        query: DISCOVER_MQTT_QUERY,
        variables: { input: brokerInput(), prefix: null, seconds: SCAN_SECONDS },
        fetchPolicy: 'no-cache',
      });
      const r = data?.Mqtt?.discoverTopics;
      if (r?.error) return dispatch(scanFailed(r.error.message));
      if (!r?.result?.ok) {
        return dispatch(scanFailed(r?.result?.error || intl.formatMessage({ id: 'automation.mqtt.browse_failed' })));
      }
      // The scan also fed the backend cache; show what it now holds.
      dispatch(scanFinished());
      return loadCache();
    } catch (e) {
      return dispatch(scanFailed(e.message));
    }
  };

  const visible = filterTopics(topics, filter);
  const error = scan.error || cacheError || cacheWarning;

  // "12s ago" / "3 min ago" for a lastSeen timestamp.
  const ago = (iso) => {
    if (!iso) return null;
    const secs = Math.max(Math.round((Date.now() - Date.parse(iso)) / 1000), 0);
    if (secs < 90) return intl.formatRelativeTime(-secs, 'second');
    if (secs < 5400) return intl.formatRelativeTime(-Math.round(secs / 60), 'minute');
    return intl.formatRelativeTime(-Math.round(secs / 3600), 'hour');
  };

  // A topic + field that already is an input cannot be added a second time.
  const isMapped = (topic, jsonPath) => mapped.some((m) => m.topic === topic && (m.jsonPath || '') === (jsonPath || ''));

  const pick = (topic, jsonPath, name, unit) => {
    if (isMapped(topic, jsonPath)) return;
    // Prefer the resolved field/name as the signal name; fall back to the topic.
    const suggested = jsonPath
      ? sanitizeName(jsonPath.split('.').pop())
      : name
      ? sanitizeName(name)
      : nameFromTopic(topic);
    onPick({ name: suggested, topic, jsonPath: jsonPath || '', unit: unit || '' });
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl" isCentered scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>{intl.formatMessage({ id: 'automation.mqtt.browse_title' })}</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <Flex gap="8px" mb="12px" wrap="wrap">
            <Input
              variant="auth"
              size="sm"
              flex="1 1 160px"
              minW="0"
              value={filter}
              onChange={(e) => dispatch(filterChanged(e.target.value))}
              placeholder={intl.formatMessage({ id: 'automation.mqtt.browse_filter' })}
              aria-label={intl.formatMessage({ id: 'automation.mqtt.browse_filter' })}
            />
            <Button
              size="sm"
              variant="brand"
              onClick={runScan}
              isDisabled={loading}
              flex="0 1 auto"
              maxW="100%"
              h="auto"
              minH="32px"
              py="6px"
              whiteSpace="normal"
              textAlign="center"
            >
              {intl.formatMessage({ id: 'automation.mqtt.browse_scan' })}
            </Button>
          </Flex>

          <Text fontSize="xs" color={subTextColor} mb="10px">
            {intl.formatMessage({ id: 'automation.mqtt.browse_value_hint' })}
          </Text>

          {loading && (
            <Box py="12px">
              <Flex justify="space-between" align="baseline" mb="6px">
                <Text fontSize="sm" color={subTextColor}>
                  {intl.formatMessage({ id: 'automation.mqtt.browse_scanning' })}
                </Text>
                <Text fontSize="sm" fontWeight="600" color={subTextColor}>
                  {Math.round(progress)}% · {remaining}s
                </Text>
              </Flex>
              {/* A visible track and a thicker bar: on a dark or pale card the default
                  hairline looked empty for the whole minute. */}
              <Progress
                value={progress}
                height="10px"
                borderRadius="full"
                bg={trackBg}
                sx={{ '& > div': { bg: fillBg } }}
                colorScheme="brand"
                aria-label={intl.formatMessage({ id: 'automation.mqtt.browse_scanning' })}
              />
            </Box>
          )}

          {error && (
            <Text fontSize="sm" color="red.400">
              {error}
            </Text>
          )}

          {topics && !topics.length && (
            <Text fontSize="sm" color={subTextColor}>
              {intl.formatMessage({ id: 'automation.mqtt.browse_none' })}
            </Text>
          )}

          {topics && topics.length > 0 && !visible.length && (
            <Text fontSize="sm" color={subTextColor}>
              {intl.formatMessage({ id: 'automation.mqtt.browse_no_match' })}
            </Text>
          )}

          <Flex direction="column" gap="8px">
            {visible.map((t) => (
              <Box key={t.name ? `${t.topic}#${t.jsonPath || ''}` : t.topic} bg={rowBg} borderRadius="10px" p="10px 12px">
                <Flex justify="space-between" align="center" gap="10px" wrap="wrap">
                  <Box minW="0" flex="1">
                    {/* A resolved Home Assistant sensor: show its name, and the real
                        topic/field it maps to underneath. */}
                    {t.name ? (
                      <>
                        <Flex align="center" gap="8px" wrap="wrap">
                          <Text fontSize="sm" fontWeight="600" wordBreak="break-word">
                            {t.name}
                          </Text>
                          {t.value != null ? (
                            <Text fontSize="sm" fontWeight="700" color="green.400" whiteSpace="nowrap">
                              {t.value}
                              {t.unit ? ` ${t.unit}` : ''}
                            </Text>
                          ) : (
                            <Text fontSize="xs" color={subTextColor}>
                              {t.unit ? `(${t.unit}) ` : ''}
                              {intl.formatMessage({ id: 'automation.mqtt.browse_no_value' })}
                            </Text>
                          )}
                          <Badge colorScheme="green" fontSize="0.6rem">
                            {intl.formatMessage({ id: 'automation.mqtt.browse_ha' })}
                          </Badge>
                        </Flex>
                        <Text fontSize="xs" color={subTextColor} noOfLines={1} wordBreak="break-all">
                          {t.topic}
                          {t.jsonPath ? ` · ${t.jsonPath}` : ''}
                          {t.lastSeen ? ` · ${ago(t.lastSeen)}` : ''}
                        </Text>
                      </>
                    ) : (
                      <>
                        <Text fontSize="sm" fontWeight="600" wordBreak="break-all">
                          {t.topic}
                        </Text>
                        {t.sample && (
                          <Text fontSize="xs" color={subTextColor} noOfLines={1}>
                            {t.sample}
                          </Text>
                        )}
                        {t.lastSeen && (
                          <Text fontSize="xs" color={subTextColor}>
                            {intl.formatMessage({ id: 'automation.mqtt.browse_seen' }, { ago: ago(t.lastSeen) })}
                          </Text>
                        )}
                      </>
                    )}
                  </Box>
                  {/* Resolved sensor or a plain (non-JSON) payload: one-click map. */}
                  {(t.name || !t.jsonPaths || !t.jsonPaths.length) && (
                    <Button
                      size="xs"
                      variant="light"
                      isDisabled={isMapped(t.topic, t.jsonPath)}
                      onClick={() => pick(t.topic, t.jsonPath, t.name, t.unit)}
                    >
                      {intl.formatMessage({
                        id: isMapped(t.topic, t.jsonPath) ? 'automation.mqtt.browse_mapped' : 'automation.mqtt.browse_use',
                      })}
                    </Button>
                  )}
                </Flex>

                {/* JSON payload: offer the numeric fields as clickable paths. */}
                {!t.name && t.jsonPaths && t.jsonPaths.length > 0 && (
                  <Flex gap="6px" mt="8px" wrap="wrap">
                    {t.jsonPaths.map((p) => (
                      <Badge
                        key={p}
                        as="button"
                        disabled={isMapped(t.topic, p)}
                        opacity={isMapped(t.topic, p) ? 0.5 : 1}
                        title={isMapped(t.topic, p) ? intl.formatMessage({ id: 'automation.mqtt.browse_mapped' }) : undefined}
                        colorScheme="pink"
                        px="8px"
                        py="3px"
                        borderRadius="6px"
                        onClick={() => pick(t.topic, p)}
                      >
                        {isMapped(t.topic, p) ? '✓ ' : ''}
                        {p}
                        {pathValue(t, p) != null ? ` = ${pathValue(t, p)}` : ''}
                      </Badge>
                    ))}
                  </Flex>
                )}
              </Box>
            ))}
          </Flex>
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" onClick={onClose}>
            {intl.formatMessage({ id: 'automation.editor.cancel' })}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default MqttBrowseModal;
