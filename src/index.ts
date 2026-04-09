import addCypressLoadBalancerPlugin from "./plugin";
//TODO: remove
import performLoadBalancing from "./_loadBalancer";
import mergeLoadBalancingMapFiles from "./merge";
import { default as cli } from "./cli";

export { addCypressLoadBalancerPlugin, performLoadBalancing, mergeLoadBalancingMapFiles, cli };
