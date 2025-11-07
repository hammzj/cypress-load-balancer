export interface FileStats {
  stats: {
    durations: number[];
    average: number;
    median: number;
  };
}

export type FileEntry = Record<FilePath, FileStats>;

export interface LoadBalancingMap {
  e2e: FileEntry;
  component: FileEntry;
}

export type TestingType = Cypress.TestingType;

export type FilePath = string;

export type Runners = FilePath[][];

export type Algorithms = "weighted-largest" | "round-robin" | "file-name";
