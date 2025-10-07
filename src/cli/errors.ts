import { TestingType } from "../types";

export class GetSpecsError extends Error {
  public readonly testingType: TestingType;
  public readonly options?: unknown;

  constructor(testingType: TestingType, options?: { cause?: unknown }) {
    super(`Could not run "getSpecs" most likely do to an incorrect Cypress configuration or missing testing type.`);
    this.name = "GetSpecsError";
    this.testingType = testingType;
    this.options = options;
  }
}
