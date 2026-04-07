export interface FileStats {
  stats: {
    durations: number[];
    average: number;
    median: number;
  };
}

export type FileEntry = Record<string, FileStats>;

//TODO: replace with LoadBalancingMapFile
export interface LoadBalancingMap {
  e2e: FileEntry;
  component: FileEntry;
}

export type LoadBalancingMapJSONFile = Record<TestingType, Record<string, FileStats>>;

export type TestingType = Cypress.TestingType;

export type FilePath = string;

export type Runners = FilePath[][];

export type Algorithms = "weighted-largest" | "round-robin" | "file-name";
export type LoadBalancingAlgorithm = "weighted-largest" | "round-robin" | "file-name";
