import { default as debugInitializer } from "debug";

export const debug = debugInitializer("cypress-load-balancer");

export const warn = (message?: unknown, ...optionalParams: unknown[]) => {
  if (!process.env.CYPRESS_LOAD_BALANCER_DISABLE_WARNINGS) {
    console.warn(message, ...optionalParams);
  }
};
