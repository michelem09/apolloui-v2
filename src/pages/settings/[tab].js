import {
  Box,
  Alert,
  AlertIcon,
  AlertTitle,
  AlertDescription,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
  Text,
  Flex,
  Button,
  Spinner,
  Switch,
  FormLabel,
  Input,
} from '@chakra-ui/react';
import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { useDispatch, useSelector, shallowEqual } from 'react-redux';
import { useQuery, useLazyQuery, useMutation } from '@apollo/client';
import { useIntl } from 'react-intl';
import { PoolIcon } from '../../components/UI/Icons/PoolIcon';
import { MinerIcon } from '../../components/UI/Icons/MinerIcon';
import { NodeIcon } from '../../components/UI/Icons/NodeIcon';
import { SystemIcon } from '../../components/UI/Icons/SystemIcon';
import { MdSettings, MdHistory, MdWifiTethering } from 'react-icons/md';
import { GrUserWorker } from 'react-icons/gr';
import { GET_SETTINGS_QUERY, SET_SETTINGS_MUTATION } from '../../graphql/settings';
import { GET_POOLS_QUERY, UPDATE_POOLS_MUTATION } from '../../graphql/pools';
import { MINER_RESTART_MUTATION } from '../../graphql/miner';
import { MCU_TIMEZONE_QUERY, MCU_SET_TIMEZONE_MUTATION } from '../../graphql/mcu';
import {
  GET_AUTOMATION_CONFIG_QUERY,
  SET_AUTOMATION_CONFIG_MUTATION,
} from '../../graphql/automation';
import { GET_MQTT_QUERY, SET_MQTT_MUTATION } from '../../graphql/mqtt';
import { runMutation } from '../../lib/runMutation';
import { sendFeedback } from '../../redux/slices/feedbackSlice';
import { SettingsProvider } from '../../components/settings/context/SettingsContext';
import PoolsTab from '../../components/settings/tabs/PoolsTab';
import MinerTab from '../../components/settings/tabs/MinerTab';
import SoloTab from '../../components/settings/tabs/SoloTab';
import NodeTab from '../../components/settings/tabs/NodeTab';
import SystemTab from '../../components/settings/tabs/SystemTab';
import MqttSettingsCard from '../../components/mqtt/MqttSettingsCard';
import ExtraTab from '../../components/settings/tabs/ExtraTab';
import LogsTab from '../../components/settings/tabs/LogsTab';
import ModalRestore from '../../components/apollo/ModalRestore';
import ModalConnectNode from '../../components/apollo/ModalConnectNode';
import _ from 'lodash';
import moment from 'moment';
import {
  isValidBitcoinAddress,
  isCompatibleBitcoinAddress,
} from '../../lib/utils';
import { mcuSelector } from '../../redux/reselect/mcu';
import { CHANGE_PASSWORD_MUTATION } from '../../graphql/auth';
import { useDeviceConfig, useDeviceType } from '../../contexts/DeviceConfigContext';
import { servicesSelector } from '../../redux/reselect/services';
import { minerRestartFieldsFor, restartPlanFor, savedMessageIdFor } from '../../lib/runRestarts';
import { settingsTabsFor } from '../../lib/settingsTabs';
import usePoolProfiles from '../../hooks/usePoolProfiles';
import useSettingsDraft from '../../hooks/useSettingsDraft';
import { poolFieldsChanged, suggestPoolName } from '../../lib/poolOptions';
import { buildPoolsInput } from '../../lib/poolsInput';
import { savePendingPools } from '../../lib/savePendingPools';
import { applyTimezone } from '../../lib/applyTimezone';
import { runSteps } from '../../lib/callFailure';
import { runRestarts } from '../../lib/runRestarts';
import { isUnauthenticated } from '../../lib/authRefusal';
import { saveFailureText } from '../../lib/saveFailureText';

// These writes report their failure themselves (the form's inline alert, or the
// restore's own message): the global toast for the same error would repeat it.
const SILENT = { silentErrors: true };

const RESTORABLE_SETTINGS_FIELDS = [
  'agree',
  'minerMode',
  'voltage',
  'frequency',
  'fan_low',
  'fan_high',
  'apiAllow',
  'customApproval',
  'connectedWifi',
  'leftSidebarVisibility',
  'leftSidebarExtended',
  'rightSidebarVisibility',
  'temperatureUnit',
  'powerLedOff',
  'nodeEnableTor',
  'nodeUserConf',
  'nodeEnableSoloMining',
  'nodeMaxConnections',
  'nodeAllowLan',
  'btcsig',
  'startdiff',
  'mindiff',
  'nodeSoftware',
];

// Settings that end up in ckpool's conf (see settings.js ckpoolConfigChanged).
const SOLO_CONF_FIELDS = ['btcsig', 'startdiff', 'mindiff'];

