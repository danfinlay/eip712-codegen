#!/usr/bin/env node

const typesToCode = require('./index');
const path = require('path');

const targetPath = path.join(__dirname, process.argv[2]);
const types = require(targetPath);
const shouldLog = process.argv[3] === 'log';

console.log(typesToCode.generateSolidity(types, shouldLog));

