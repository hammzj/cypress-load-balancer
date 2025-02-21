import fs from "node:fs";
import path from "node:path";

export function getFixture(fileNameOrPath: string, opts: { parseJSON?: boolean } = {}): string {
  const buffer = fs.readFileSync(path.resolve(path.join(`./tests/fixtures/${fileNameOrPath}`)));
  let data = Buffer.from(buffer).toString();
  if (opts.parseJSON) {
    data = JSON.parse(data);
  }
  return data;
}
