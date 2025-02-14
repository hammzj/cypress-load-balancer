import * as fs from 'node:fs'
import path from 'path'

import { XMLParser } from 'fast-xml-parser'

const MAXIMUM_TIMES_LENGTH = 10

function collectSpecsFromXmlResults() {
    const parser = new XMLParser()
    const resultsDir = path.join(process.cwd(), '/cypress/results/')
    const files = fs.readdirSync(resultsDir)
    for (const file of files) {
        const xml = fs.readFileSync(path.join(resultsDir, file), 'utf-8')
        const json = parser.parse(xml)
        const fileName = json.testsuites.testsuite.find((ts) => ts.file != null)?.file
        console.log(fileName, 'time', json.testsuites.time)
    }
}

console.log(collectSpecsFromXmlResults())

function getSpecAverages(averagingFile, mapped) {
    Object.entries(mapped).map((specFileName, time) => {
        //If spec file name is not in averaging file, add it
        if (averagingFile[specFileName] == null) {
            averagingFile[specFileName] = { times: [], average: 0 }
        }

        //Add the time to the spec file's array
        averagingFile[specFileName].times.push(time)

        //If spec file's array of times is full, remove the oldest time slot
        if (averagingFile[specFileName].times.length > MAXIMUM_TIMES_LENGTH) {
            averagingFile[specFileName].times.shift()
        }

        //Calculate average time per spec file
        averagingFile[specFileName].average = averagingFile[specFileName].times.reduce((acc, t) => acc + t, 0) / (averagingFile[specFileName].times.length || 1)
    })
    return averagingFile
}

function loadBalanceSpecs(averagingFile, maximumRunners = 1) {}
