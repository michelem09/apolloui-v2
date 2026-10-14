// Applying the system timezone, as part of saving settings.
//
// Same rule as savePendingPools next door, and for the same reason: by the time
// this runs the settings and pools are already persisted, and the restarts that
// make them take effect on the miner still have to happen. A zone the device
// refuses, or a request that never lands, must not cost the user those restarts.
//
// So this never throws. It returns the messages to show, and the zone the device
// confirmed, and the caller carries on whatever happened here.
//
// `applied` matters beyond reporting: the timezone is not a row in the settings
// table, so the settings query cannot refresh the save bar's baseline for it.
// Only what comes back from here can move it — without that, the bar stays lit
// on a change that was already applied, until the page is reloaded.

export const applyTimezone = async ({ wanted, current, setTimezone, refetch }) => {
  const feedback = [];

  if (!wanted || wanted === current) return { feedback, applied: null };

  try {
    const result = await setTimezone({ variables: { input: { timezone: wanted } } });
    const error = result?.data?.Mcu?.setTimezone?.error;

    if (error) {
      feedback.push({ message: error.message, type: 'error' });
      return { feedback, applied: null };
    }

    // Only on success: the panel reads the "a restart is still owed" flag from
    // this query, and refetching after a refusal would just re-read the old zone.
    if (refetch) await refetch();

    // What the device says it is on now, not what was asked for.
    return { feedback, applied: result?.data?.Mcu?.setTimezone?.result?.timezone ?? wanted };
  } catch (error) {
    feedback.push({ message: error.message, type: 'error' });
  }

  return { feedback, applied: null };
};
