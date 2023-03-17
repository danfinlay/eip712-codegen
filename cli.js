#!/usr/bin/env node

const yargs = require('yargs');
const typesToCode = require('./index');
const path = require('path');

const argv = yargs
  .option('input', {
    alias: 'i',
    describe: 'Input file path',
    demandOption: true,
    type: 'string',
  })
  .option('entryPoints', {
    alias: 'e',
    describe: 'Type names to be used as entry points',
    demandOption: true,
    array: true,
    type: 'string',
  })
  .option('log', {
    alias: 'l',
    describe: 'Enable logging',
    type: 'boolean',
  })
  .help()
  .alias('help', 'h')
  .argv;

const targetPath = path.resolve(process.cwd(), argv.input);
const types = require(targetPath);
const entryPoints = argv.entryPoints;
const shouldLog = argv.log;

console.log(typesToCode.generateSolidity(types, shouldLog, entryPoints));
