import fs from "node:fs";
import { createNewEntry, initializeLoadBalancingFiles, MAIN_LOAD_BALANCING_MAP_FILE_PATH } from "./utils";
import { FilePath, Runners, TestingType, LoadBalancingMap } from "./types";

function prepareFiles(loadBalancingMap: LoadBalancingMap, testingType: TestingType, filePaths: Array<FilePath> = []) {
  filePaths.map((fp) => createNewEntry(loadBalancingMap, testingType, fp));
  fs.writeFileSync(MAIN_LOAD_BALANCING_MAP_FILE_PATH, JSON.stringify(loadBalancingMap));
}

export default function performLoadBalancing(
  runnerCount: number,
  testingType: TestingType,
  filePaths: FilePath[]
): Runners {
  const runners: Runners = Array.from({ length: runnerCount }, () => []);
  const matchingIndexAlgorithm = (filePath: FilePath, filePathIndex: number) => {
    const i = filePathIndex % runners.length;
    runners[i].push(filePath);
  };

  initializeLoadBalancingFiles();
  const loadBalancingMap = JSON.parse(fs.readFileSync(MAIN_LOAD_BALANCING_MAP_FILE_PATH).toString());
  prepareFiles(loadBalancingMap, testingType, filePaths);
  filePaths
    .sort((a, b) => loadBalancingMap[testingType][a].average - loadBalancingMap[testingType][b].average)
    .reverse() //Sort highest to lowest by average
    .map((filePath, filePathIndex) => matchingIndexAlgorithm(filePath, filePathIndex));

  //TODO: consider calculating the average all at once -- more expensive, but less overhead to manage
  // filesToRun
  //     .map(f => Array.from([f, calculateDurationAverage(loadBalancingMap, f)]))
  //     .sort((a, b) => a[1] - b[1])
  //     .reverse() //Sort highest to lowest by average
  //     .map(([filePath, _average], filePathIndex) => matchingIndexAlgorithm(filePath, filePathIndex))

  return runners;
}
