import { persistRuleOrder } from './persistRuleOrder';

const rules = [
  { id: 1, priority: 10 },
  { id: 2, priority: 20 },
];
const swapped = [{ id: 2 }, { id: 1 }];
const okResult = { data: { Automation: { updateRule: { error: null } } } };
const failure = { data: { Automation: { updateRule: { error: { message: 'Miner mode "super_eco" is not available on this device' } } } } };
// Mirrors automation.js: report(error) is false when there is an error.
const makeReport = () => jest.fn((error) => !error);

describe('persistRuleOrder', () => {
  it('writes only the rules whose priority changed', async () => {
    const updateRule = jest.fn().mockResolvedValue(okResult);
    const report = makeReport();
    expect(await persistRuleOrder({ orderedRules: swapped, rules, updateRule, report })).toBe(true);
    expect(updateRule).toHaveBeenCalledTimes(2);
    expect(updateRule).toHaveBeenCalledWith({ variables: { id: 2, input: { priority: 10 } } });
    expect(updateRule).toHaveBeenCalledWith({ variables: { id: 1, input: { priority: 20 } } });
  });

  it('writes nothing when the order did not change', async () => {
    const updateRule = jest.fn();
    expect(await persistRuleOrder({ orderedRules: rules, rules, updateRule, report: makeReport() })).toBe(true);
    expect(updateRule).not.toHaveBeenCalled();
  });

  it('surfaces the first refusal and stops writing', async () => {
    const updateRule = jest.fn().mockResolvedValueOnce(failure).mockResolvedValue(okResult);
    const report = makeReport();
    expect(await persistRuleOrder({ orderedRules: swapped, rules, updateRule, report })).toBe(false);
    expect(report).toHaveBeenCalledWith(failure.data.Automation.updateRule.error);
    expect(updateRule).toHaveBeenCalledTimes(1);
  });

  it('stops when the request itself failed (no payload)', async () => {
    const updateRule = jest.fn().mockResolvedValue({ data: undefined, error: new Error('Failed to fetch') });
    const report = makeReport();
    expect(await persistRuleOrder({ orderedRules: swapped, rules, updateRule, report })).toBe(false);
    expect(updateRule).toHaveBeenCalledTimes(1);
  });
});
