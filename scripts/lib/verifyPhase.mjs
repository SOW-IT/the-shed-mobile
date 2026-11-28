// One phase (before or after) of a verify run's screen steps. Web needs no
// simulator, so it runs alongside other worktrees' runs. The simulator lock
// is held for the iOS steps only (reset and Maestro), and given back as soon
// as they end, whether they pass, fail or throw. A web run never waits behind
// another worktree's iOS run, and an iOS run waits only for the simulator.
export const runScreens = async ({ web, ios, lockSimulator, unlockSimulator }) => {
  if (web) await web();
  if (!ios) return;
  await lockSimulator();
  try {
    await ios();
  } finally {
    unlockSimulator();
  }
};
