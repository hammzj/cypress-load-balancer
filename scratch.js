const merge = require("deepmerge");

const a1 = {
    a: [1, 2, 3]
}

const a2 = {
    a: [4, 5, 6],
    b: ['b']
}

const a3 = {
    a: [7]
}

console.log(merge.all([a1, a2, a3]))
