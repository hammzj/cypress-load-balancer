import {getSpecs} from 'find-cypress-specs'
import * as fs from "node:fs";

class SpecMap {
    private specMap: SpecFileCalculationMap
    private readonly MAX_DURATIONS: number

    constructor(public specMapFileName: string) {
        this.specMapDirectory = './cypress_load_balancing' //~./cwd/project/cypress_load_balancing
        this.specMapFileName = specMapFileName
        this.specMap = SpecMap.load(this.specMapFileName)
        this.MAX_DURATIONS = Number(process.env.MAX_DURATIONS) || 10
    }

    private doesFilePathExist(filePath: FilePath): boolean {
        return this.specMap[filePath] != null
    }

    private addFilePath(filePath: FilePath, opts = {skipIfExisting: true}) {
        if (opts.skipIfExisting && this.doesFilePathExist(filePath)) {
            console.debug('File path already exists and option was set to skip initialization if existing')
            return
        }
        this.specMap[filePath] = {durations: [], average: 0}
        console.debug('File path added or re-initialized')
    }

    private calculateAverage(filePath: FilePath) {
        if (!this.doesFilePathExist(filePath)) {
            console.warn('Skipping calculation; file path does not exist')
        }
        const {durations} = this.specMap[filePath]
        this.specMap[filePath].average = durations.reduce((acc, t) => acc + Math.abs(t), 0) / (durations.length || 1)
    }


    //TODO: Allow recreation of specMap: this is set as a json file
    initializeSpecMap(skipIfExisting = true) {
        if (skipIfExisting && Object.keys(this.specMap).length > 0) {
            console.debug('Spec map has entries and option was set to skip initialization if existing')
        }
        this.specMap = {}
    }


    /**
     * Adds the new duration and recalculates the average
     * @param filePath {FilePath}
     * @param duration {EpochTimeStamp}
     */
    public addDurationToFilePath(filePath: FilePath, duration: EpochTimeStamp) {
        this.addFilePath(filePath, {skipIfExisting: true})
        this.specMap[filePath].durations.push(duration)
        //TODO: splice would be better here, but just unshift if max hit for now
        do {
            this.specMap[filePath].durations.shift()
        } while (this.specMap[filePath].durations.length > this.MAX_DURATIONS)
        this.calculateAverage(filePath)
    }

    public static createSpecMapFile(filePathAndName: string) {
    }

    public static doesSpecMapFileExist(specMapPath): boolean {

    }

    private static load(specMapPath) {
        return {}
    }


    save(specMapDirectory = this.specMapPath, specMapFileName = this.specMapFileName) {
        fs.writeFileSync()
    }

    mergeFiles(masterFileName: string, ...runnerFiles: FilePath[]) {

    }

    public prepareForLoadBalancing(filePaths: Array<FilePath>): void {
        filePaths.map(filePath => {
            //Create new entry for files that have not been executed yet since no average exists yet
            if (!this.doesFilePathExist(filePath)) this.addFilePath(filePath)
            this.calculateAverage(filePath) //TODO: is this needed since the average is calculated when a new duration is added?
        })
    }

    private balanceRunners(runnerCount: number, filteredFilePaths: Array<FilePath>): Runners {
        const runners: Runners = Array.from({length: runnerCount}, () => [])

        /**
         * "matchingIndex" algorithm:
         * take the index of the duration, divide by runners, and get remainder as the index.
         * The index will match to the runner to use for the file path
         * @example runnerIndex = durationIndex % runnersLength
         * @example
         * Durations: 9,8,7,6,5,4,3,2,1,0
         * Split across 3 runners
         * Runners split by remainder: [[0,0,0,0], [1,1,1], [2,2,2]]:
         * Returns [[9,6,3,0], [8,5,2], [7,4,1]]
         * @param filePath {FilePath}
         * @param filePathIndex {number}
         */
        const matchingIndexAlgorithm = (filePath: FilePath, filePathIndex: number) => {
            const i = filePathIndex % runners.length
            runners[i].push(filePath)
        }

        filteredFilePaths
            .sort((a, b) => this.specMap[a].average - this.specMap[b].average)
            .reverse() //Sort highest to lowest by average
            .map((filePath, filePathIndex) => matchingIndexAlgorithm(filePath, filePathIndex))
        return runners
    }

    /**
     * Load Balance
     * Process:
     *
     * SETUP:
     *
     * PRE:Use the file filter to match all test files in any directory and subdirectory
     *
     * Load the main spec map file. Assume files passed in are filtered already
     *
     * FILE PREPARATION FOR LOAD BALANCING:
     *
     * Based on that filter, add missing file paths to specMap object. Do not add duplicates.
     *
     * Return only the files that match the current spec filter
     *
     * Splice durations of filtered files to meet the requirements of the maximum allowed durations. Keep newest durations
     *
     * Sort the files from highest duration to lowest in an array. New files will be spread across all runners.
     *
     * Segment array based on X-count of runners needed
     *
     * Perform load balancing across X arrays for each runner
     * Algorithm: in-place: the index of each runner matches the index of each spec file in their segmented array
     * Algorithm: ladder: first pass: take first index, second pass, take last index
     *
     * Return an 2-D array of files mapped out to each runner
     * @example: 5 tests across 3 runners
     * [ ["tests/test-a.js", "tests/test-d.js"], ["tests/test-b.js", "tests/test-e.js"], ["tests/test-c.js"] ]
     */
    public performLoadBalancing(runnerCount: number, filePaths, opts = {}): Runners {
        this.prepareForLoadBalancing(filePaths)
        return this.balanceRunners(runnerCount, filePaths)
    }
}

export interface AverageCalculator {
    durations: Array<EpochTimeStamp>;
    average: number
}

export interface SpecFileCalculationMap {
    [key: string]: AverageCalculator
}

export type FilePath = string

//TODO: figure out how to type set this array's length
export type Runners = Array<Array<FilePath>>

