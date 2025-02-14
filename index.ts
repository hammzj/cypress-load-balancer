interface AverageCalculator {
    durations: Array<EpochTimeStamp>;
    average: number
}

interface SpecFileCalculationMap {
    [key: string]: AverageCalculator
}

type FilePath = string

//TODO: figure out how to type set this array's length
type Runners = Array<Array<FilePath>>

const MAX_DURATIONS = process.env.MAX_DURATIONS || 10

let specMap: SpecFileCalculationMap = {}

//TODO: Allow recreation of specMap: this is set as a json file
function initializeSpecMap(skipIfExisting = true) {
    if (skipIfExisting && Object.keys(specMap).length > 0) {
        console.debug('Spec map has entries and option was set to skip initialization if existing')
    }
    specMap = {}
}

function doesFilePathExist(specMap: SpecFileCalculationMap, filePath: FilePath): boolean {
    return specMap[filePath] != null
}

function getFilesFromFilter(includeFilePaths: string[], excludeFilePaths: string[]): Array<FilePath> {
    return []
}

function addNewDuration(specMap: SpecFileCalculationMap, filePath: FilePath, duration: EpochTimeStamp) {
    initializeFilePathMap(specMap, filePath, {skipIfExisting: true})
    specMap[filePath].durations.push(duration)
    //TODO: splice would be better here, but just unshift if max hit for now
    do {
        specMap[filePath].durations.shift()
    } while (specMap[filePath].durations.length > MAX_DURATIONS)
}

function calculateAverage(specMap: SpecFileCalculationMap, filePath: FilePath) {
    if (!doesFilePathExist(specMap, filePath)) {
        console.warn('Skipping calculation; file path does not exist')
    }
    const {durations} = specMap[filePath]
    specMap[filePath].average = durations.reduce((acc, t) => acc + t, 0) / (durations.length || 1)
}

function initializeFilePathMap(specMap: SpecFileCalculationMap, filePath: FilePath, skipIfExisting = false) {
    if (skipIfExisting && doesFilePathExist(specMap, filePath)) {
        console.debug('File path already exists and option was set to skip initialization if existing')
        return
    }
    specMap[filePath] = {durations: [], average: 0}
    console.debug('File path added or re-initialized')
}

function prepareForLoadBalancing(specMap: SpecFileCalculationMap, filePaths: Array<FilePath>, opts = {}) {
    filePaths.map(filePath => {
        if (specMap[filePath] == null) {
            initializeFilePathMap(specMap, filePath)
        }
    })
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
 * @example: 5 tests + 3 runners
 * [ ["tests/test-a.js", "tests/test-d.js"], ["tests/test-b.js", "tests/test-e.js"], ["tests/test-c.js"] ]
 */
function performLoadBalancing(specMap: SpecFileCalculationMap, runnerCount: number, filteredFilePaths: Array<FilePath>): Runners {
    const runners: Runners = Array.from({length: runnerCount}, () => [])

    /**
     * "matchingIndex" algorithm:
     * take the index of the duration, divide by runners, and get remainder as the index.
     * The index will match to the runner to use for the file path
     * @example runnerIndex = durationIndex % runnersLength
     * @example
     * Durations: 9,8,7,6,5,4,3,2,1,0
     * Split across 3 runners
     * Indexes: [[1,1,1,1], [2,2,2], [3,3,3]]:
     * Returns [[9,6,3,0], [8,5,2], [7,4,1]]
     * @param filePath {FilePath}
     * @param filePathIndex {number}
     */
    const matchingIndexAlgorithm = (filePath: FilePath, filePathIndex: number) => {
        const i = filePathIndex % runners.length
        runners[i].push(filePath)
    }

    filteredFilePaths
        .map(filePath => {
            if (!doesFilePathExist(specMap, filePath)) {
                //Consider these files to have not been executed yet, so no durations or averages exist
                initializeFilePathMap(specMap, filePath)
            }
            calculateAverage(specMap, filePath)
            return filePath
        })
        .sort((a, b) => specMap[a].average - specMap[b].average)
        .reverse() //Sort highest to lowest by average
        .map((filePath, filePathIndex) => matchingIndexAlgorithm(filePath, filePathIndex))
    return runners
}

function main(specMapPath, runnerCount, includeFilePaths, excludeFilePaths, opts = {}): Runners {
    //Temporary -- figure out how to load this
    const loadSpecMap = (specMapPath) => {
        console.log(specMapPath)
        return Object.create({})
    }

    const specMap = loadSpecMap(specMapPath)
    const filePaths = getFilesFromFilter(includeFilePaths, excludeFilePaths)
    prepareForLoadBalancing(specMap, filePaths)
    return performLoadBalancing(specMap, runnerCount, filePaths)
}
