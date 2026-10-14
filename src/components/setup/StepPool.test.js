import { useState } from 'react';
import { renderWithProviders, fireEvent } from '../../test-utils';
import StepPool from './StepPool';
import { presetPools } from '../../lib/utils';

// Reported by John, 2026-10-01: "check the pool setting drop down in both setup
// and settings, the selection blanks out after selecting it".
//
// Driven through the page's own wiring, because that is where it lives: the
// options carry their index while the select is controlled by the chosen pool's
// id, so the value it is given matches no option and the browser shows nothing.

// The handler setup.js passes down, kept identical on purpose.
const Harness = () => {
  const [pool, setPool] = useState();
  const [poolUrl, setPoolUrl] = useState('');

  const handleChangePool = (e) => {
    const preset = presetPools[e.target.value];
    if (preset && preset.id !== 'custom') setPoolUrl(preset.url);
    setPool(preset);
  };

  return (
    <StepPool
      pool={pool}
      setPool={setPool}
      poolUrl={poolUrl}
      setPoolUrl={setPoolUrl}
      poolUsername=""
      setPoolUsername={() => {}}
      poolPassword=""
      setPoolPassword={() => {}}
      poolError={null}
      setPoolError={() => {}}
      handleSetupPool={(e) => e.preventDefault()}
      handleChangePool={handleChangePool}
      showPassword={false}
      setShowPassword={() => {}}
      error={null}
      setStep={() => {}}
    />
  );
};

describe('setup — the pool dropdown', () => {
  const render = () => {
    const view = renderWithProviders(<Harness />);
    return {
      ...view,
      select: () => view.container.querySelector('#poolPreset'),
      url: () => view.container.querySelector('#poolUrl'),
    };
  };

  it('keeps showing the pool that was picked', () => {
    const view = render();
    const index = presetPools.findIndex((p) => p.id !== 'custom');

    fireEvent.change(view.select(), { target: { value: String(index) } });

    // What the user sees after choosing. Blank here is the reported bug.
    expect(view.select().value).not.toBe('');
    expect(view.url().value).toBe(presetPools[index].url);
  });

  it('keeps showing Custom when Custom is picked', () => {
    const view = render();
    const index = presetPools.findIndex((p) => p.id === 'custom');

    fireEvent.change(view.select(), { target: { value: String(index) } });

    expect(view.select().value).not.toBe('');
  });
});
