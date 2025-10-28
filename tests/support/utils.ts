import fs from "node:fs";
import path from "node:path";
import utils from "../../src/utils";
import { LoadBalancingMap } from "../../src/types";
import Sinon from "sinon";

export function getFixture<T = string>(fileNameOrPath: string, opts: { parseJSON?: boolean } = {}): T {
  const buffer = fs.readFileSync(path.resolve(path.join(`./tests/fixtures/${fileNameOrPath}`)));
  let data = Buffer.from(buffer).toString();
  if (opts.parseJSON) {
    data = JSON.parse(data);
  }
  return data as T;
}

export function stubReadLoadBalancerFile(
  sandbox: Sinon.SinonSandbox,
  returns: LoadBalancingMap = { e2e: {}, component: {} }
): Sinon.SinonStub {
  return sandbox
    .stub(fs, "readFileSync")
    .withArgs(utils.MAIN_LOAD_BALANCING_MAP_FILE_PATH)
    .returns(JSON.stringify(returns));
}

//@ts-expect-error ignore
//eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function runArgvCmd(argv: any, command: string): { error?: Error; argv: any; output: string } {
  return await new Promise((resolve) => {
    //@ts-expect-error ignore
    argv.parse(command, (error, argv, output) => {
      resolve({ error, argv, output });
    });
  });
}
