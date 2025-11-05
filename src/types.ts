export interface DurationStatistics {
  stats: {
    durations: number[];
    average: number;
    median: number;
  };
}

export interface LoadBalancingMap {
  e2e: {
    [relativeFileName: string]: DurationStatistics;
  };
  component: {
    [relativeFileName: string]: DurationStatistics;
  };
}

export type TestingType = Cypress.TestingType;

export type FilePath = string;

export type Runners = FilePath[][];

export type Algorithms = "weighted-largest" | "round-robin" | "file-name";
