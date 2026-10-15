import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useLazyQuery, useMutation } from '@apollo/client';
import { useColorModeValue, useDisclosure } from '@chakra-ui/react';
import { useIntl } from 'react-intl';

import { MINER_RESTART_QUERY } from '../graphql/miner';
import { NODE_START_MUTATION } from '../graphql/node';
import { AUTH_LOGIN_QUERY, SAVE_SETUP_MUTATION } from '../graphql/auth';
import { UPDATE_POOLS_MUTATION } from '../graphql/pools';
import { SET_SETTINGS_MUTATION } from '../graphql/settings';
import { isValidBitcoinAddress, presetPools } from '../lib/utils';
import { runMutation } from '../lib/runMutation';
import { useDeviceConfig } from '../contexts/DeviceConfigContext';

// Components
import StepWelcome from '../components/setup/StepWelcome';
import StepMiningType from '../components/setup/StepMiningType';
import StepWallet from '../components/setup/StepWallet';
import StepPool from '../components/setup/StepPool';
import StepPassword from '../components/setup/StepPassword';
import StepComplete from '../components/setup/StepComplete';

const Setup = () => {
  const router = useRouter();
  const intl = useIntl();
  const textColor = useColorModeValue('brand.800', 'white');
  const { deviceType, hasUsbMiners } = useDeviceConfig();
  const isSoloNode = deviceType === 'solo-node';

  const [step, setStep] = useState(1);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState();
  const [soloMining, setSoloMining] = useState(false);
  const [pool, setPool] = useState();
  const [poolUsername, setPoolUsername] = useState('');
  const [poolPassword, setPoolPassword] = useState('');
  const [poolUrl, setPoolUrl] = useState('');
  const [poolError, setPoolError] = useState();
  const [password, setPassword] = useState('');
  const [verifyPassword, setVerifyPassword] = useState('');
  const [setupAuthenticated, setSetupAuthenticated] = useState(false);

  const { isOpen, onOpen, onClose } = useDisclosure();

  const [restartMiner, { loading: loadingMinerRestart }] = useLazyQuery(
    MINER_RESTART_QUERY,
    { fetchPolicy: 'no-cache' }
  );

  // Mutation — onError noop so the fire-and-forget call cannot reject
  // unhandled; errors surface via the hook's error state like the lazy query.
  const [startNode, { loading: loadingNodeStart }] = useMutation(
    NODE_START_MUTATION,
    { onError: () => {} }
  );

  // The writes are mutations (a query would be re-run by a re-render). runMutation
  // keeps the old lazy-query contract: resolve to { data, error }, never throw.
  const [saveSetupMutation, { data: dataSaveSetup, error: errorSaveSetup, loading: loadingSaveSetup }] =
    useMutation(SAVE_SETUP_MUTATION);
  const saveSetup = (o) => runMutation(saveSetupMutation, o);

  const [signin, { data: dataSignin, error: errorSignin, loading: loadingSignin }] = useLazyQuery(
    AUTH_LOGIN_QUERY,
    { fetchPolicy: 'no-cache' }
  );

  const [savePoolsMutation] = useMutation(UPDATE_POOLS_MUTATION);
  const savePools = (o) => runMutation(savePoolsMutation, o);

  const [saveSettingsMutation] = useMutation(SET_SETTINGS_MUTATION);
  const saveSettings = (o) => runMutation(saveSettingsMutation, o);

  useEffect(() => {
    if (dataSaveSetup?.Auth?.setup?.error)
      setError(dataSaveSetup.Auth.setup.error.message);
    if (errorSaveSetup) setError(errorSaveSetup.message);
  }, [dataSaveSetup, errorSaveSetup]);

  useEffect(() => {
    setPoolError(null);
    setError(null);
    onClose();
    if (step === 1) {
      setPoolUsername('');
      setPoolPassword('');
      setPoolUrl('');
      setPool(null);
      setSoloMining(false);
      setPassword('');
      setVerifyPassword('');
    }
  }, [step, onClose]);

  const handleChangePool = (e) => {
    const preset = presetPools[e.target.value];
    if (preset && preset.id !== 'custom') setPoolUrl(preset.url);
    setPool(preset);
  };

  const handleSetupPool = async (e) => {
    e.preventDefault();

    setPoolError(null);
    if (!poolUsername || !poolPassword || !poolUrl)
      return setPoolError('All fields are required');
    if (!poolUrl.match(/stratum\+tcp:\/\/(.*):?\d*$/))
      return setPoolError('Invalid pool URL');

    setPool({
      ...pool,
      username: poolUsername,
      password: poolPassword,
      url: poolUrl,
    });

    // Move to password step
    setStep('password');
  };

  const handlesSetupSoloMining = async (e) => {
    e.preventDefault();
    try {
      setPoolError(null);
      if (!poolUsername) return setPoolError('All fields are required');

      if (!isValidBitcoinAddress(poolUsername))
        return setPoolError('Please add a valid Bitcoin address');

      const soloUrl = 'stratum+tcp://127.0.0.1:3333';
      const soloPassword = 'x';

      setPoolUrl(soloUrl);
      setPoolPassword(soloPassword);

      setPool({
        username: poolUsername,
        password: soloPassword,
        url: soloUrl,
        index: 1,
      });

      setSoloMining(true);
      
      // Move to password step
      setStep('password');
    } catch (error) {
      setError(error.toString());
    }
  };

  const handlePassword = async (e) => {
    e.preventDefault();

    if (!password || !verifyPassword) {
      setError(intl.formatMessage({ id: 'setup.password.required' }));
      return;
    }

    if (password.length < 8) {
      setError(intl.formatMessage({ id: 'setup.password.too_short' }));
      return;
    }

    if (password !== verifyPassword) {
      setError(intl.formatMessage({ id: 'setup.password.mismatch' }));
      return;
    }

    setError(null); // Clear previous errors

    try {
      if (!setupAuthenticated) {
        const saveSetupResult = await saveSetup({
          variables: { input: { password } },
        });
        // The request itself failed (network): stop, do not carry on to a login.
        if (saveSetupResult.error) {
          setError(saveSetupResult.error.message);
          return;
        }
        const setupError = saveSetupResult?.data?.Auth?.setup?.error;
        // A prior partial attempt may already have committed the account.
        // In that case, authenticate and resume the unfinished writes.
        if (setupError && setupError.message !== 'Setup already done') {
          setError(setupError.message);
          return;
        }

        const signinResult = await signin({
          variables: { input: { password } },
        });
        const signinError = signinResult?.data?.Auth?.login?.error;
        if (signinError) {
          setError(signinError.message);
          return;
        }

        const accessToken = signinResult?.data?.Auth?.login?.result?.accessToken;
        if (!accessToken) {
          setError('Login did not return an access token');
          return;
        }
        localStorage.setItem('token', accessToken);
        setSetupAuthenticated(true);
      }

      const poolResult = await savePools({
        variables: {
          input: {
            pools: [
              {
                enabled: true,
                url: poolUrl,
                username: poolUsername,
                password: poolPassword,
                index: 1,
              },
            ],
          },
        },
      });
      const poolError = poolResult.error || poolResult?.data?.Pool?.updateAll?.error;
      if (poolError) {
        setError(poolError.message);
        return;
      }

      // Finish authenticated configuration before offering to start the node.
      if (soloMining) {
        const settingsResult = await saveSettings({
          variables: { input: { nodeEnableSoloMining: true } },
        });
        const settingsError = settingsResult.error || settingsResult?.data?.Settings?.update?.error;
        if (settingsError) {
          setError(settingsError.message);
          return;
        }
      }

      setStep('complete');
    } catch (err) {
      setError(err.message || 'An error occurred during setup');
    }
  };

  const handleStartMining = async () => {
    try {
      setError(null);
      const nodeResult = await startNode();
      const nodeError = nodeResult?.data?.Node?.start?.error;
      if (nodeError) throw new Error(nodeError.message);

      // The Solo Node has no internal board, but it still runs apollo-miner for
      // USB hashboards, and the miner only reads the pool out of miner_config at
      // launch — so it needs the restart too whenever one is plugged in.
      if (!isSoloNode || hasUsbMiners) {
        const minerResult = await restartMiner();
        const minerError = minerResult?.data?.Miner?.restart?.error;
        if (minerError) throw new Error(minerError.message);
      }
      // Go straight to signin — where the guard sends a completed setup anyway.
      // router.reload() instead remounted /setup and flashed step 1 of the wizard
      // while ProtectedRoutes waited for the async auth-status query to redirect.
      router.replace('/signin');
    } catch (startError) {
      setError(startError.message || 'Could not start mining services');
    }
  };

  return (
    <>

      {step === 1 && <StepWelcome setStep={setStep} isSoloNode={isSoloNode} />}

      {step === 2 && !isSoloNode && (
        <StepMiningType
          setStep={setStep}
          isOpen={isOpen}
          onOpen={onOpen}
          onClose={onClose}
        />
      )}

      {step === 'wallet' && (
        <StepWallet
          poolUsername={poolUsername}
          setPoolUsername={setPoolUsername}
          poolError={poolError}
          setPoolError={setPoolError}
          handlesSetupSoloMining={handlesSetupSoloMining}
          error={error}
          setStep={setStep}
          isSoloNode={isSoloNode}
        />
      )}

      {step === 3 && !isSoloNode && (
        <StepPool
          pool={pool}
          setPool={setPool}
          poolUrl={poolUrl}
          setPoolUrl={setPoolUrl}
          poolUsername={poolUsername}
          setPoolUsername={setPoolUsername}
          poolPassword={poolPassword}
          setPoolPassword={setPoolPassword}
          poolError={poolError}
          setPoolError={setPoolError}
          handleSetupPool={handleSetupPool}
          handleChangePool={handleChangePool}
          showPassword={showPassword}
          setShowPassword={setShowPassword}
          error={error}
          setStep={setStep}
        />
      )}

      {step === 'password' && (
        <StepPassword
          password={password}
          setPassword={setPassword}
          verifyPassword={verifyPassword}
          setVerifyPassword={setVerifyPassword}
          showPassword={showPassword}
          setShowPassword={setShowPassword}
          error={error}
          setError={setError}
          handlePassword={handlePassword}
          setStep={setStep}
          isSoloNode={isSoloNode}
          soloMining={soloMining}
        />
      )}

      {step === 'complete' && (
        <StepComplete
          handleStartMining={handleStartMining}
          loadingMinerRestart={loadingMinerRestart}
          loadingNodeStart={loadingNodeStart}
          isSoloNode={isSoloNode}
          error={error}
        />
      )}
    </>
  );
};

export default Setup;
