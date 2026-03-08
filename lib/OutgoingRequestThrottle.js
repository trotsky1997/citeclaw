'use strict';

const BBPromise = require( 'bluebird' );
const fs = BBPromise.promisifyAll( require( 'fs' ) );
const os = require( 'os' );
const path = require( 'path' );

class OutgoingRequestThrottle {
	constructor( options = {} ) {
		this.enabled = options.enabled !== false;
		this.delayMs = Number.parseInt( options.delayMs, 10 ) || 1000;
		this.skipHosts = new Set( options.skipHosts || [ 'localhost', '127.0.0.1', '::1' ] );
		this._queue = BBPromise.resolve();
		this.stateFile = options.stateFile ||
			path.join( os.tmpdir(), 'citoid-outgoing-request-throttle-state.json' );
		this.lockDir = options.lockDir ||
			path.join( os.tmpdir(), 'citoid-outgoing-request-throttle.lock' );
	}

	shouldThrottle( uri ) {
		if ( !this.enabled || !uri ) {
			return false;
		}

		try {
			const hostname = new URL( uri ).hostname;
			return !this.skipHosts.has( hostname );
		} catch ( e ) {
			return true;
		}
	}

	schedule( uri, callback ) {
		if ( !this.shouldThrottle( uri ) ) {
			return BBPromise.try( callback );
		}

		const scheduled = this._queue.then(
			() => this.reserveSlot()
				.then( ( waitMs ) => BBPromise.delay( waitMs ).then( callback ) )
		);
		this._queue = scheduled.reflect();
		return scheduled;
	}

	acquireLock() {
		return fs.mkdirAsync( this.lockDir )
			.catch( ( error ) => {
				if ( error && error.code === 'EEXIST' ) {
					return BBPromise.delay( 10 ).then( () => this.acquireLock() );
				}
				throw error;
			} );
	}

	releaseLock() {
		return fs.rmdirAsync( this.lockDir )
			.catch( ( error ) => {
				if ( error && error.code === 'ENOENT' ) {
					return null;
				}
				throw error;
			} );
	}

	readState() {
		return fs.readFileAsync( this.stateFile, 'utf8' )
			.then( ( raw ) => JSON.parse( raw ) )
			.catch( ( error ) => {
				if ( error && ( error.code === 'ENOENT' || error instanceof SyntaxError ) ) {
					return { nextAllowedAt: 0 };
				}
				throw error;
			} );
	}

	writeState( state ) {
		return fs.writeFileAsync( this.stateFile, JSON.stringify( state ) );
	}

	reserveSlot() {
		return this.acquireLock()
			.then( () => this.readState()
				.then( ( state ) => {
					const now = Date.now();
					const nextAllowedAt = Number.parseInt( state.nextAllowedAt, 10 ) || 0;
					const scheduledAt = Math.max( now, nextAllowedAt );
					const waitMs = scheduledAt - now + this.delayMs;
					return this.writeState( { nextAllowedAt: scheduledAt + this.delayMs } )
						.then( () => waitMs );
				} )
				.finally( () => this.releaseLock() ) );
	}
}

module.exports = OutgoingRequestThrottle;
