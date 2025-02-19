import fs from "node:fs";
import {
    calculateAverageDuration,
    createNewEntry,
    initializeLoadBalancingFiles,
    MAIN_LOAD_BALANCING_MAP_FILE_PATH,
    MAX_DURATIONS_ALLOWED
} from "./utils";
import {LoadBalancingMap, TestingType} from "./types";

const shrinkToFit = (arr: number[]): number[] => {
    if (arr.length > MAX_DURATIONS_ALLOWED) {
        arr.splice(0, arr.length - MAX_DURATIONS_ALLOWED)
    }
    return arr
}

//TODO: consider making the user specify the TestingType
export default function addCypressPlugin(on: NodeEventEmitter['on']) {
    on('after:run', (results) => {
        //Prep load balancing file if not existing and read it
        initializeLoadBalancingFiles()
        const loadBalancingMap = JSON.parse(fs.readFileSync(MAIN_LOAD_BALANCING_MAP_FILE_PATH).toString()) as LoadBalancingMap

        for (const run of results.runs) {
            const testingType = results.config.testingType as TestingType
            const fileName = run.spec.relative
            createNewEntry(loadBalancingMap, testingType, fileName)

            loadBalancingMap[testingType][fileName].stats.durations.push(run.stats.duration)
            shrinkToFit(loadBalancingMap[testingType][fileName].stats.durations)

            loadBalancingMap[testingType][fileName].stats.average = calculateAverageDuration(loadBalancingMap[testingType][fileName].stats.durations)
        }

        //Overwrite original load balancing file
        fs.writeFileSync(MAIN_LOAD_BALANCING_MAP_FILE_PATH, JSON.stringify(loadBalancingMap))
        console.debug('Updated load balancing map with new file averages')
    })
}
