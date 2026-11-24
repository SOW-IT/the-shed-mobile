/**
 * Maestro runs left on a simulator by a verify run that has gone (killed, or
 * its terminal closed): launchd has adopted them (parent pid 1), so no run
 * owns them, yet they stay attached to the simulator. A second driver on the
 * same simulator makes the next run's screenshots hang or its Maestro quit
 * without a word. Only verify uses Maestro on this Mac, and the run asking
 * holds the verify lock, so any such process on its simulator is stale.
 *
 * Takes `ps -axo pid=,ppid=,command=` output; returns the pids to stop.
 */
export const strayMaestro = (ps, udid) =>
  ps
    .split("\n")
    .map((line) => line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/))
    .filter((m) => m !== null && m[2] === "1")
    .filter(([, , , command]) =>
      (command.includes("maestro.cli.AppKt") && command.includes(`--device ${udid}`)) ||
      (command.includes("xcodebuild test-without-building") && command.includes("maestro-driver-ios") && command.includes(`id=${udid}`))
    )
    .map(([, pid]) => Number(pid));
