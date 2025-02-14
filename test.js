// console.log(9 % 3) //0
// console.log(8 % 3) //2
// console.log(7 % 3) //1
// console.log(6 % 3) //0
// console.log(5 % 3) //2
// console.log(4 % 3) //1
// console.log(3 % 3) //0
// console.log(2 % 3) //2
// console.log(1 % 3) //1
// console.log(0 % 3) //0

//Arrays [[], [], []]
const count = 3
const arrays = Array.from({length: count}, () => [])
console.log(arrays)
//const nums = [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]

//[900000,700000,550000,40000], [80000, 650000,50000], [750000,60000,450000]
const nums = [
    900000,
    800000,
    750000,
    700000,
    650000,
    600000,
    550000,
    500000,
    450000,
    400000
    // 1739553071282,
    // 1739553070282,
    // 1739553069282,
    // 1739553068282,
    // 1739553067282,
    // 1739553066282,
    // 1739553065282,
    // 1739553064282,
    // 1739553063282,
    // 1739553062282,
]

nums.map((n, numIndex) => {
    //const index = n % count
    const index = numIndex % count
    arrays[index].push(n)
})

console.log(arrays)
