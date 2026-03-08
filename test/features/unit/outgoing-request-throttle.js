'use strict';

const fs = require( 'fs' );
const os = require( 'os' );
const path = require( 'path' );
const assert = require( '../../utils/assert.js' );
const OutgoingRequestThrottle = require( '../../../lib/OutgoingRequestThrottle.js' );

describe( 'lib/OutgoingRequestThrottle.js', () => {

	function getPaths( name ) {
		const base = path.join( os.tmpdir(), `citoid-throttle-${ process.pid }-${ Date.now() }-${ name }` );
		return {
			stateFile: `${ base }.json`,
			lockDir: `${ base }.lock`
		};
	}

	function cleanup( paths ) {
		try {
			fs.rmSync( paths.stateFile, { force: true } );
		} catch ( e ) {}
		try {
			fs.rmSync( paths.lockDir, { recursive: true, force: true } );
		} catch ( e ) {}
	}

	it( 'serializes remote requests with a fixed delay', () => {
		const paths = getPaths( 'single' );
		const throttle = new OutgoingRequestThrottle( {
			delayMs: 25,
			stateFile: paths.stateFile,
			lockDir: paths.lockDir
		} );
		const timestamps = [];

		return Promise.all( [
			throttle.schedule( 'https://example.org/one', () => {
				timestamps.push( Date.now() );
				return 'first';
			} ),
			throttle.schedule( 'https://example.org/two', () => {
				timestamps.push( Date.now() );
				return 'second';
			} )
		] ).then( ( results ) => {
			assert.deepEqual( results, [ 'first', 'second' ] );
			assert.isAtLeast( timestamps[ 1 ] - timestamps[ 0 ], 20 );
		} ).finally( () => cleanup( paths ) );
	} );

	it( 'coordinates delay across separate instances', () => {
		const paths = getPaths( 'multi' );
		const throttleA = new OutgoingRequestThrottle( {
			delayMs: 25,
			stateFile: paths.stateFile,
			lockDir: paths.lockDir
		} );
		const throttleB = new OutgoingRequestThrottle( {
			delayMs: 25,
			stateFile: paths.stateFile,
			lockDir: paths.lockDir
		} );
		const timestamps = [];

		return Promise.all( [
			throttleA.schedule( 'https://example.org/a', () => {
				timestamps.push( Date.now() );
			} ),
			throttleB.schedule( 'https://example.org/b', () => {
				timestamps.push( Date.now() );
			} )
		] ).then( () => {
			timestamps.sort();
			assert.isAtLeast( timestamps[ 1 ] - timestamps[ 0 ], 20 );
		} ).finally( () => cleanup( paths ) );
	} );

	it( 'does not delay hosts on the skip list', () => {
		const paths = getPaths( 'skip' );
		const throttle = new OutgoingRequestThrottle( {
			delayMs: 100,
			skipHosts: [ '127.0.0.1' ],
			stateFile: paths.stateFile,
			lockDir: paths.lockDir
		} );
		const startedAt = Date.now();

		return throttle.schedule( 'http://127.0.0.1/test', () => Date.now() )
			.then( ( executedAt ) => {
				assert.isBelow( executedAt - startedAt, 50 );
			} ).finally( () => cleanup( paths ) );
	} );

} );
