#!/usr/bin/env ts-node

console.log("process.argv:");
process.argv.forEach((arg, i) => {
  console.log(`  [${i}] = "${arg}"`);
});

console.log("\nprocess.argv.slice(2):");
const args = process.argv.slice(2);
args.forEach((arg, i) => {
  console.log(`  [${i}] = "${arg}" (length: ${arg.length})`);
});

const idFlagIndex = args.indexOf("--customerId");
console.log(`\nidFlagIndex: ${idFlagIndex}`);
if (idFlagIndex !== -1) {
  console.log(`args[${idFlagIndex}]: "${args[idFlagIndex]}"`);
  console.log(`args[${idFlagIndex + 1}]: "${args[idFlagIndex + 1]}" (length: ${args[idFlagIndex + 1]?.length})`);
}

