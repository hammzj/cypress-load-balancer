import fs from "node:fs";
import path from "node:path";
import stripAnsi from "strip-ansi";
import Sinon from "sinon";
import { LoadBalancingMapJSONFile } from "../../src/types";
import { LoadBalancingMap } from "../../src/load.balancing.map";

export function getFixture<T = string>(fileNameOrPath: string, opts: { parseJSON?: boolean } = {}): T {
  const buffer = fs.readFileSync(path.resolve(path.join(`./tests/fixtures/${fileNameOrPath}`)));
  let data = Buffer.from(buffer).toString();
  if (opts.parseJSON) {
    data = JSON.parse(data);
  }
  return data as T;
}

export function stubInitializeSpecMapFile(sandbox: Sinon.SinonSandbox) {
  return sandbox.stub(LoadBalancingMap.prototype, "initializeSpecMapFile").callsFake(() => [false, false]);
}

export function stubImportFromJSON(
  sandbox: Sinon.SinonSandbox,
  fakeJSON: LoadBalancingMapJSONFile = { e2e: {}, component: {} }
): { existsSyncStub: Sinon.SinonStub; readFileSyncStub: Sinon.SinonStub } {
  const fileNameMatch = sandbox.match("spec-map.json");
  const existsSyncStub = sandbox.stub(fs, "existsSync").withArgs(fileNameMatch).returns(true);
  const readFileSyncStub = sandbox.stub(fs, "readFileSync").withArgs(fileNameMatch).returns(JSON.stringify(fakeJSON));
  return { existsSyncStub, readFileSyncStub };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function runArgvCmdInCurrentProcess(
  argv: any,
  command: string
): Promise<{ error?: Error; argv: any; output: string }> {
  return await new Promise((resolve) => {
    //@ts-expect-error ignore
    argv.parse(command, (error, argv, output) => {
      resolve({ error, argv, output });
    });
  });
}

export const decodeStdout = (stdout: Buffer) => stripAnsi(Buffer.from(stdout).toString());
