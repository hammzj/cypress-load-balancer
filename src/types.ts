export interface DurationStatistics {
  stats: {
    durations: Array<number>;
    average: number;
  };
}
export interface LoadBalancingMap {
  e2e: {
    [key: string]: DurationStatistics;
  };
  component: {
    [key: string]: DurationStatistics;
  };
}

export type TestingType = "e2e" | "component";

export type FilePath = string;

//TODO: figure out how to type set this array's length
export type Runners = Array<Array<FilePath>>;
