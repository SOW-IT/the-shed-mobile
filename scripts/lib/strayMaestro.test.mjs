import { describe, expect, test } from "vitest";
import { strayMaestro } from "./strayMaestro.mjs";

const UDID = "2C1BA37C-F691-44D6-8C88-630F3F955BC0";
const java = (device) => `/opt/homebrew/opt/openjdk/bin/java -classpath /Users/me/.maestro/lib/* maestro.cli.AppKt --device ${device} test /w/.verify/run/before/ios-flow.yaml`;
const driver = (device) => `/Applications/Xcode.app/Contents/Developer/usr/bin/xcodebuild test-without-building -xctestrun /var/folders/T/${device}1/maestro-driver-ios-config.xctestrun -destination id=${device} -derivedDataPath /var/folders/T/out`;

describe("strayMaestro", () => {
  test("finds Maestro and its driver on this simulator once launchd has adopted them", () => {
    const ps = [`36213     1 ${java(UDID)}`, `24289     1 ${driver(UDID)}`].join("\n");
    expect(strayMaestro(ps, UDID)).toEqual([36213, 24289]);
  });

  test("leaves a run that still has its verify parent", () => {
    expect(strayMaestro(`70224 70100 ${java(UDID)}`, UDID)).toEqual([]);
  });

  test("leaves Maestro on another simulator", () => {
    expect(strayMaestro(`36213 1 ${java("AAAA-OTHER")}`, UDID)).toEqual([]);
  });

  test("ignores everything else adopted by launchd", () => {
    const ps = [" 1   0 /sbin/launchd", "  812     1 /usr/libexec/logd", "  900     1 node scripts/verify.mjs"].join("\n");
    expect(strayMaestro(ps, UDID)).toEqual([]);
  });
});
