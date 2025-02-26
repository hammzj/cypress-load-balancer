export interface DurationStatistics {
  stats: {
    durations: Array<number>;
    average: number;
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

export type Runners = Array<Array<FilePath>>;
