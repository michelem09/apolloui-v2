/**
 * Write a dragged rule order back as priorities (top of the list wins). Only the
 * rules whose position changed are written, one at a time. Stops at the first
 * refusal and reports it through `report(error)` (which returns false for an
 * error): the writes are sequential, so a silent failure would leave the list
 * half-reordered with no explanation. Resolves to true when every write went
 * through.
 */
export async function persistRuleOrder({ orderedRules, rules, updateRule, report }) {
  const updates = orderedRules
    .map((rule, i) => ({ id: rule.id, priority: (i + 1) * 10 }))
    .filter(({ id, priority }) => rules.find((r) => r.id === id)?.priority !== priority);

  for (const u of updates) {
    // eslint-disable-next-line no-await-in-loop
    const { data: result } = await updateRule({ variables: { id: u.id, input: { priority: u.priority } } });
    // No payload = the request itself failed (the error link already toasted it):
    // stop here too, or the remaining writes would carry on over a broken link.
    if (!result?.Automation?.updateRule) return false;
    if (!report(result.Automation.updateRule.error)) return false;
  }
  return true;
}
