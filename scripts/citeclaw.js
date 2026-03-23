#!/usr/bin/env node
'use strict';

const cli = require( './botcite.js' );

if ( require.main === module ) {
	cli.main();
}

module.exports = cli;