const SettingsTab = () => {
  const intl = useIntl();
  const deviceType = useDeviceType();
  const { hasUsbMiners, isSoloNode, hasMiner } = useDeviceConfig();
  const router = useRouter();
  const dispatch = useDispatch();
  const {
    settings,
    setSettings,
    currentSettings,
    setCurrentSettings,
    loadSettings,
    seedTimezone,
    markSaved,
    requestReplace,
    settle,
    forgetPasswordPair,
  } = useSettingsDraft();
  // Bumped once a save/restore has refetched; see the effect that settles the draft.
  const [reloadSettled, setReloadSettled] = useState(0);
  const [restoreData, setRestoreData] = useState();
  const [isChanged, setIsChanged] = useState(false);
  // Whether the miner is stopped decides if a save restarts it (restartPlanFor).
  // Node and ckpool are restarted by the backend, which knows if they are running;
  // the solo service is read only to tell the user a stopped ckpool has not seen
  // the new conf yet.
  const { data: servicesStatusData } = useSelector(servicesSelector, shallowEqual);
  const minerService = servicesStatusData?.miner;
  const soloService = servicesStatusData?.solo;
  // Saved pools, and the pending "keep this one" the action bar offers. A pool
  // is worth offering to keep only when it is not already in the list — picking
  // a preset or a saved profile has nothing new to remember.
  const { profiles: poolProfiles, save: savePoolProfile } = usePoolProfiles();
  // One pending "keep this" per pool: a single flag kept whichever pool the
  // handler happened to read, which is not the one the user was looking at when
  // they turned it on. Gated on isChanged because saving a profile rides on the
  // Save button — with nothing to save there is no button to press.
  const emptySave = { enabled: false, name: '' };
  const [poolToSave, setPoolToSave] = useState({
    primary: emptySave,
    backup: emptySave,
  });
  // Per pool, not per page: one global "something changed" made editing the
  // primary offer to keep the backup pool as well.
  const poolSaveOffered = {
    primary: poolFieldsChanged(currentSettings?.pool, settings?.pool),
    backup: poolFieldsChanged(currentSettings?.backupPool, settings?.backupPool),
  };
  const [restartNeeded, setRestartNeeded] = useState(null);
  // 'miner' | 'solo' when a field changed that a stopped service will only read at its next start.
  const [restartSkipped, setRestartSkipped] = useState(null);
  const [errorForm, setErrorForm] = useState(null);
  const [isModalRestoreOpen, setIsModalRestoreOpen] = useState(false);
  // The format dialog and its progress now live at layout level (FormatTaskContext),
  // so a running format is watched — and its outcome reported — from any page, not
  // just here. The Extra tab's Format button opens it via that context.
  const [isModalConnectOpen, setIsModalConnectOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [browserHostname, setBrowserHostname] = useState(null);

  useEffect(() => {
    setBrowserHostname(window.location.hostname);
  }, []);

  // Get the current tab from the URL
  const { tab } = router.query;
  
  // The tabs follow what the box has. A Solo Node mines only into its own node, so
  // it never gets Pools; its Miner tab exists only while a board is plugged in.
  const tabNames = settingsTabsFor({ isSoloNode, hasMiner });
  const tabMapping = Object.fromEntries(tabNames.map((name, index) => [name, index]));

  // Get current tab index from URL
  const currentTabIndex = tabMapping[tab] || 0;

  // Mcu data from Redux
  const { data: dataMcu } = useSelector(mcuSelector, shallowEqual);
  const { network } = dataMcu || {};

  // Calculate node address for connection modal
  const eth0 = network ? _.find(network, { name: 'eth0' }) : null;
  const wlan0 = network ? _.find(network, { name: 'wlan0' }) : null;
  const localAddress = wlan0?.address || eth0?.address;
  const rpcHost = browserHostname || localAddress;
  const formattedRpcHost =
    rpcHost?.includes(':') && !rpcHost.startsWith('[') ? `[${rpcHost}]` : rpcHost;
  const nodeAddress = formattedRpcHost
    ? `${formattedRpcHost}:8332`
    : 'Unavailable';

  // Queries
  const {
    loading: loadingSettings,
    error: errorQuerySettings,
    data: dataSettings,
    refetch: refetchSettings,
  } = useQuery(GET_SETTINGS_QUERY);

  const {
    loading: loadingPools,
    error: errorQueryPools,
    data: dataPools,
    refetch: refetchPools,
  } = useQuery(GET_POOLS_QUERY);

  // Every write below is a mutation (a query would be re-run by a re-render).
  // runMutation keeps the old lazy-query contract the save handler reads:
  // resolve to { data, error }, never throw.
  const [saveSettingsMutation, { loading: loadingSave }] = useMutation(SET_SETTINGS_MUTATION);
  const saveSettings = (o) => runMutation(saveSettingsMutation, o);

  const [savePoolsMutation, { loading: loadingSavePools }] = useMutation(UPDATE_POOLS_MUTATION);
  const savePools = (o) => runMutation(savePoolsMutation, o);

  const [restartMinerMutation, { loading: loadingMinerRestart }] = useMutation(MINER_RESTART_MUTATION);
  const restartMiner = (o) => runMutation(restartMinerMutation, o);

  const [changeLockPasswordMutation, { loading: changeLockPasswordLoading }] =
    useMutation(CHANGE_PASSWORD_MUTATION);
  const changeLockPassword = (o) => runMutation(changeLockPasswordMutation, o);

  // Timezone is a system setting (timedatectl), not a row in the settings table,
  // but it rides the same save/discard bar as the temperature unit: the current
  // value is seeded into `settings` so a change lights up the bar, and the save
  // handler applies it with its own mutation.
  // network-only, not no-cache: a no-cache result never lands in the cache, so
  // refetching after a save would leave the panel's own copy stale — and with it
  // the "a restart is still owed" warning it reads from the same query.
  const { data: dataTimezone, refetch: refetchTimezone } = useQuery(
    MCU_TIMEZONE_QUERY,
    { fetchPolicy: 'network-only' }
  );

  // A mutation, not a query: applying a zone is an action, and a query would be
  // free to re-fire on a re-render.
  const [setTimezone, { loading: loadingSetTimezone }] = useMutation(
    MCU_SET_TIMEZONE_MUTATION
  );

  const systemTimezone = dataTimezone?.Mcu?.timezone?.result?.timezone;

  // Device location (lat/long) is stored in the automation config but edited here
  // in Settings, riding the same save bar. Only the sun signals use it.
  const { data: dataAutomation, refetch: refetchAutomation } = useQuery(
    GET_AUTOMATION_CONFIG_QUERY,
    { fetchPolicy: 'no-cache' }
  );

  const [saveAutomationConfigMutation, { loading: loadingSaveLocation }] = useMutation(
    SET_AUTOMATION_CONFIG_MUTATION
  );
  const saveAutomationConfig = (o) => runMutation(saveAutomationConfigMutation, o);

  const automationConfig = dataAutomation?.Automation?.config?.result;

  // System-level MQTT (broker + output), edited here and riding the same save bar.
  const { data: dataMqtt, refetch: refetchMqtt } = useQuery(GET_MQTT_QUERY, { fetchPolicy: 'no-cache' });
  const [saveMqttMutation] = useMutation(SET_MQTT_MUTATION);
  const saveMqtt = (o) => runMutation(saveMqttMutation, o);
  const mqttConfig = dataMqtt?.Mqtt?.config?.result;

  // MQTT rides the save bar but is kept in its OWN state, decoupled from the big
  // `settings` object — the settings-load effect rebuilds `settings` on every
  // refetch and would otherwise wipe a pending MQTT edit.
  const [mqttDraft, setMqttDraft] = useState(null);
  const [mqttBaseline, setMqttBaseline] = useState(null);
  const mqttChanged = !!mqttDraft && !_.isEqual(mqttDraft, mqttBaseline);

  // Handle tab change
  const handleTabChange = (index) => {
    const newTab = tabNames[index];
    router.push(`/settings/${newTab}`);
  };

  // Load initial settings
  useEffect(() => {
    if (
      loadingSettings ||
      loadingPools ||
      errorQuerySettings ||
      errorQueryPools
    )
      return;

    const {
      Pool: {
        list: {
          error: errorPools,
          result: { pools: poolsData },
        },
      },
    } = dataPools;

    const {
      Settings: {
        read: {
          error: errorSettings,
          result: { settings: settingsData },
        },
      },
    } = dataSettings;

    // Use the first pool if it exists, otherwise create a default empty pool
    const poolToUse = poolsData && poolsData.length > 0 
      ? poolsData[0] 
      : {
          enabled: true,
          url: deviceType === 'solo-node' ? 'stratum+tcp://127.0.0.1:3333' : '',
          username: '',
          password: 'x',
          index: 1,
        };

    // A second pool is the backup one: the miner takes them in index order, so
    // whatever sits after the primary is what it falls back to.
    const backupPoolToUse =
      poolsData && poolsData.length > 1
        ? poolsData[1]
        : { enabled: false, url: '', username: '', password: 'x', index: 2 };

    const finalSettings = { ...settingsData, pool: poolToUse, backupPool: backupPoolToUse };
    // Not a plain setSettings: a choice made before this answer arrived must
    // survive it (see useSettingsDraft).
    loadSettings(finalSettings);
  }, [
    loadingSettings,
    loadingPools,
    dataSettings,
    dataPools,
    errorQuerySettings,
    errorQueryPools,
    deviceType,
    loadSettings,
  ]);

  // After the load above (declared later, so it runs after it in the same commit):
  // a save or restore whose refetch brought nothing new never loaded, and its
  // flag must not wait for the next unrelated arrival.
  useEffect(() => {
    if (reloadSettled) settle();
  }, [reloadSettled, settle]);

  // Seed the current system timezone into both baselines once it arrives, so
  // picking a different one lights up the save bar and picking the current one
  // does not. Patches instead of rebuilding, so it never wipes a pending edit.
  useEffect(() => {
    if (!systemTimezone || !currentSettings || currentSettings.timezone) return;
    seedTimezone(systemTimezone);
  }, [systemTimezone, currentSettings, seedTimezone]);

  // Same for the device location, seeded once from the automation config. The
  // `_seeded` flag lets a value of null (no location set) still count as a
  // baseline, so clearing it later is detected as a change.
  useEffect(() => {
    if (!automationConfig || !currentSettings || currentSettings._locationSeeded) return;
    const patch = (s) => ({
      ...s,
      latitude: automationConfig.latitude ?? null,
      longitude: automationConfig.longitude ?? null,
      _locationSeeded: true,
    });
    // Both sides keep the seed across reloads (see useSettingsDraft), so this runs
    // once; the working copy is left alone if it was already seeded.
    setSettings((s) => (s._locationSeeded ? s : patch(s)));
    setCurrentSettings(patch);
  }, [automationConfig, currentSettings, setSettings, setCurrentSettings]);

  // Seed the MQTT draft + baseline once the config arrives (own state, not merged
  // into `settings`).
  useEffect(() => {
    if (!mqttConfig || mqttBaseline) return;
    const m = {
      enabled: !!mqttConfig.enabled,
      host: mqttConfig.host || '',
      port: mqttConfig.port || 1883,
      username: mqttConfig.username || '',
      password: '', // never returned; blank means "unchanged"
      tls: !!mqttConfig.tls,
      output: {
        enabled: !!mqttConfig.output?.enabled,
        control: mqttConfig.output?.control !== false,
        // Drop Apollo's __typename — the backend's MqttExportsInput rejects it.
        exports: (({ __typename, ...rest }) => rest)(mqttConfig.output?.exports || {}),
      },
    };
    setMqttDraft(m);
    setMqttBaseline(m);
  }, [mqttConfig, mqttBaseline]);

  // Detect changes and restart needs
  useEffect(() => {
    // Everything that ends up on the miner's command line: the binary reads its
    // configuration once, at startup, so a field changed here without a restart
    // is written to miner_config and then ignored by the running process.
    // Apollo III has its own tuning fields alongside the Apollo I/II ones.
    const restartMinerFields = minerRestartFieldsFor(deviceType);
    const restartNodeFields = [
      'nodeEnableTor',
      'nodeUserConf',
      'nodeMaxConnections',
      'nodeAllowLan',
      'nodeSoftware',
      'nodeEnableSoloMining',
    ];
    const isEqual = _.isEqual(settings, currentSettings);
    
    // Whether a changed field is acted on by a restart depends on the device
    // (a Solo Node only has a USB miner, if one is there) and on the miner being
    // up: see restartPlanFor.
    const minerFieldsChanged = !_.isEqual(
      _.pick(settings, restartMinerFields),
      _.pick(currentSettings, restartMinerFields)
    );

    // The ckpool conf fields (settings._applyServiceLifecycle restarts a running
    // ckpool for them, and leaves a stopped one alone). Only with solo mining
    // already on: switching it on or off starts or stops ckpool itself.
    const soloFieldsChanged =
      !!currentSettings?.nodeEnableSoloMining &&
      !!settings?.nodeEnableSoloMining &&
      !_.isEqual(_.pick(settings, SOLO_CONF_FIELDS), _.pick(currentSettings, SOLO_CONF_FIELDS));

    const restartNodeNeeded = !_.isEqual(
      _.pick(settings, restartNodeFields),
      _.pick(currentSettings, restartNodeFields)
    );

    const plan = restartPlanFor({
      deviceType,
      minerFieldsChanged,
      soloFieldsChanged,
      nodeNeeded: restartNodeNeeded,
      minerService,
      soloService,
      hasUsbMiners,
    });

    if ((!isEqual || mqttChanged) && !settings.initial) setIsChanged(true);
    if (isEqual && !mqttChanged) setIsChanged(false);
    setRestartNeeded(plan.type);
    setRestartSkipped(plan.skipped);
  }, [settings, currentSettings, deviceType, mqttChanged, minerService, soloService, hasUsbMiners]);

  // Handle backup download
  const handleBackup = async () => {
    try {
      const [settingsResponse, poolsResponse] = await Promise.all([
        refetchSettings(),
        refetchPools(),
      ]);
      const settingsRead = settingsResponse.data?.Settings?.read;
      const poolsList = poolsResponse.data?.Pool?.list;
      if (settingsRead?.error) throw new Error(settingsRead.error.message);
      if (poolsList?.error) throw new Error(poolsList.error.message);
      if (!settingsRead?.result?.settings || !poolsList?.result?.pools) {
        throw new Error('Backup data is incomplete');
      }
      const freshBackup = {
        settings: settingsRead.result.settings,
        pools: poolsList.result.pools,
      };

      // The saved pools are configuration like the rest, and this file is the
      // only thing that carries any of it across a reflash. Written out by
      // field: the ids are this device's, and would mean nothing on another.
      const poolProfilesBackup = poolProfiles.map(
        ({ name, url, username, password }) => ({ name, url, username, password })
      );

      const blob = new Blob(
        [JSON.stringify({ ...freshBackup, poolProfiles: poolProfilesBackup })],
        { type: 'application/json' }
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `apollo_backup_${moment().format(
        'YYYY-MM-DD_HH-mm-ss'
      )}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      dispatch(
        sendFeedback({
          message: 'Downloading backup file, keep it safe!',
          type: 'success',
        })
      );
    } catch (error) {
      dispatch(sendFeedback({ message: error.message || String(error), type: 'error' }));
    }
  };

  // Handle restore
  const handleRestoreBackup = async () => {
    try {
      setIsSaving(true);

      if (
        !restoreData ||
        typeof restoreData.settings !== 'object' ||
        restoreData.settings === null ||
        !Array.isArray(restoreData.pools)
      ) {
        throw new Error('Invalid Apollo backup file');
      }
      const { pools, settings, poolProfiles: savedPools } = restoreData;
      // Credentials are appliance-owned runtime state and are never restored
      // from either current or legacy backup files.
      const safeSettings = _.pick(settings, RESTORABLE_SETTINGS_FIELDS);
      const safePools = pools.map((pool) => _.omit(pool, ['__typename']));

      // A failed write stops the restore: reporting "Restore done" over a
      // configuration that was only half written is worse than an error.
      const written = await runSteps([
        { name: 'settings', run: () => saveSettings({ variables: { input: safeSettings }, context: SILENT }) },
        { name: 'pools', run: () => savePools({ variables: { input: { pools: safePools } }, context: SILENT }) },
      ]);
      if (!written.ok) throw new Error(written.message);

      // Backups taken before saved pools existed simply carry none. One that
      // cannot be written back is reported rather than thrown: the settings
      // above are already restored.
      let poolsNotRestored = 0;
      for (const saved of savedPools || []) {
        if (!saved?.name || !saved?.url) continue;
        const kept = await savePoolProfile({
          name: saved.name,
          url: saved.url,
          username: saved.username || null,
          password: saved.password || null,
        });
        if (!kept.ok) poolsNotRestored += 1;
      }

      // The restored values replace the working copy, pending edits included.
      requestReplace();
      await refetchSettings();
      await refetchPools();
      setReloadSettled((n) => n + 1);
      setIsModalRestoreOpen(false);
      dispatch(
        sendFeedback({
          message: poolsNotRestored
            ? `Restore complete, but ${poolsNotRestored} saved pool(s) could not be restored. Node services were updated automatically; restart your miner if its pool changed.`
            : 'Restore complete. Node services were updated automatically; restart your miner if its pool changed.',
          type: poolsNotRestored ? 'error' : 'success',
        })
      );

      setIsSaving(false);
    } catch (error) {
      setIsSaving(false);
      dispatch(sendFeedback({ message: error.message || String(error), type: 'error' }));
    }
  };

  // Handle discard changes
  const handleDiscardChanges = () => {
    setSettings(currentSettings);
    setMqttDraft(mqttBaseline);
    setErrorForm(null);
    // The pending "keep this pool" belongs to the edit being discarded.
    setPoolToSave({ primary: emptySave, backup: emptySave });
  };

  // Handle save settings
  const handleSaveSettings = async (type) => {
    setIsSaving(true);
    setErrorForm(null);
    try {
      // MQTT (broker + output) is system-level and independent of the miner/pool
      // settings, so save it first — before the pool validations below can early
      // return and skip it. Own state, only when it actually changed.
      if (mqttChanged) {
        const m = mqttDraft;
        const input = {
          enabled: m.enabled,
          host: m.host || null,
          port: Number(m.port) || 1883,
          username: m.username || null,
          tls: m.tls,
          output: { enabled: m.output?.enabled, control: m.output?.control, exports: m.output?.exports },
          ...(m.password ? { password: m.password } : {}),
        };
        let mqttResult;
        try {
          mqttResult = await saveMqtt({ variables: { input } });
        } catch (err) {
          setIsSaving(false);
          return setErrorForm('MQTT save failed: ' + err.message);
        }
        if (mqttResult?.error) {
          setIsSaving(false);
          return setErrorForm('MQTT save failed: ' + mqttResult.error.message);
        }
        if (mqttResult?.data?.Mqtt?.updateConfig?.error) {
          setIsSaving(false);
          return setErrorForm(mqttResult.data.Mqtt.updateConfig.error.message);
        }
        const synced = { ...m, password: '' };
        setMqttDraft(synced);
        setMqttBaseline(synced);
        await refetchMqtt();
      }

      // Extract values from settings
      const {
        agree,
        minerMode,
        voltage,
        frequency,
        fan_low,
        fan_high,
        minerHashrate,
        fanTemp,
        fanPwm,
        apiAllow,
        customApproval,
        temperatureUnit,
        nodeEnableTor,
        nodeUserConf,
        nodeEnableSoloMining,
        nodeMaxConnections,
        nodeAllowLan,
        nodeSoftware,
        powerLedOff,
        btcsig,
        startdiff,
        mindiff,
      } = settings;

      // Trimmed and checked in one place (lib/poolsInput), so the rules are
      // testable without this page.
      const built = buildPoolsInput(settings);
      if (built.error) {
        setIsSaving(false);
        return setErrorForm(built.error);
      }
      const { pools: builtPools } = built;
      const { username } = built.pool;

      // Additional validation for solo mining
      if (nodeEnableSoloMining) {
        if (!isValidBitcoinAddress(username)) {
          setIsSaving(false);
          return setErrorForm('Invalid Bitcoin address for solo mining');
        }

        if (!isCompatibleBitcoinAddress(username)) {
          setIsSaving(false);
          return setErrorForm(
            'P2WSH and P2TR Bitcoin addresses are not valid for solo mining'
          );
        }
      }

      // Prepare inputs
      const fullInput = {
        agree,
        minerMode,
        voltage,
        frequency,
        fan_low,
        fan_high,
        // Apollo III tuning. Null is meaningful: it tells the generator to
        // leave the flag off and let the binary use its own default.
        minerHashrate,
        fanTemp,
        fanPwm,
        apiAllow,
        customApproval,
        temperatureUnit,
        nodeEnableTor,
        nodeUserConf,
        nodeEnableSoloMining,
        nodeMaxConnections,
        nodeAllowLan,
        nodeSoftware,
        powerLedOff,
        btcsig,
        startdiff,
        mindiff,
      };
      const input = _.pickBy(
        fullInput,
        (value, key) => !_.isEqual(value, currentSettings?.[key])
      );

      // Submit only fields changed in this editor so a stale tab cannot
      // overwrite unrelated settings saved elsewhere.
      const settingsStep = Object.keys(input).length > 0
        ? [{ name: 'settings', run: () => saveSettings({ variables: { input }, context: SILENT }) }]
        : [];

      // The array IS the intent (updateAll replaces the whole table, see
      // lib/poolsInput); a missing password goes out as null.
      const poolsInput = builtPools.map((p) => ({ ...p, password: p.password ?? null }));

      // Only write the pools when they changed: the pool set is rewritten as a
      // whole, so an untouched one would be replaced by itself for nothing.
      const poolFields = ['enabled', 'url', 'username', 'password', 'index'];
      const currentPools = [
        { ..._.pick(currentSettings?.pool || {}, poolFields) },
      ];
      currentPools[0].password = currentPools[0].password ?? null;
      const currentBackup = currentSettings?.backupPool;
      if (currentBackup?.enabled && currentBackup.url) {
        currentPools.push({
          enabled: true,
          url: currentBackup.url,
          username: currentBackup.username,
          password: currentBackup.password ?? null,
          index: 2,
        });
      }
      const poolsStep = !_.isEqual(poolsInput, currentPools)
        ? [{ name: 'pools', run: () => savePools({ variables: { input: { pools: poolsInput } }, context: SILENT }) }]
        : [];

      const changePassword =
        settings.lockPassword &&
        settings.verifyLockpassword &&
        settings.lockPassword === settings.verifyLockpassword;

      // Each write must have gone through before the next, and before any restart:
      // the calls do not reject on a GraphQL error, so a save that failed would
      // otherwise carry on to restart the miner and report it.
      // The backend refuses some passwords (line breaks, NUL): say so instead of
      // letting the bar clear as if the change had been applied.
      // What the device answers to the reload below is the truth for these
      // fields; an edit made while it is in flight is not (see useSettingsDraft).
      markSaved(settings);
      const saved = await runSteps([
        ...settingsStep,
        ...poolsStep,
        ...(changePassword
          ? [
              {
                name: 'password',
                run: () =>
                  changeLockPassword({
                    variables: { input: { password: settings.lockPassword } },
                    context: SILENT,
                  }),
              },
            ]
          : []),
      ]);
      if (!saved.ok) {
        markSaved(null);
        setIsSaving(false);
        // A restart the device refused while applying the settings is worded in the
        // user's language, and says the settings were not saved (the backend rolled
        // them back). The form keeps the edited values and the save bar stays lit:
        // the user can fix the cause and press Save again, nothing is lost.
        return setErrorForm(saveFailureText(saved, intl.formatMessage));
      }
      if (changePassword) {
        // Applied: the pair leaves the working copy and the section's own fields,
        // else the reload keeps it (the device does not carry it back) and every
        // later save would change the password again.
        forgetPasswordPair();
        setIsChanged(false);
      }

      // Timezone: a plain save, no restart of its own. Extracted for the same
      // reason as the pool step below, and it never throws either — a zone the
      // device refuses must not skip the restarts that follow.
      const { feedback: timezoneFeedback, applied: appliedTimezone } = await applyTimezone({
        wanted: settings.timezone,
        current: currentSettings?.timezone,
        setTimezone,
        refetch: refetchTimezone,
      });

      // The zone is not a row in the settings table, so refetchSettings below
      // cannot move the save bar's baseline for it — and with a cache-first
      // query returning identical data, the effect that rebuilds the baselines
      // does not even re-run. Left alone, the bar stays lit on a change that
      // was already applied until the page is reloaded.
      if (appliedTimezone) {
        setSettings((s) => ({ ...s, timezone: appliedTimezone }));
        setCurrentSettings((s) => ({ ...s, timezone: appliedTimezone }));
      }

      let locationError = null;
      // Device location: saved to the automation config, no restart. Same story
      // as the timezone — settings query does not carry it, so sync the baseline.
      if (
        settings.latitude !== currentSettings?.latitude ||
        settings.longitude !== currentSettings?.longitude
      ) {
        const locResult = await saveAutomationConfig({
          variables: { input: { latitude: settings.latitude ?? null, longitude: settings.longitude ?? null } },
        });
        locationError = locResult?.error || locResult?.data?.Automation?.updateConfig?.error;
        // A refused location must not abandon the flow: the settings and pools
        // above are already written, so the refetch, the settle and the restarts
        // below still have to run. The baseline just keeps the old location.
        if (!locationError) {
          setCurrentSettings((c) => ({
            ...c,
            latitude: settings.latitude ?? null,
            longitude: settings.longitude ?? null,
          }));
          await refetchAutomation();
        }
      }

      await refetchSettings();
      await refetchPools();
      setReloadSettled((n) => n + 1);

      // Keeping the pool is a side errand of saving, so it reports separately
      // and never fails the save: the settings are already applied by here, and
      // turning that into an error would say the opposite. Hence its own try —
      // a throw from in here escaped into the handler's catch and skipped the
      // restart below, the one step that makes the saved pool take effect.
      // Each section keeps its own pool. Sequential rather than parallel: two
      // saves racing on the same name is the one case where "last write wins"
      // would quietly drop one of them.
      // Extracted so the one place these two features meet can be tested: it
      // never throws, so a pool that could not be kept cannot skip the restarts
      // below — the step that makes the saved settings take effect.
      const poolSaveFeedback = await savePendingPools({
        pending: poolToSave,
        settings,
        offered: poolSaveOffered,
        profiles: poolProfiles,
        save: savePoolProfile,
        suggestName: suggestPoolName,
        onSaved: (profile) => ({
          message: intl.formatMessage(
            { id: 'settings.actions.save_pool_done' },
            { name: profile?.name }
          ),
          type: 'success',
        }),
        onFailed: (message) => ({ message, type: 'error' }),
      });

      setPoolToSave({ primary: emptySave, backup: emptySave });

      // Restarts, if the change needs them: only the miner's (on v2.2 the backend
      // restarts node and ckpool itself when the settings are saved). Only a
      // refusal is reported (see runRestarts). Then "saved" — but not on top of a step that failed: the
      // error toast says what did not happen, and "saved" beside it says the
      // opposite.
      const restartedOk = await runRestarts({
        type,
        restartMiner: () => restartMiner(),
        dispatch,
      });
      if (restartedOk && !locationError && !timezoneFeedback.some((m) => m.type === 'error')) {
        const savedId = savedMessageIdFor(restartSkipped);
        dispatch(
          sendFeedback({
            message: savedId ? intl.formatMessage({ id: savedId }) : 'Settings saved.',
            type: 'success',
          })
        );
      }

      // Last, and errors after successes: feedback holds one message at a time,
      // so a pool that could not be kept has to be dispatched after the restart
      // notice above rather than under it.
      poolSaveFeedback.forEach((message) => dispatch(sendFeedback(message)));
      timezoneFeedback.forEach((message) => dispatch(sendFeedback(message)));

      setIsSaving(false);
      if (locationError) setErrorForm(locationError.message);
    } catch (error) {
      markSaved(null);
      setIsSaving(false);
      dispatch(sendFeedback({ message: error.message || String(error), type: 'error' }));
    }
  };

  // Determine if saving is in progress
  const isSavingInProgress =
    isSaving ||
    loadingSave ||
    loadingSavePools ||
    loadingMinerRestart ||
    loadingSetTimezone ||
    loadingSaveLocation ||
    changeLockPasswordLoading;

  // Errors
  if (errorQuerySettings || errorQueryPools) {
    // A refused token is settled elsewhere (the session is ended, or the read is
    // retried once the stored token catches up): show that something is under
    // way, not the raw error.
    const queryError = errorQuerySettings || errorQueryPools;
    if (queryError.graphQLErrors?.some(isUnauthenticated)) {
      return (
        <Flex justify="center" py="40px">
          <Spinner />
        </Flex>
      );
    }
    return (
      <Alert borderRadius="8px" status="error" variant="subtle">
        <Flex>
          <AlertIcon />
          <Flex direction="column">
            <AlertTitle mr="12px">Error</AlertTitle>
            <AlertDescription>
              {(errorQuerySettings || errorQueryPools).message}
            </AlertDescription>
          </Flex>
        </Flex>
      </Alert>
    );
  }

  return (
    <Box>

      <ModalRestore
        isOpen={isModalRestoreOpen}
        onClose={() => setIsModalRestoreOpen(false)}
        onUpload={setRestoreData}
        onRestore={handleRestoreBackup}
        isLoading={isSaving}
      />

      {isModalConnectOpen && (
        <ModalConnectNode
          isOpen={isModalConnectOpen}
          onClose={() => setIsModalConnectOpen(false)}
          address={nodeAddress}
        />
      )}

      {/* Save/Discard Changes Bar */}
      {isChanged && (
        <Box
          position="fixed"
          bg="brand.500"
          backgroundPosition="center"
          backgroundSize="cover"
          p="15px"
          mx="auto"
          right="0px"
          bottom={{ base: '0px' }}
          w={{
            base: '100%',
            xl: 'calc(100vw - 215px)',
          }}
          zIndex="1"
        >
          <Flex direction="row" justify="space-between">
            <Button
              colorScheme={'gray'}
              variant={'solid'}
              size={'md'}
              onClick={handleDiscardChanges}
              isDisabled={isSavingInProgress}
            >
              {intl.formatMessage({ id: 'settings.actions.discard' })}
            </Button>
            <Flex direction="row" align="center">
              {restartNeeded && (
                <Button
                  colorScheme="orange"
                  variant={'solid'}
                  size={'md'}
                  mr="4"
                  isDisabled={errorForm || isSavingInProgress}
                  onClick={() => handleSaveSettings(restartNeeded)}
                  isLoading={isSavingInProgress}
                  loadingText={intl.formatMessage({ id: 'settings.actions.saving' })}
                >
                  {intl.formatMessage({ id: 'settings.actions.save_restart' })}
                </Button>
              )}
              {!restartNeeded && (
                <Button
                  colorScheme="green"
                  variant={'solid'}
                  size={'md'}
                  isDisabled={errorForm || isSavingInProgress}
                  onClick={() => handleSaveSettings()}
                  isLoading={isSavingInProgress}
                  loadingText={intl.formatMessage({ id: 'settings.actions.saving' })}
                >
                  {intl.formatMessage({ id: 'settings.actions.save' })}
                </Button>
              )}
            </Flex>
          </Flex>
        </Box>
      )}

      <SettingsProvider
        value={{
          settings,
          setSettings,
          errorForm,
          setErrorForm,
          isChanged,
          setIsChanged,
          handleBackup,
          handleRestoreBackup,
          handleDiscardChanges,
          handleSaveSettings,
          setIsModalRestoreOpen,
          setIsModalConnectOpen,
          poolProfiles,
          poolToSave,
          setPoolToSave,
          poolSaveOffered,
        }}
      >
        <Box minH="calc(100vh - 80px)" pb={isChanged ? "80px" : "0"}>
          <Tabs
            size="md"
            isLazy
            variant={'line'}
            index={currentTabIndex}
            onChange={handleTabChange}
          >
            <Box overflowX="auto" css={{
              '&::-webkit-scrollbar': {
                display: 'none'
              },
              msOverflowStyle: 'none',
              scrollbarWidth: 'none'
            }}>
              <TabList>
                {isSoloNode && (
                  <Tab>
                    <Flex align="center" gap="10px">
                      <GrUserWorker />
                      <Text>{intl.formatMessage({ id: 'settings.tabs.solo' })}</Text>
                    </Flex>
                  </Tab>
                )}
                {!isSoloNode && (
                  <Tab>
                    <Flex align="center" gap="10px">
                      <PoolIcon />
                      <Text>{intl.formatMessage({ id: 'settings.tabs.pools' })}</Text>
                    </Flex>
                  </Tab>
                )}
                {hasMiner && (
                  <Tab>
                    <Flex align="center" gap="10px">
                      <MinerIcon />
                      <Text>{intl.formatMessage({ id: 'settings.tabs.miner' })}</Text>
                    </Flex>
                  </Tab>
                )}
                <Tab>
                  <Flex align="center" gap="10px">
                    <NodeIcon />
                    <Text>{intl.formatMessage({ id: 'settings.tabs.node' })}</Text>
                  </Flex>
                </Tab>
                <Tab>
                  <Flex align="center" gap="10px">
                    <SystemIcon />
                    <Text>{intl.formatMessage({ id: 'settings.tabs.system' })}</Text>
                  </Flex>
                </Tab>
                <Tab>
                  <Flex align="center" gap="10px">
                    <MdWifiTethering />
                    <Text>{intl.formatMessage({ id: 'settings.tabs.mqtt' })}</Text>
                  </Flex>
                </Tab>
                <Tab>
                  <Flex align="center" gap="10px">
                    <MdHistory />
                    <Text>{intl.formatMessage({ id: 'settings.tabs.logs' })}</Text>
                  </Flex>
                </Tab>
                <Tab>
                  <Flex align="center" gap="10px">
                    <MdSettings />
                    <Text>{intl.formatMessage({ id: 'settings.tabs.extra' })}</Text>
                  </Flex>
                </Tab>
              </TabList>
            </Box>

            {errorForm && (
              <Alert my="5" borderRadius={'10px'} status={'error'}>
                <AlertIcon />
                <AlertDescription>{errorForm}</AlertDescription>
              </Alert>
            )}

            <TabPanels>
              {isSoloNode && (
                <TabPanel>
                  <SoloTab />
                </TabPanel>
              )}
              {!isSoloNode && (
                <TabPanel>
                  <PoolsTab />
                </TabPanel>
              )}
              {hasMiner && (
                <TabPanel>
                  <MinerTab />
                </TabPanel>
              )}
              <TabPanel>
                <NodeTab />
              </TabPanel>
              <TabPanel>
                <SystemTab />
              </TabPanel>
              <TabPanel>
                <MqttSettingsCard
                  value={mqttDraft}
                  onChange={setMqttDraft}
                  status={mqttConfig?.status}
                  deviceId={mqttConfig?.output?.deviceId}
                />
              </TabPanel>
              <TabPanel>
                <LogsTab />
              </TabPanel>
              <TabPanel>
                <ExtraTab />
              </TabPanel>
            </TabPanels>
          </Tabs>
        </Box>
      </SettingsProvider>
    </Box>
  );
};

export default SettingsTab;
