import fs from "node:fs";
import path from "node:path";
import stripAnsi from "strip-ansi";
import Sinon from "sinon";
import { LoadBalancingMapJSONFile } from "../../src/types";
import { LoadBalancingMap } from "../../src";

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

/**
 * Allows faking reading and imports of spec map files based on filename matching.
 * @example stubSpecMapReads(sandbox, {"spec-map.json": {e2e: {}, component: {}}}
 * @param sandbox
 * @param stubs
 */
export function stubSpecMapReads(sandbox: Sinon.SinonSandbox, stubs: Record<string, LoadBalancingMapJSONFile>) {
  const existsSyncStub = sandbox.stub(fs, "existsSync");
  const readFileSyncStub = sandbox.stub(fs, "readFileSync");

  for (const [fileName, object] of Object.entries(stubs)) {
    existsSyncStub.withArgs(sandbox.match(fileName)).returns(true);
    readFileSyncStub.withArgs(sandbox.match(fileName)).returns(JSON.stringify(object));
  }

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
