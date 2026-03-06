#!/usr/bin/env node

'use strict';
/* eslint n/no-process-exit: "off" */

const fs = require( 'fs' );
const path = require( 'path' );
const net = require( 'net' );
const http = require( 'http' );
const https = require( 'https' );
const readline = require( 'readline' );
const crypto = require( 'crypto' );
const { spawn, spawnSync } = require( 'child_process' );
const BBPromise = require( 'bluebird' );
const bunyan = require( 'bunyan' );
const CSL = require( 'citeproc' );
const yaml = require( 'js-yaml' );
const citoidApp = require( '../app.js' );

const rootDir = path.resolve( __dirname, '..' );
const zoteroDir = process.env.ZOTERO_DIR || path.join( rootDir, 'vendor', 'zotero' );
const cnTranslatorsDir = process.env.CN_TRANSLATORS_DIR || path.join( rootDir, 'vendor', 'translators_CN' );
const vendoredStylesDir = path.join( rootDir, 'vendor', 'styles' );
const localDir = path.join( rootDir, '.local' );
const logDir = path.join( localDir, 'logs' );
const stateDir = path.join( localDir, 'state' );
const mergedTranslatorsDir = process.env.LOCAL_TRANSLATORS_DIR ||
	path.join( localDir, 'translators' );
const stylesRootDir = process.env.LOCAL_STYLES_DIR ||
	path.join( localDir, 'styles' );
const stylesRepoDir = path.join( stylesRootDir, 'repo-zotero-chinese' );
const cslDir = path.join( stylesRootDir, 'csl' );
const localeDir = path.join( stylesRootDir, 'locales' );
const defaultStylesRepo = vendoredStylesDir;
const defaultPdfFetchIntervalMs = parseInt( process.env.CITOID_LOCAL_FETCH_INTERVAL_MS || '800', 10 );
const defaultRequestTimeoutMs = parseInt( process.env.CITOID_LOCAL_FETCH_TIMEOUT_MS || '15000', 10 );
const defaultProbeBodyBytes = parseInt( process.env.CITOID_LOCAL_PROBE_BODY_BYTES || '1572864', 10 );
const defaultFetchConcurrency = parseInt( process.env.CITOID_LOCAL_FETCH_CONCURRENCY || '4', 10 );
const defaultBatchConcurrency = parseInt( process.env.CITOID_LOCAL_BATCH_CONCURRENCY || '4', 10 );
const defaultOpenUrlBase = process.env.OPENURL_BASE || '';
const defaultZoteroApiBase = process.env.ZOTERO_API_BASE || 'https://api.zotero.org';
const defaultZoteroUserId = process.env.ZOTERO_USER_ID || '';
const defaultZoteroApiKey = process.env.ZOTERO_API_KEY || '';
const defaultZoteroLibraryType = process.env.ZOTERO_LIBRARY_TYPE || 'users';
const defaultZoteroLibraryId = process.env.ZOTERO_LIBRARY_ID || '';
const zoteroAuthPath = path.join( stateDir, 'zotero-auth.json' );
const cacheRootDir = process.env.LOCAL_CACHE_DIR || path.join( localDir, 'cache' );
const cacheMetaPath = path.join( cacheRootDir, 'cache-meta.json' );
const pdfCacheDir = path.join( cacheRootDir, 'pdfs' );
const defaultCacheTtlSec = parseInt( process.env.CITOID_LOCAL_CACHE_TTL_SEC || '86400', 10 );
let cacheMetaMemo = null;

BBPromise.onPossiblyUnhandledRejection( () => {
} );

function usage() {
	console.error( 'usage:' );
	console.error( '  botcite mcp' );
	console.error( '  botcite setup' );
	console.error( '  botcite api [--headers] <path>' );
	console.error( '  botcite cite [--headers] <format> <query>' );
	console.error( '  botcite cite-pdf [--headers] <pdf-path>' );
	console.error( '  botcite fetch-pdf [--base <openurl-base>] [--out <file.pdf>] <doi|arxiv|url>' );
	console.error( '  botcite openurl-resolve [--base <openurl-base>] <doi|arxiv|url>' );
	console.error( '  botcite zotero <login|logout|whoami|query|dump|cite|add|delete|update|note> [...]' );
	console.error( '  botcite batch --op <cite|cite-style|fetch-pdf|openurl-resolve> --in <file>' );
	console.error( '  botcite styles sync [--repo <git-url>]' );
	console.error( '  botcite cite-style [--plain] [--style <name-or-path>] [--locale zh-CN] <query>' );
	console.error( '  botcite info' );
	console.error( '  botcite spec' );
	console.error( 'examples:' );
	console.error( "  botcite api --headers '/_info'" );
	console.error( "  botcite api '/?spec'" );
	console.error( '  botcite cite bibtex 10.1145/3368089.3409741' );
	console.error( '  botcite cite mediawiki https://arxiv.org/abs/1706.03762' );
	console.error( '  botcite cite-pdf ./paper.pdf' );
	console.error( '  botcite fetch-pdf 10.1038/s41586-020-2649-2' );
	console.error( '  botcite fetch-pdf 1706.03762 --out ./attention.pdf' );
	console.error( "  botcite openurl-resolve --base 'https://example.edu/openurl' 10.1038/s41586-020-2649-2" );
	console.error( '  botcite zotero login --user-id 123456 --api-key xxxx' );
	console.error( '  botcite zotero whoami' );
	console.error( "  botcite zotero query 'transformer'" );
	console.error( '  botcite zotero cite AB12CD34' );
	console.error( '  botcite batch --op cite --format bibtex --in ./ids.txt --out-jsonl ./result.jsonl' );
	console.error( 'options:' );
	console.error( '  --concurrency <n>  batch worker count (default: 4)' );
	console.error( '  --user-id <id>     Zotero user id (or set ZOTERO_USER_ID)' );
	console.error( '  --api-key <key>    Zotero API key (or set ZOTERO_API_KEY)' );
	console.error( '  --library-type     users|groups (default: users)' );
	console.error( '  --library-id <id>  Zotero library id (group id for groups)' );
	console.error( '  --limit <n>        Zotero query/dump limit (1-100)' );
	console.error( '  -y, --yes          skip interactive confirmation (delete)' );
	console.error( '  --profile          print timing diagnostics to stderr' );
	console.error( '  botcite styles sync' );
	console.error( "  botcite cite-style --locale zh-CN '10.1145/3368089.3409741'" );
	console.error( "  botcite cite-style --plain --locale zh-CN '10.1145/3368089.3409741'" );
}

function usageZotero( subAction = '' ) {
	const action = String( subAction || '' ).trim().toLowerCase();
	if ( action === 'login' ) {
		console.error( 'usage:' );
		console.error( '  botcite zotero login --user-id <id> --api-key <key> [--zotero-api-base <url>]' );
		console.error( '  botcite zotero login --library-type groups --library-id <group-id> --api-key <key>' );
		console.error( 'notes:' );
		console.error( '  - personal library defaults to library-type users' );
		console.error( '  - credentials are saved to .local/state/zotero-auth.json' );
		console.error( '  - API key can be created at https://www.zotero.org/settings/keys' );
		return;
	}
	if ( action === 'logout' ) {
		console.error( 'usage:' );
		console.error( '  botcite zotero logout' );
		console.error( 'notes:' );
		console.error( '  - removes local credentials from .local/state/zotero-auth.json' );
		return;
	}
	if ( action === 'whoami' ) {
		console.error( 'usage:' );
		console.error( '  botcite zotero whoami [--api-key <key>] [--zotero-api-base <url>]' );
		console.error( 'notes:' );
		console.error( '  - reads account identity from /keys/current' );
		console.error( '  - useful for discovering user-id from an API key' );
		return;
	}
	if ( action === 'query' ) {
		console.error( 'usage:' );
		console.error( "  botcite zotero query <text> [--limit <1-100>]" );
		return;
	}
	if ( action === 'dump' ) {
		console.error( 'usage:' );
		console.error( '  botcite zotero dump [--limit <1-100>]' );
		return;
	}
	if ( action === 'cite' ) {
		console.error( 'usage:' );
		console.error( '  botcite zotero cite <item-key|zotero-url>' );
		console.error( 'examples:' );
		console.error( '  botcite zotero cite AB12CD34' );
		console.error( '  botcite zotero cite https://www.zotero.org/users/123/items/AB12CD34' );
		return;
	}
	if ( action === 'add' ) {
		console.error( 'usage:' );
		console.error( "  botcite zotero add '<json>'" );
		console.error( '  botcite zotero add @./item.json' );
		console.error( 'notes:' );
		console.error( '  - strict sanity checks are applied before write' );
		console.error( '  - payload must include itemType' );
		return;
	}
	if ( action === 'delete' ) {
		console.error( 'usage:' );
		console.error( '  botcite zotero delete <item-key|zotero-url>' );
		console.error( '  botcite zotero delete -y <item-key|zotero-url>' );
		console.error( 'notes:' );
		console.error( '  - uses item version precondition to prevent stale delete' );
		console.error( '  - default requires interactive confirmation: type \"yes\" to continue' );
		return;
	}
	if ( action === 'update' ) {
		console.error( 'usage:' );
		console.error( "  botcite zotero update <item-key|zotero-url> '<json-patch>'" );
		console.error( '  botcite zotero update <item-key|zotero-url> @./patch.json' );
		console.error( 'notes:' );
		console.error( '  - strict sanity checks are applied before write' );
		console.error( '  - key/version/library fields are rejected in patch payload' );
		return;
	}
	if ( action === 'note' ) {
		console.error( 'usage:' );
		console.error( "  botcite zotero note add <parent-item-key|zotero-url> '<note-html-or-text>'" );
		console.error( '  botcite zotero note add <parent-item-key|zotero-url> @./note.html' );
		console.error( '  botcite zotero note list <parent-item-key|zotero-url> [--limit <1-100>]' );
		console.error( "  botcite zotero note update <note-key|zotero-url> '<note-html-or-text>'" );
		console.error( '  botcite zotero note update <note-key|zotero-url> @./note.html' );
		console.error( '  botcite zotero note delete <note-key|zotero-url>' );
		console.error( '  botcite zotero note delete -y <note-key|zotero-url>' );
		console.error( 'notes:' );
		console.error( '  - add/update run strict sanity checks on note content' );
		console.error( '  - delete requires yes/no confirmation unless -y is provided' );
		return;
	}

	console.error( 'usage:' );
	console.error( '  botcite zotero <login|logout|whoami|query|dump|cite|add|delete|update|note> [...]' );
	console.error( 'commands:' );
	console.error( '  login   save Zotero API credentials locally' );
	console.error( '  logout  clear saved credentials' );
	console.error( '  whoami  show account identity from current API key' );
	console.error( '  query   full-text search in configured library' );
	console.error( '  dump    list library items as JSON' );
	console.error( '  cite    fetch BibTeX for one item' );
	console.error( '  add     add one item with strict sanity checks' );
	console.error( '  delete  delete one item with version precondition' );
	console.error( '  update  update one item with strict sanity checks' );
	console.error( '  note    manage child notes (add/list/update/delete)' );
	console.error( 'examples:' );
	console.error( '  botcite zotero login --user-id 123456 --api-key xxxx' );
	console.error( '  botcite zotero whoami' );
	console.error( "  botcite zotero query 'transformer'" );
	console.error( '  botcite zotero dump --limit 10' );
	console.error( '  botcite zotero cite AB12CD34' );
	console.error( "  botcite zotero add '{\"itemType\":\"journalArticle\",\"title\":\"Demo\"}'" );
	console.error( "  botcite zotero note add AB12CD34 '<p>Important note</p>'" );
	console.error( '  botcite zotero note list AB12CD34' );
	console.error( '  botcite zotero delete AB12CD34' );
	console.error( "  botcite zotero update AB12CD34 '{\"title\":\"New title\"}'" );
	console.error( 'help:' );
	console.error( '  botcite zotero login --help' );
}

function ensureDirs() {
	fs.mkdirSync( logDir, { recursive: true } );
	fs.mkdirSync( stateDir, { recursive: true } );
	fs.mkdirSync( stylesRootDir, { recursive: true } );
	fs.mkdirSync( cacheRootDir, { recursive: true } );
	fs.mkdirSync( pdfCacheDir, { recursive: true } );
}

function fileExists( filePath ) {
	try {
		fs.accessSync( filePath );
		return true;
	} catch ( error ) {
		return false;
	}
}

function commandExists( command ) {
	const found = spawnSync( 'bash', [ '-lc', `command -v ${ command }` ], {
		stdio: 'pipe',
		encoding: 'utf8'
	} );
	return found.status === 0;
}

function stableStringify( value ) {
	if ( value === null || typeof value !== 'object' ) {
		return JSON.stringify( value );
	}
	if ( Array.isArray( value ) ) {
		return `[${ value.map( stableStringify ).join( ',' ) }]`;
	}
	const keys = Object.keys( value ).sort();
	return `{${ keys.map( ( key ) => `${ JSON.stringify( key ) }:${ stableStringify( value[ key ] ) }` ).join( ',' ) }`;
}

function makeCacheKey( namespace, payload ) {
	const raw = `${ namespace }|${ stableStringify( payload ) }`;
	return crypto.createHash( 'sha1' ).update( raw ).digest( 'hex' );
}

function loadCacheMeta() {
	if ( cacheMetaMemo ) {
		return cacheMetaMemo;
	}
	if ( !fileExists( cacheMetaPath ) ) {
		cacheMetaMemo = {};
		return cacheMetaMemo;
	}
	try {
		const text = fs.readFileSync( cacheMetaPath, 'utf8' );
		const parsed = JSON.parse( text );
		cacheMetaMemo = parsed && typeof parsed === 'object' ? parsed : {};
		return cacheMetaMemo;
	} catch ( error ) {
		cacheMetaMemo = {};
		return cacheMetaMemo;
	}
}

function saveCacheMeta( meta ) {
	cacheMetaMemo = meta;
	fs.writeFileSync( cacheMetaPath, `${ JSON.stringify( meta ) }\n` );
}

function profileLog( options, stage, startedAt, extra = '' ) {
	if ( options && options.profile ) {
		const suffix = extra ? ` ${ extra }` : '';
		console.error( `[profile] ${ stage } ${ Date.now() - startedAt }ms${ suffix }` );
	}
}

function getCachedValue( cacheKey ) {
	const meta = loadCacheMeta();
	const entry = meta[ cacheKey ];
	if ( !entry || typeof entry !== 'object' ) {
		return null;
	}
	if ( entry.expiresAt && Date.now() > entry.expiresAt ) {
		delete meta[ cacheKey ];
		saveCacheMeta( meta );
		return null;
	}
	return entry.value;
}

function setCachedValue( cacheKey, value, ttlSec ) {
	const ttlMs = Math.max( 0, ( Number.isFinite( ttlSec ) ? ttlSec : defaultCacheTtlSec ) * 1000 );
	const meta = loadCacheMeta();
	meta[ cacheKey ] = {
		expiresAt: Date.now() + ttlMs,
		value
	};
	saveCacheMeta( meta );
}

async function readThroughCache( namespace, payload, ttlSec, compute ) {
	const cacheKey = makeCacheKey( namespace, payload );
	const cached = getCachedValue( cacheKey );
	if ( cached !== null ) {
		return { value: cached, cacheHit: true };
	}
	const value = await compute();
	setCachedValue( cacheKey, value, ttlSec );
	return { value, cacheHit: false };
}

function jsonOut( value ) {
	process.stdout.write( `${ JSON.stringify( value, null, 2 ) }\n` );
}

function runCommandText( command, args ) {
	const result = spawnSync( command, args, {
		stdio: 'pipe',
		encoding: 'utf8'
	} );
	if ( result.status !== 0 ) {
		const stderr = ( result.stderr || '' ).trim();
		throw new Error( stderr || `${ command } failed` );
	}
	return result.stdout || '';
}

function runCommandOrThrow( command, args, cwd ) {
	const result = spawnSync( command, args, {
		cwd: cwd || rootDir,
		stdio: 'pipe',
		encoding: 'utf8'
	} );
	if ( result.status !== 0 ) {
		const stderr = ( result.stderr || '' ).trim();
		throw new Error( stderr || `${ command } failed` );
	}
	return result;
}

function repoReady( repoPath ) {
	try {
		return fs.statSync( repoPath ).isDirectory();
	} catch ( error ) {
		return false;
	}
}

function repoHeadOrMissing( repoPath ) {
	if ( !repoReady( repoPath ) ) {
		return 'missing';
	}
	if ( fileExists( path.join( repoPath, '.git' ) ) ) {
		try {
			return runCommandText( 'git', [ '-C', repoPath, 'rev-parse', 'HEAD' ] ).trim() || 'unknown';
		} catch ( error ) {
			return 'unknown';
		}
	}
	const stat = fs.statSync( repoPath );
	return `vendored-${ Math.floor( stat.mtimeMs ) }`;
}

function translatorsNeedSync() {
	const stampPath = path.join( stateDir, 'translators-sync.stamp' );
	const hasMerged = fileExists( mergedTranslatorsDir ) &&
		fs.readdirSync( mergedTranslatorsDir ).some( ( name ) => name.endsWith( '.js' ) );
	if ( !hasMerged ) {
		return true;
	}

	const currentStamp = `zotero=${ repoHeadOrMissing( path.join( zoteroDir, 'modules', 'translators' ) ) };cn=${ repoHeadOrMissing( cnTranslatorsDir ) }`;
	let previousStamp = '';
	if ( fileExists( stampPath ) ) {
		previousStamp = fs.readFileSync( stampPath, 'utf8' ).trim();
	}
	return currentStamp !== previousStamp;
}

function writeTranslatorStamp() {
	const stampPath = path.join( stateDir, 'translators-sync.stamp' );
	const stamp = `zotero=${ repoHeadOrMissing( path.join( zoteroDir, 'modules', 'translators' ) ) };cn=${ repoHeadOrMissing( cnTranslatorsDir ) }`;
	fs.writeFileSync( stampPath, `${ stamp }\n` );
}

function syncMergedTranslators() {
	fs.rmSync( mergedTranslatorsDir, { recursive: true, force: true } );
	fs.mkdirSync( mergedTranslatorsDir, { recursive: true } );
	const zoteroTranslators = path.join( zoteroDir, 'modules', 'translators' );
	if ( fileExists( zoteroTranslators ) ) {
		fs.readdirSync( zoteroTranslators )
			.filter( ( name ) => name.endsWith( '.js' ) )
			.forEach( ( name ) => {
				fs.copyFileSync(
					path.join( zoteroTranslators, name ),
					path.join( mergedTranslatorsDir, name )
				);
			} );
	}
	if ( fileExists( cnTranslatorsDir ) ) {
		fs.readdirSync( cnTranslatorsDir )
			.filter( ( name ) => name.endsWith( '.js' ) )
			.forEach( ( name ) => {
				fs.copyFileSync(
					path.join( cnTranslatorsDir, name ),
					path.join( mergedTranslatorsDir, name )
				);
			} );
	}
	writeTranslatorStamp();
}

function bootstrapLocalEnvironment() {
	ensureDirs();
	if ( !repoReady( zoteroDir ) || !repoReady( cnTranslatorsDir ) ) {
		throw new Error(
			'missing vendored repos under vendor/. pull the complete repository content.'
		);
	}

	if ( !fileExists( path.join( rootDir, 'node_modules' ) ) ) {
		runCommandOrThrow( 'bun', [ 'install' ], rootDir );
	}
	if ( !fileExists( path.join( zoteroDir, 'modules', 'translators' ) ) ) {
		throw new Error( 'missing vendored zotero contents under vendor/zotero/modules/translators' );
	}
	if ( !fileExists( path.join( zoteroDir, 'node_modules' ) ) ) {
		runCommandOrThrow( 'bun', [ 'install' ], zoteroDir );
	}
	if ( translatorsNeedSync() ) {
		syncMergedTranslators();
	}
}

function ensureInstalled() {
	if ( fileExists( path.join( rootDir, 'node_modules' ) ) &&
		fileExists( path.join( zoteroDir, 'node_modules' ) ) &&
		fileExists( mergedTranslatorsDir ) ) {
		return;
	}

	console.error( 'dependencies missing; bootstrapping runtime...' );
	try {
		bootstrapLocalEnvironment();
	} catch ( error ) {
		process.exitCode = 1;
		throw error;
	}
}

function ensureStyleRuntime() {
	if ( fileExists( cslDir ) && fileExists( localeDir ) ) {
		return;
	}
	throw new Error( 'Styles are not synced. Run: botcite styles sync' );
}

function walkFiles( dirPath ) {
	const entries = fs.readdirSync( dirPath, { withFileTypes: true } );
	let result = [];
	entries.forEach( ( entry ) => {
		const fullPath = path.join( dirPath, entry.name );
		if ( entry.isDirectory() ) {
			result = result.concat( walkFiles( fullPath ) );
		} else if ( entry.isFile() ) {
			result.push( fullPath );
		}
	} );
	return result;
}

function normalizeDoi( raw ) {
	return raw.replace( /[)\].,;:]+$/g, '' ).trim();
}

function isLikelyTitleLine( line ) {
	return line.length > 20 &&
		line.length < 300 &&
		!/^(abstract|keywords?|introduction|references?)\b/i.test( line ) &&
		!/doi\.org\//i.test( line ) &&
		!/^\d+\s*$/.test( line );
}

function uniqueKeepOrder( items ) {
	const seen = new Set();
	const result = [];
	items.forEach( ( item ) => {
		const key = item.trim();
		if ( key && !seen.has( key ) ) {
			seen.add( key );
			result.push( key );
		}
	} );
	return result;
}

function extractPdfCandidates( pdfPath ) {
	if ( !fileExists( pdfPath ) ) {
		throw new Error( `PDF not found: ${ pdfPath }` );
	}
	if ( !commandExists( 'pdftotext' ) ) {
		throw new Error( 'pdftotext is required. Install poppler-utils first.' );
	}

	let text = '';
	try {
		text = runCommandText( 'pdftotext', [ '-f', '1', '-l', '2', '-layout', pdfPath, '-' ] );
	} catch ( error ) {
		text = runCommandText( 'pdftotext', [ '-f', '1', '-l', '2', pdfPath, '-' ] );
	}

	let metadataTitle = null;
	if ( commandExists( 'pdfinfo' ) ) {
		try {
			const infoText = runCommandText( 'pdfinfo', [ pdfPath ] );
			const titleMatch = infoText.match( /^\s*Title:\s+(.+)$/im );
			if ( titleMatch && titleMatch[ 1 ] ) {
				metadataTitle = titleMatch[ 1 ].trim();
			}
		} catch ( error ) {
		}
	}

	const combined = `${ metadataTitle || '' }\n${ text }`;
	const doiMatch = combined.match( /\b10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i );
	if ( doiMatch && doiMatch[ 0 ] ) {
		return {
			type: 'doi',
			value: normalizeDoi( doiMatch[ 0 ] ),
			titles: []
		};
	}

	const arxivMatch = combined.match( /\b(?:arxiv:\s*)?((?:\d{4}\.\d{4,5}|[a-z-]+(?:\.[A-Z]{2})?\/\d{7})(?:v\d+)?)\b/i );
	if ( arxivMatch && arxivMatch[ 1 ] ) {
		return {
			type: 'arxiv',
			value: `https://arxiv.org/abs/${ arxivMatch[ 1 ] }`,
			titles: []
		};
	}

	const lines = combined.split( /\r?\n/ )
		.map( ( line ) => line.trim() )
		.filter( ( line ) => line )
		.filter( isLikelyTitleLine );

	const titleCandidates = uniqueKeepOrder( [
		metadataTitle || '',
		...lines.slice( 0, 8 )
	] ).slice( 0, 5 );

	if ( titleCandidates.length ) {
		return {
			type: 'title',
			value: titleCandidates[ 0 ],
			titles: titleCandidates
		};
	}

	throw new Error( 'Could not detect DOI/arXiv/title from PDF.' );
}

function getFreePort() {
	return new Promise( ( resolve, reject ) => {
		const server = net.createServer();
		server.listen( 0, '127.0.0.1', () => {
			const address = server.address();
			server.close( () => resolve( address.port ) );
		} );
		server.on( 'error', reject );
	} );
}

function waitForPort( port, host = '127.0.0.1', timeoutMs = 30000 ) {
	const start = Date.now();

	return new Promise( ( resolve, reject ) => {
		function retry() {
			if ( Date.now() - start >= timeoutMs ) {
				reject( new Error( `timeout waiting for ${ host }:${ port }` ) );
				return;
			}
			setTimeout( poll, 500 );
		}

		function poll() {
			const socket = net.createConnection( { port, host }, () => {
				socket.end();
				resolve();
			} );
			socket.on( 'error', retry );
		}

		poll();
	} );
}

function terminateProcess( child ) {
	return new Promise( ( resolve ) => {
		if ( !child || child.exitCode !== null || child.killed ) {
			resolve();
			return;
		}

		child.once( 'exit', () => resolve() );
		child.kill( 'SIGTERM' );
		setTimeout( () => {
			if ( child.exitCode === null ) {
				child.kill( 'SIGKILL' );
			}
		}, 3000 ).unref();
	} );
}

function httpGet( url ) {
	return new Promise( ( resolve, reject ) => {
		const req = http.get( url, ( res ) => {
			let body = '';
			res.setEncoding( 'utf8' );
			res.on( 'data', ( chunk ) => {
				body += chunk;
			} );
			res.on( 'end', () => {
				if ( res.statusCode && res.statusCode >= 200 && res.statusCode < 300 ) {
					resolve( {
						statusCode: res.statusCode,
						headers: res.headers,
						body
					} );
					return;
				}
				const error = new Error( `request failed with status ${ res.statusCode }` );
				error.statusCode = res.statusCode;
				error.headers = res.headers;
				error.body = body;
				reject( error );
			} );
		} );
		req.on( 'error', reject );
	} );
}

function createSilentLogger() {
	const discard = {
		write( chunk, encoding, callback ) {
			if ( callback ) {
				callback();
			}
		}
	};

	const wrap = ( logger ) => ( {
		_logger: logger,
		log( levelPath, ...args ) {
			const level = String( levelPath ).split( '/' )[ 0 ];
			if ( typeof logger[ level ] === 'function' ) {
				logger[ level ]( ...args );
			}
		},
		child( fields ) {
			return wrap( logger.child( fields ) );
		}
	} );

	return wrap( bunyan.createLogger( {
		name: 'botcite',
		streams: [ { type: 'raw', stream: discard } ]
	} ) );
}

function createNoopMetrics() {
	const noopMetric = {
		increment() {
		},
		endTiming() {
		}
	};

	return {
		makeMetric() {
			return noopMetric;
		},
		getServiceLabel() {
			return {};
		}
	};
}

function printResponse( response, options ) {
	if ( options.headers ) {
		process.stdout.write( `HTTP ${ response.statusCode }\n` );
		Object.entries( response.headers ).forEach( ( [ key, value ] ) => {
			process.stdout.write( `${ key }: ${ value }\n` );
		} );
		process.stdout.write( '\n' );
	}

	process.stdout.write( response.body );
	if ( !response.body.endsWith( '\n' ) ) {
		process.stdout.write( '\n' );
	}
}

function parseOptions( args ) {
	const options = {
		headers: false,
		plain: false,
		style: null,
		locale: 'en-US',
		repo: defaultStylesRepo,
		base: defaultOpenUrlBase,
		zoteroApiBase: defaultZoteroApiBase,
		zoteroUserId: defaultZoteroUserId,
		zoteroApiKey: defaultZoteroApiKey,
		zoteroLibraryType: defaultZoteroLibraryType,
		zoteroLibraryId: defaultZoteroLibraryId,
		limit: 20,
		yes: false,
		out: '',
		op: '',
		in: '',
		outJsonl: '',
		json: false,
		format: '',
		concurrency: defaultBatchConcurrency,
		cacheTtlSec: defaultCacheTtlSec,
		profile: false,
		silent: false,
		args: []
	};

	for ( let i = 0; i < args.length; i++ ) {
		const arg = args[ i ];
		if ( arg === '--headers' ) {
			options.headers = true;
		} else if ( arg === '--plain' ) {
			options.plain = true;
		} else if ( arg === '--style' ) {
			options.style = args[ i + 1 ] || '';
			i++;
		} else if ( arg === '--locale' ) {
			options.locale = args[ i + 1 ] || 'en-US';
			i++;
		} else if ( arg === '--repo' ) {
			options.repo = args[ i + 1 ] || defaultStylesRepo;
			i++;
		} else if ( arg === '--out' ) {
			options.out = args[ i + 1 ] || '';
			i++;
		} else if ( arg === '--base' ) {
			options.base = args[ i + 1 ] || defaultOpenUrlBase;
			i++;
		} else if ( arg === '--zotero-api-base' ) {
			options.zoteroApiBase = args[ i + 1 ] || defaultZoteroApiBase;
			i++;
		} else if ( arg === '--user-id' || arg === '--zotero-user-id' ) {
			options.zoteroUserId = args[ i + 1 ] || '';
			i++;
		} else if ( arg === '--api-key' || arg === '--zotero-api-key' ) {
			options.zoteroApiKey = args[ i + 1 ] || '';
			i++;
		} else if ( arg === '--library-type' || arg === '--zotero-library-type' ) {
			options.zoteroLibraryType = args[ i + 1 ] || defaultZoteroLibraryType;
			i++;
		} else if ( arg === '--library-id' || arg === '--zotero-library-id' ) {
			options.zoteroLibraryId = args[ i + 1 ] || '';
			i++;
		} else if ( arg === '--limit' ) {
			const raw = args[ i + 1 ];
			options.limit = parseInt( raw || '20', 10 );
			i++;
		} else if ( arg === '--yes' || arg === '-y' ) {
			options.yes = true;
		} else if ( arg === '--op' ) {
			options.op = args[ i + 1 ] || '';
			i++;
		} else if ( arg === '--in' ) {
			options.in = args[ i + 1 ] || '';
			i++;
		} else if ( arg === '--out-jsonl' ) {
			options.outJsonl = args[ i + 1 ] || '';
			i++;
		} else if ( arg === '--json' ) {
			options.json = true;
		} else if ( arg === '--format' ) {
			options.format = args[ i + 1 ] || '';
			i++;
		} else if ( arg === '--cache-ttl-sec' ) {
			const ttlRaw = args[ i + 1 ];
			options.cacheTtlSec = parseInt( ttlRaw || String( defaultCacheTtlSec ), 10 );
			i++;
		} else if ( arg === '--concurrency' ) {
			const raw = args[ i + 1 ];
			options.concurrency = parseInt( raw || String( defaultBatchConcurrency ), 10 );
			i++;
		} else if ( arg === '--profile' ) {
			options.profile = true;
		} else {
			options.args.push( arg );
		}
	}

	return options;
}

async function withRunningServices( callback ) {
	ensureDirs();
	ensureInstalled();

	const zoteroPort = await getFreePort();
	const timestamp = `${ Date.now() }-${ process.pid }`;
	const zoteroLogPath = path.join( logDir, `zotero-once-${ timestamp }.log` );
	const citoidLogPath = path.join( logDir, `citoid-once-${ timestamp }.log` );
	const baseConfig = yaml.load( fs.readFileSync( path.join( rootDir, 'config.dev.yaml' ), 'utf8' ) );
	const serviceConf = baseConfig.services[ 0 ].conf;
	serviceConf.port = 0;
	serviceConf.interface = '127.0.0.1';
	serviceConf.zoteroInterface = '127.0.0.1';
	serviceConf.zoteroPort = zoteroPort;
	serviceConf.user_agent = 'botcite-cli';
	serviceConf.mailto = process.env.MAILTO || 'example@example.com';
	// eslint-disable-next-line security/detect-non-literal-fs-filename
	fs.writeFileSync( zoteroLogPath, '' );
	// eslint-disable-next-line security/detect-non-literal-fs-filename
	fs.writeFileSync( citoidLogPath, '' );

	const zoteroEnv = {
		...process.env,
		NODE_CONFIG: JSON.stringify( {
			port: zoteroPort,
			host: '127.0.0.1',
			translatorsDirectory: mergedTranslatorsDir
		} ),
		USER_AGENT: process.env.USER_AGENT ||
			`Mozilla/5.0 CitoidLocal/1.0 (${ process.env.MAILTO || 'example@example.com' })`
	};

	const zoteroProc = spawn( 'node', [ 'src/server.js' ], {
		cwd: zoteroDir,
		env: zoteroEnv,
		// eslint-disable-next-line security/detect-non-literal-fs-filename
		stdio: [ 'ignore', fs.openSync( zoteroLogPath, 'a' ), fs.openSync( zoteroLogPath, 'a' ) ]
	} );

	let citoidServer;

	try {
		await waitForPort( zoteroPort );

		const logger = createSilentLogger();
		const metrics = createNoopMetrics();
		const app = await citoidApp.buildApp( {
			config: serviceConf,
			logger,
			metrics
		} );
		citoidServer = await citoidApp.createServer( app );
		const citoidPort = citoidServer.address().port;
		return await callback( { citoidPort, zoteroLogPath, citoidLogPath } );
	} finally {
		if ( citoidServer ) {
			await new Promise( ( resolve ) => {
				citoidServer.shutdown( resolve );
			} );
		}
		await terminateProcess( zoteroProc );
	}
}

async function runApiPath( requestPath, options = {} ) {
	const startedAt = Date.now();
	const normalizedPath = requestPath.startsWith( '/' ) ? requestPath : `/${ requestPath }`;
	const response = await withRunningServices(
		async ( ctx ) => httpGet( `http://127.0.0.1:${ ctx.citoidPort }${ normalizedPath }` )
	);
	if ( options.json ) {
		jsonOut( {
			ok: true,
			command: 'api',
			stage: 'done',
			elapsed_ms: Date.now() - startedAt,
			path: normalizedPath,
			response
		} );
		return response;
	}
	printResponse( response, options );
	profileLog( options, 'api', startedAt, `path=${ normalizedPath }` );
	return response;
}

async function runCitation( format, query, options ) {
	const startedAt = Date.now();
	const rawQuery = String( query || '' ).trim();
	const arxivId = normalizeArxivId( rawQuery );
	if ( format === 'bibtex' && isLikelyPdfUrl( rawQuery ) && !arxivId ) {
		const tmpPdfPath = path.join(
			cacheRootDir,
			'tmp',
			`${ makeCacheKey( 'cite-pdf-url', { query: rawQuery } ) }.pdf`
		);
		ensurePdfOutputDir( tmpPdfPath );
		await runFetchPdf( rawQuery, {
			...options,
			json: false,
			silent: true,
			out: tmpPdfPath
		} );
		return runCitationFromPdf( tmpPdfPath, options );
	}
	const normalized = normalizeCitationQuery( query );
	const cached = await readThroughCache(
		'cite-response',
		{ format, query: normalized.query },
		options.cacheTtlSec,
		async () => withRunningServices( ( ctx ) => queryCitationWithContext( ctx, format, normalized.query ) )
	);
	const response = cached.value;
	if ( options.json ) {
		jsonOut( {
			ok: true,
			command: 'cite',
			cache_hit: cached.cacheHit,
			elapsed_ms: Date.now() - startedAt,
			stage: 'done',
			format,
			query,
			query_used: normalized.query,
			query_normalized: normalized.normalized,
			response
		} );
		return response;
	}
	if ( !options.silent ) {
		printResponse( response, options );
	}
	profileLog(
		options,
		'cite',
		startedAt,
		`cache_hit=${ cached.cacheHit } normalized=${ normalized.normalized }`
	);
	return response;
}

async function queryCitationWithContext( ctx, format, query ) {
	return httpGet( `http://127.0.0.1:${ ctx.citoidPort }/${ format }/${ encodeURIComponent( query ) }` );
}

async function runCitationFromPdf( pdfPath, options ) {
	const startedAt = Date.now();
	const candidates = extractPdfCandidates( path.resolve( pdfPath ) );
	if ( candidates.type === 'doi' || candidates.type === 'arxiv' ) {
		return runCitation( 'bibtex', candidates.value, options );
	}

	return withRunningServices( async ( ctx ) => {
		let lastError;
		for ( const title of candidates.titles ) {
			try {
				const response = await queryCitationWithContext( ctx, 'bibtex', title );
				if ( options.json ) {
					jsonOut( {
						ok: true,
						command: 'cite-pdf',
						stage: 'done',
						elapsed_ms: Date.now() - startedAt,
						source: 'title-fallback',
						query: title,
						response
					} );
				} else {
					printResponse( response, options );
				}
				return response;
			} catch ( error ) {
				lastError = error;
			}
		}

		if ( lastError ) {
			throw lastError;
		}
		throw new Error( 'Unable to resolve citation from extracted PDF titles.' );
	} );
}

async function syncStyles( options ) {
	ensureDirs();
	fs.mkdirSync( cslDir, { recursive: true } );
	fs.mkdirSync( localeDir, { recursive: true } );
	const sourceStylesDir = path.isAbsolute( options.repo || '' ) ?
		( options.repo || stylesRepoDir ) :
		path.join( rootDir, options.repo || 'vendor/styles' );
	if ( !fileExists( sourceStylesDir ) ) {
		throw new Error( `styles source not found: ${ sourceStylesDir }` );
	}

	const cslFiles = walkFiles( sourceStylesDir )
		.filter( ( filePath ) => filePath.endsWith( '.csl' ) );
	cslFiles.forEach( ( src ) => {
		const dest = path.join( cslDir, path.basename( src ) );
		fs.copyFileSync( src, dest );
	} );

	const localeTargets = [ 'en-US', 'zh-CN' ];
	if ( !commandExists( 'curl' ) ) {
		throw new Error( 'curl is required for styles sync' );
	}
	for ( const locale of localeTargets ) {
		const localeUrl = `https://raw.githubusercontent.com/citation-style-language/locales/master/locales-${ locale }.xml`;
		const dest = path.join( localeDir, `locales-${ locale }.xml` );
		runCommandOrThrow( 'curl', [ '-fsSL', localeUrl, '-o', dest ] );
	}

	process.stdout.write( `styles synced to ${ cslDir }\n` );
}

function pickDefaultStylePath() {
	const styles = fs.readdirSync( cslDir )
		.filter( ( name ) => name.endsWith( '.csl' ) );
	if ( !styles.length ) {
		throw new Error( `No CSL styles found in ${ cslDir }` );
	}
	const preferred = styles.find( ( name ) => /gb[-—–]?t[-—–]?7714/i.test( name ) );
	return path.join( cslDir, preferred || styles[ 0 ] );
}

function resolveStylePath( styleOption ) {
	ensureStyleRuntime();
	if ( styleOption ) {
		const maybePath = path.resolve( styleOption );
		if ( fileExists( maybePath ) ) {
			return maybePath;
		}
		const withExt = styleOption.endsWith( '.csl' ) ? styleOption : `${ styleOption }.csl`;
		const inCslDir = path.join( cslDir, withExt );
		if ( fileExists( inCslDir ) ) {
			return inCslDir;
		}
		throw new Error( `Style not found: ${ styleOption }` );
	}
	return pickDefaultStylePath();
}

function parseIssued( rawDate ) {
	if ( !rawDate || typeof rawDate !== 'string' ) {
		return undefined;
	}
	const parts = rawDate.split( /[-/]/ ).map( ( p ) => parseInt( p, 10 ) ).filter( Number.isFinite );
	if ( !parts.length ) {
		return undefined;
	}
	return { 'date-parts': [ parts ] };
}

function creatorsToCslAuthors( creators ) {
	if ( !Array.isArray( creators ) ) {
		return undefined;
	}
	return creators.map( ( creator ) => {
		if ( creator.lastName || creator.firstName ) {
			return {
				family: creator.lastName || '',
				given: creator.firstName || ''
			};
		}
		if ( creator.name ) {
			return { literal: creator.name };
		}
		return null;
	} ).filter( Boolean );
}

function mapItemTypeToCsl( itemType ) {
	const typeMap = {
		journalArticle: 'article-journal',
		conferencePaper: 'paper-conference',
		book: 'book',
		bookSection: 'chapter',
		report: 'report',
		thesis: 'thesis',
		webpage: 'webpage',
		preprint: 'article'
	};
	return typeMap[ itemType ] || 'article';
}

function zoteroToCsl( zoteroItem ) {
	const csl = {
		id: 'item-1',
		type: mapItemTypeToCsl( zoteroItem.itemType ),
		title: zoteroItem.title,
		URL: zoteroItem.url,
		DOI: zoteroItem.DOI,
		ISBN: zoteroItem.ISBN,
		ISSN: zoteroItem.ISSN,
		volume: zoteroItem.volume,
		issue: zoteroItem.issue,
		page: zoteroItem.pages,
		publisher: zoteroItem.publisher,
		'publisher-place': zoteroItem.place,
		abstract: zoteroItem.abstractNote,
		'container-title': zoteroItem.publicationTitle || zoteroItem.websiteTitle
	};
	const authors = creatorsToCslAuthors( zoteroItem.creators );
	if ( authors && authors.length ) {
		csl.author = authors;
	}
	const issued = parseIssued( zoteroItem.date );
	if ( issued ) {
		csl.issued = issued;
	}
	return csl;
}

function renderWithCsl( cslItem, stylePath, localeCode ) {
	const styleXml = fs.readFileSync( stylePath, 'utf8' );
	const localePath = path.join( localeDir, `locales-${ localeCode }.xml` );
	if ( !fileExists( localePath ) ) {
		throw new Error( `Locale file not found: ${ localeCode }. Run styles sync first.` );
	}
	const localeXml = fs.readFileSync( localePath, 'utf8' );
	const sys = {
		retrieveLocale() {
			return localeXml;
		},
		retrieveItem( id ) {
			return cslItem.id === id ? cslItem : null;
		}
	};
	const engine = new CSL.Engine( sys, styleXml, localeCode );
	engine.updateItems( [ cslItem.id ] );
	const bibliography = engine.makeBibliography();
	return bibliography[ 1 ].join( '\n' );
}

function htmlToPlainText( html ) {
	return html
		.replace( /<[^>]+>/g, ' ' )
		.replace( /&nbsp;/g, ' ' )
		.replace( /&amp;/g, '&' )
		.replace( /&lt;/g, '<' )
		.replace( /&gt;/g, '>' )
		.replace( /&quot;/g, '"' )
		.replace( /&#39;/g, '\'' )
		.replace( /\s+/g, ' ' )
		.trim();
}

function sleep( ms ) {
	return new Promise( ( resolve ) => {
		setTimeout( resolve, ms );
	} );
}

function isHttpUrl( raw ) {
	try {
		const parsed = new URL( raw );
		return parsed.protocol === 'http:' || parsed.protocol === 'https:';
	} catch ( error ) {
		return false;
	}
}

function normalizeArxivId( raw ) {
	const value = String( raw || '' ).trim();
	const id = value
		.replace( /^https?:\/\/arxiv\.org\/(?:abs|pdf)\//i, '' )
		.replace( /\.pdf$/i, '' )
		.replace( /^arxiv:/i, '' )
		.trim();
	const match = id.match( /^((?:\d{4}\.\d{4,5}|[a-z-]+(?:\.[A-Z]{2})?\/\d{7})(?:v\d+)?)$/i );
	return match ? match[ 1 ] : null;
}

function detectIdentifierType( input ) {
	const value = String( input || '' ).trim();
	const arxivId = normalizeArxivId( value );
	if ( arxivId ) {
		return { type: 'arxiv', value: arxivId };
	}
	if ( isHttpUrl( value ) ) {
		return { type: 'url', value };
	}
	const doiMatch = value.match( /\b10\.\d{4,9}\/[-._;()/:A-Z0-9]+\b/i );
	if ( doiMatch ) {
		return { type: 'doi', value: normalizeDoi( doiMatch[ 0 ] ) };
	}
	throw new Error( `Unsupported identifier: ${ input }` );
}

function normalizeCitationQuery( rawQuery ) {
	const query = String( rawQuery || '' ).trim();
	const arxivId = normalizeArxivId( query );
	if ( arxivId ) {
		return {
			query: `https://arxiv.org/abs/${ arxivId }`,
			normalized: true
		};
	}
	return {
		query,
		normalized: false
	};
}

function normalizeZoteroLibraryType( rawType ) {
	const normalized = String( rawType || '' ).trim().toLowerCase();
	if ( normalized === 'users' || normalized === 'groups' ) {
		return normalized;
	}
	throw new Error( `Unsupported Zotero library type: ${ rawType } (use users or groups)` );
}

function loadZoteroAuth() {
	if ( !fileExists( zoteroAuthPath ) ) {
		return null;
	}
	try {
		const parsed = JSON.parse( fs.readFileSync( zoteroAuthPath, 'utf8' ) );
		if ( parsed && typeof parsed === 'object' ) {
			return parsed;
		}
		return null;
	} catch ( error ) {
		return null;
	}
}

function saveZoteroAuth( auth ) {
	ensureDirs();
	fs.writeFileSync( zoteroAuthPath, `${ JSON.stringify( auth, null, 2 ) }\n`, { mode: 0o600 } );
}

function clearZoteroAuth() {
	if ( fileExists( zoteroAuthPath ) ) {
		fs.rmSync( zoteroAuthPath, { force: true } );
	}
}

function mergeZoteroAuth(options) {
	const saved = loadZoteroAuth() || {};
	const merged = {
		apiBase: String( options.zoteroApiBase || saved.apiBase || defaultZoteroApiBase ).trim(),
		userId: String( options.zoteroUserId || saved.userId || defaultZoteroUserId ).trim(),
		apiKey: String( options.zoteroApiKey || saved.apiKey || defaultZoteroApiKey ).trim(),
		libraryType: String( options.zoteroLibraryType || saved.libraryType || defaultZoteroLibraryType ).trim(),
		libraryId: String( options.zoteroLibraryId || saved.libraryId || defaultZoteroLibraryId ).trim()
	};
	merged.libraryType = normalizeZoteroLibraryType( merged.libraryType );
	if ( merged.libraryType === 'users' && !merged.libraryId ) {
		merged.libraryId = merged.userId;
	}
	if ( merged.libraryType === 'users' && !merged.userId ) {
		merged.userId = merged.libraryId;
	}
	return merged;
}

function requireZoteroLibrary( auth ) {
	if ( !auth.libraryId ) {
		if ( auth.libraryType === 'users' ) {
			throw new Error( 'Missing Zotero user id. Run: botcite zotero login --user-id <id> --api-key <key>' );
		}
		throw new Error( 'Missing Zotero group id. Use --library-type groups --library-id <id> during login.' );
	}
}

function parseZoteroItemReference( rawReference, auth ) {
	const input = String( rawReference || '' ).trim();
	if ( !input ) {
		throw new Error( 'Missing Zotero item reference.' );
	}

	const keyOnly = input.match( /^[A-Z0-9]{8}$/i );
	if ( keyOnly ) {
		return {
			libraryType: auth.libraryType,
			libraryId: auth.libraryId,
			itemKey: keyOnly[ 0 ].toUpperCase()
		};
	}

	const webUser = input.match( /zotero\.org\/users\/(\d+)\/items\/([A-Z0-9]{8})/i );
	if ( webUser ) {
		return {
			libraryType: 'users',
			libraryId: webUser[ 1 ],
			itemKey: webUser[ 2 ].toUpperCase()
		};
	}

	const webGroup = input.match( /zotero\.org\/groups\/(\d+)\/items\/([A-Z0-9]{8})/i );
	if ( webGroup ) {
		return {
			libraryType: 'groups',
			libraryId: webGroup[ 1 ],
			itemKey: webGroup[ 2 ].toUpperCase()
		};
	}

	const localUser = input.match( /^zotero:\/\/select\/library\/items\/([A-Z0-9]{8})$/i );
	if ( localUser ) {
		return {
			libraryType: auth.libraryType,
			libraryId: auth.libraryId,
			itemKey: localUser[ 1 ].toUpperCase()
		};
	}

	const localGroup = input.match( /^zotero:\/\/select\/groups\/(\d+)\/items\/([A-Z0-9]{8})$/i );
	if ( localGroup ) {
		return {
			libraryType: 'groups',
			libraryId: localGroup[ 1 ],
			itemKey: localGroup[ 2 ].toUpperCase()
		};
	}

	throw new Error( `Unsupported Zotero reference: ${ input }` );
}

function buildZoteroApiUrl( auth, pathname, queryObj = {} ) {
	const base = String( auth.apiBase || defaultZoteroApiBase ).replace( /\/+$/, '' );
	const url = new URL( `${ base }${ pathname }` );
	Object.entries( queryObj ).forEach( ( [ key, value ] ) => {
		if ( value !== undefined && value !== null && value !== '' ) {
			url.searchParams.set( key, String( value ) );
		}
	} );
	return url.toString();
}

async function zoteroApiRequest( auth, pathname, queryObj = {} ) {
	const url = buildZoteroApiUrl( auth, pathname, queryObj );
	const headers = {
		Accept: 'application/json, text/plain;q=0.9, */*;q=0.1'
	};
	if ( auth.apiKey ) {
		headers[ 'Zotero-API-Key' ] = auth.apiKey;
	}
	const limiter = new HostRateLimiter( 0 );
	const response = await requestExternal( url, limiter, { headers } );
	const body = bodyToText( response );
	return { url, response, body };
}

function parseZoteroJsonArray( body, url ) {
	try {
		const parsed = JSON.parse( body );
		if ( Array.isArray( parsed ) ) {
			return parsed;
		}
		throw new Error( `Unexpected Zotero payload from ${ url }` );
	} catch ( error ) {
		throw new Error( `Invalid JSON from Zotero API: ${ error.message }` );
	}
}

function stripToSafeAuthView( auth ) {
	return {
		api_base: auth.apiBase,
		library_type: auth.libraryType,
		library_id: auth.libraryId,
		user_id: auth.userId || '',
		has_api_key: !!auth.apiKey
	};
}

function parseJsonInputArg( rawInput, label ) {
	const raw = String( rawInput || '' ).trim();
	if ( !raw ) {
		throw new Error( `Missing JSON payload for zotero ${ label }` );
	}
	let text = raw;
	if ( raw.startsWith( '@' ) ) {
		const filePath = path.resolve( raw.slice( 1 ) );
		if ( !fileExists( filePath ) ) {
			throw new Error( `Payload file not found: ${ filePath }` );
		}
		text = fs.readFileSync( filePath, 'utf8' );
	}
	try {
		return JSON.parse( text );
	} catch ( error ) {
		throw new Error( `Invalid JSON for zotero ${ label }: ${ error.message }` );
	}
}

function ensurePlainObject( value, label ) {
	if ( !value || typeof value !== 'object' || Array.isArray( value ) ) {
		throw new Error( `${ label } must be a JSON object` );
	}
}

function validateJsonNode( value, pathLabel, depth = 0 ) {
	if ( depth > 20 ) {
		throw new Error( `Payload is too deeply nested at ${ pathLabel }` );
	}
	if ( value === null ) {
		return;
	}
	const type = typeof value;
	if ( type === 'string' ) {
		if ( value.length > 20000 ) {
			throw new Error( `String too long at ${ pathLabel }` );
		}
		if ( /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test( value ) ) {
			throw new Error( `Control characters are not allowed at ${ pathLabel }` );
		}
		return;
	}
	if ( type === 'number' ) {
		if ( !Number.isFinite( value ) ) {
			throw new Error( `Non-finite number at ${ pathLabel }` );
		}
		return;
	}
	if ( type === 'boolean' ) {
		return;
	}
	if ( Array.isArray( value ) ) {
		if ( value.length > 2000 ) {
			throw new Error( `Array too large at ${ pathLabel }` );
		}
		value.forEach( ( item, index ) => {
			validateJsonNode( item, `${ pathLabel }[${ index }]`, depth + 1 );
		} );
		return;
	}
	if ( type === 'object' ) {
		Object.entries( value ).forEach( ( [ key, item ] ) => {
			validateJsonNode( item, `${ pathLabel }.${ key }`, depth + 1 );
		} );
		return;
	}
	throw new Error( `Unsupported value type at ${ pathLabel }` );
}

function validateCreatorsField( creators, label ) {
	if ( creators === undefined ) {
		return;
	}
	if ( !Array.isArray( creators ) ) {
		throw new Error( `${ label }.creators must be an array` );
	}
	creators.forEach( ( creator, index ) => {
		ensurePlainObject( creator, `${ label }.creators[${ index }]` );
		const hasName = typeof creator.name === 'string' && creator.name.trim();
		const hasLast = typeof creator.lastName === 'string' && creator.lastName.trim();
		if ( !hasName && !hasLast ) {
			throw new Error( `${ label }.creators[${ index }] needs name or lastName` );
		}
		if ( creator.creatorType && typeof creator.creatorType !== 'string' ) {
			throw new Error( `${ label }.creators[${ index }].creatorType must be string` );
		}
	} );
}

function validateTagsField( tags, label ) {
	if ( tags === undefined ) {
		return;
	}
	if ( !Array.isArray( tags ) ) {
		throw new Error( `${ label }.tags must be an array` );
	}
	tags.forEach( ( tag, index ) => {
		if ( typeof tag === 'string' ) {
			return;
		}
		ensurePlainObject( tag, `${ label }.tags[${ index }]` );
		if ( typeof tag.tag !== 'string' || !tag.tag.trim() ) {
			throw new Error( `${ label }.tags[${ index }].tag must be non-empty string` );
		}
	} );
}

function validateCollectionsField( collections, label ) {
	if ( collections === undefined ) {
		return;
	}
	if ( !Array.isArray( collections ) ) {
		throw new Error( `${ label }.collections must be an array` );
	}
	collections.forEach( ( key, index ) => {
		if ( typeof key !== 'string' || !/^[A-Z0-9]{8}$/i.test( key ) ) {
			throw new Error( `${ label }.collections[${ index }] must be an 8-char collection key` );
		}
	} );
}

function validateRelationsField( relations, label ) {
	if ( relations === undefined ) {
		return;
	}
	ensurePlainObject( relations, `${ label }.relations` );
	Object.entries( relations ).forEach( ( [ relKey, relVal ] ) => {
		if ( typeof relVal === 'string' ) {
			return;
		}
		if ( Array.isArray( relVal ) && relVal.every( ( x ) => typeof x === 'string' ) ) {
			return;
		}
		throw new Error( `${ label }.relations.${ relKey } must be string or string[]` );
	} );
}

function validateZoteroAddPayload( payload ) {
	ensurePlainObject( payload, 'zotero add payload' );
	validateJsonNode( payload, 'payload' );
	const serialized = JSON.stringify( payload );
	if ( serialized.length > 300000 ) {
		throw new Error( 'zotero add payload is too large' );
	}
	const blocked = [ 'key', 'version', 'libraryID', 'links', 'meta' ];
	blocked.forEach( ( key ) => {
		if ( Object.prototype.hasOwnProperty.call( payload, key ) ) {
			throw new Error( `zotero add payload cannot include reserved field: ${ key }` );
		}
	} );
	if ( typeof payload.itemType !== 'string' || !payload.itemType.trim() ) {
		throw new Error( 'zotero add payload requires non-empty itemType' );
	}
	validateCreatorsField( payload.creators, 'payload' );
	validateTagsField( payload.tags, 'payload' );
	validateCollectionsField( payload.collections, 'payload' );
	validateRelationsField( payload.relations, 'payload' );
}

function validateZoteroUpdatePayload( payload ) {
	ensurePlainObject( payload, 'zotero update payload' );
	validateJsonNode( payload, 'payload' );
	const serialized = JSON.stringify( payload );
	if ( serialized.length > 200000 ) {
		throw new Error( 'zotero update payload is too large' );
	}
	const blocked = [ 'key', 'version', 'libraryID', 'itemType', 'links', 'meta' ];
	blocked.forEach( ( key ) => {
		if ( Object.prototype.hasOwnProperty.call( payload, key ) ) {
			throw new Error( `zotero update payload cannot include reserved field: ${ key }` );
		}
	} );
	if ( Object.keys( payload ).length === 0 ) {
		throw new Error( 'zotero update payload must update at least one field' );
	}
	validateCreatorsField( payload.creators, 'payload' );
	validateTagsField( payload.tags, 'payload' );
	validateCollectionsField( payload.collections, 'payload' );
	validateRelationsField( payload.relations, 'payload' );
}

async function zoteroApiWriteRequest( auth, method, pathname, payload, extraHeaders = {} ) {
	const url = buildZoteroApiUrl( auth, pathname );
	const headers = {
		Accept: 'application/json, text/plain;q=0.9, */*;q=0.1',
		'Content-Type': 'application/json',
		...extraHeaders
	};
	if ( auth.apiKey ) {
		headers[ 'Zotero-API-Key' ] = auth.apiKey;
	}
	const bodyText = payload === undefined ? '' : JSON.stringify( payload );
	const limiter = new HostRateLimiter( 0 );
	const response = await requestExternal( url, limiter, {
		method,
		headers,
		bodyText
	} );
	return {
		url,
		response,
		body: bodyToText( response )
	};
}

async function fetchZoteroItemVersion( auth, ref ) {
	const { response, body } = await zoteroApiRequest(
		auth,
		`/${ ref.libraryType }/${ encodeURIComponent( ref.libraryId ) }/items/${ encodeURIComponent( ref.itemKey ) }`,
		{ format: 'json' }
	);
	if ( response.statusCode === 404 ) {
		throw new Error( `Zotero item not found: ${ ref.libraryType }/${ ref.libraryId }/${ ref.itemKey }` );
	}
	if ( response.statusCode < 200 || response.statusCode >= 300 ) {
		throw new Error( `Failed to read item version (${ response.statusCode })` );
	}
	const headerVersion = String( response.headers[ 'last-modified-version' ] || '' ).trim();
	if ( headerVersion ) {
		return headerVersion;
	}
	try {
		const parsed = JSON.parse( body );
		const candidate = parsed && parsed.data && parsed.data.version;
		return candidate ? String( candidate ) : '';
	} catch ( error ) {
		return '';
	}
}

async function confirmDelete(ref, options) {
	if ( options.yes ) {
		return true;
	}
	if ( !process.stdin.isTTY ) {
		throw new Error( 'Delete requires interactive confirmation. Re-run with -y/--yes in non-interactive mode.' );
	}
	const prompt = `Delete Zotero item ${ ref.libraryType }/${ ref.libraryId }/${ ref.itemKey }? (yes/no): `;
	return new Promise( ( resolve ) => {
		const rl = readline.createInterface( {
			input: process.stdin,
			output: process.stdout
		} );
		rl.question( prompt, ( answer ) => {
			rl.close();
			resolve( String( answer || '' ).trim().toLowerCase() === 'yes' );
		} );
	} );
}

async function fetchZoteroKeyInfo( auth ) {
	if ( !auth.apiKey ) {
		throw new Error( 'Missing Zotero API key. Pass --api-key or set ZOTERO_API_KEY.' );
	}
	const { url, response, body } = await zoteroApiRequest( auth, '/keys/current', { format: 'json' } );
	if ( response.statusCode === 403 ) {
		throw new Error( 'Zotero key check failed with 403. Verify API key and permissions.' );
	}
	if ( response.statusCode < 200 || response.statusCode >= 300 ) {
		throw new Error( `Zotero key check failed (${ response.statusCode }) at ${ url }` );
	}
	let parsed;
	try {
		parsed = JSON.parse( body );
	} catch ( error ) {
		throw new Error( `Invalid JSON from Zotero key check: ${ error.message }` );
	}
	const userID = String( parsed && parsed.userID || '' ).trim();
	const username = String( parsed && parsed.username || '' ).trim();
	return { userID, username, raw: parsed };
}

async function runZoteroLogin( options ) {
	const auth = mergeZoteroAuth( options );
	if ( !auth.apiKey ) {
		throw new Error( 'Missing Zotero API key. Pass --api-key or set ZOTERO_API_KEY.' );
	}
	// Fail-safe: if user-id is omitted, infer it from the API key.
	if ( auth.libraryType === 'users' && !auth.libraryId ) {
		const keyInfo = await fetchZoteroKeyInfo( auth );
		if ( !keyInfo.userID ) {
			throw new Error( 'Could not infer user-id from Zotero API key. Pass --user-id explicitly.' );
		}
		auth.userId = keyInfo.userID;
		auth.libraryId = keyInfo.userID;
	}
	requireZoteroLibrary( auth );
	saveZoteroAuth( {
		apiBase: auth.apiBase,
		userId: auth.userId,
		apiKey: auth.apiKey,
		libraryType: auth.libraryType,
		libraryId: auth.libraryId,
		savedAt: new Date().toISOString()
	} );
	if ( options.json ) {
		jsonOut( { ok: true, command: 'zotero', stage: 'login', auth: stripToSafeAuthView( auth ) } );
		return;
	}
	process.stdout.write( `zotero login saved (${ auth.libraryType }/${ auth.libraryId })\n` );
}

async function runZoteroWhoami( options ) {
	const auth = mergeZoteroAuth( options );
	const keyInfo = await fetchZoteroKeyInfo( auth );
	const output = {
		api_base: auth.apiBase,
		user_id: keyInfo.userID || null,
		username: keyInfo.username || null
	};
	if ( options.json ) {
		jsonOut( { ok: true, command: 'zotero', stage: 'whoami', ...output } );
		return output;
	}
	process.stdout.write( `${ JSON.stringify( output, null, 2 ) }\n` );
	return output;
}

async function runZoteroLogout( options ) {
	clearZoteroAuth();
	if ( options.json ) {
		jsonOut( { ok: true, command: 'zotero', stage: 'logout' } );
		return;
	}
	process.stdout.write( 'zotero login cleared\n' );
}

async function runZoteroQuery( query, options ) {
	const auth = mergeZoteroAuth( options );
	requireZoteroLibrary( auth );
	const q = String( query || '' ).trim();
	if ( !q ) {
		throw new Error( 'Missing query text for zotero query' );
	}
	const limit = Math.max( 1, Math.min( 100, Number.isFinite( options.limit ) ? options.limit : 20 ) );
	const { url, response, body } = await zoteroApiRequest(
		auth,
		`/${ auth.libraryType }/${ encodeURIComponent( auth.libraryId ) }/items`,
		{
			q,
			format: 'json',
			include: 'data',
			limit
		}
	);
	if ( response.statusCode < 200 || response.statusCode >= 300 ) {
		throw new Error( `Zotero query failed (${ response.statusCode }) at ${ url }` );
	}
	const rows = parseZoteroJsonArray( body, url ).map( ( item ) => ( {
		key: item && item.key,
		title: item && item.data && item.data.title,
		itemType: item && item.data && item.data.itemType,
		date: item && item.data && item.data.date,
		DOI: item && item.data && item.data.DOI
	} ) );
	if ( options.json ) {
		jsonOut( {
			ok: true,
			command: 'zotero',
			stage: 'query',
			query: q,
			count: rows.length,
			results: rows
		} );
		return rows;
	}
	process.stdout.write( `${ JSON.stringify( rows, null, 2 ) }\n` );
	return rows;
}

async function runZoteroDump( options ) {
	const auth = mergeZoteroAuth( options );
	requireZoteroLibrary( auth );
	const limit = Math.max( 1, Math.min( 100, Number.isFinite( options.limit ) ? options.limit : 50 ) );
	const { url, response, body } = await zoteroApiRequest(
		auth,
		`/${ auth.libraryType }/${ encodeURIComponent( auth.libraryId ) }/items`,
		{
			format: 'json',
			include: 'data',
			limit
		}
	);
	if ( response.statusCode < 200 || response.statusCode >= 300 ) {
		throw new Error( `Zotero dump failed (${ response.statusCode }) at ${ url }` );
	}
	const rows = parseZoteroJsonArray( body, url );
	if ( options.json ) {
		jsonOut( {
			ok: true,
			command: 'zotero',
			stage: 'dump',
			count: rows.length,
			items: rows
		} );
		return rows;
	}
	process.stdout.write( `${ JSON.stringify( rows, null, 2 ) }\n` );
	return rows;
}

async function runZoteroCite( reference, options ) {
	const auth = mergeZoteroAuth( options );
	requireZoteroLibrary( auth );
	const ref = parseZoteroItemReference( reference, auth );
	const useAuth = {
		...auth,
		libraryType: ref.libraryType,
		libraryId: ref.libraryId
	};
	const { url, response, body } = await zoteroApiRequest(
		useAuth,
		`/${ ref.libraryType }/${ encodeURIComponent( ref.libraryId ) }/items/${ encodeURIComponent( ref.itemKey ) }`,
		{
			format: 'bibtex'
		}
	);
	if ( response.statusCode === 403 ) {
		throw new Error( 'Zotero cite failed with 403. Check API key scope and library permissions.' );
	}
	if ( response.statusCode === 404 ) {
		throw new Error( `Zotero item not found: ${ ref.libraryType }/${ ref.libraryId }/${ ref.itemKey }` );
	}
	if ( response.statusCode < 200 || response.statusCode >= 300 ) {
		throw new Error( `Zotero cite failed (${ response.statusCode }) at ${ url }` );
	}
	if ( options.json ) {
		jsonOut( {
			ok: true,
			command: 'zotero',
			stage: 'cite',
			reference,
			library_type: ref.libraryType,
			library_id: ref.libraryId,
			item_key: ref.itemKey,
			bibtex: body
		} );
		return body;
	}
	process.stdout.write( body );
	if ( !body.endsWith( '\n' ) ) {
		process.stdout.write( '\n' );
	}
	return body;
}

function escapeHtml( text ) {
	return String( text )
		.replace( /&/g, '&amp;' )
		.replace( /</g, '&lt;' )
		.replace( />/g, '&gt;' )
		.replace( /"/g, '&quot;' )
		.replace( /'/g, '&#39;' );
}

function normalizeNoteContent( noteInput ) {
	let raw = String( noteInput || '' ).trim();
	if ( !raw ) {
		throw new Error( 'Note content cannot be empty' );
	}
	if ( raw.startsWith( '@' ) ) {
		const filePath = path.resolve( raw.slice( 1 ) );
		if ( !fileExists( filePath ) ) {
			throw new Error( `Note file not found: ${ filePath }` );
		}
		raw = fs.readFileSync( filePath, 'utf8' ).trim();
	}
	if ( !raw ) {
		throw new Error( 'Note content cannot be empty' );
	}
	const normalized = /<[^>]+>/.test( raw ) ?
		raw :
		`<p>${ escapeHtml( raw ).replace( /\r?\n/g, '<br/>' ) }</p>`;
	if ( normalized.length > 200000 ) {
		throw new Error( 'Note content is too large' );
	}
	if ( /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test( normalized ) ) {
		throw new Error( 'Note content contains unsupported control characters' );
	}
	return normalized;
}

function summarizeNote( html ) {
	return htmlToPlainText( String( html || '' ) ).slice( 0, 160 );
}

async function runZoteroAddPayload( payload, options ) {
	const auth = mergeZoteroAuth( options );
	requireZoteroLibrary( auth );
	if ( !auth.apiKey ) {
		throw new Error( 'zotero add requires API key with write permission' );
	}
	validateZoteroAddPayload( payload );
	const writeToken = crypto.randomBytes( 16 ).toString( 'hex' );
	const { url, response, body } = await zoteroApiWriteRequest(
		auth,
		'POST',
		`/${ auth.libraryType }/${ encodeURIComponent( auth.libraryId ) }/items`,
		[ payload ],
		{ 'Zotero-Write-Token': writeToken }
	);
	if ( response.statusCode === 412 ) {
		throw new Error( 'zotero add precondition failed (412). Retry and ensure library is up to date.' );
	}
	if ( response.statusCode < 200 || response.statusCode >= 300 ) {
		throw new Error( `zotero add failed (${ response.statusCode }) at ${ url }: ${ body.slice( 0, 300 ) }` );
	}
	let parsed = null;
	try {
		parsed = JSON.parse( body );
	} catch ( error ) {
	}
	if ( options.json ) {
		jsonOut( {
			ok: true,
			command: 'zotero',
			stage: 'add',
			status_code: response.statusCode,
			result: parsed || body
		} );
	}
	return parsed || body;
}

async function runZoteroAdd( payloadInput, options ) {
	const payload = parseJsonInputArg( payloadInput, 'add' );
	const result = await runZoteroAddPayload( payload, options );
	if ( options.json ) {
		return result;
	}
	const body = typeof result === 'string' ? result : JSON.stringify( result, null, 2 );
	process.stdout.write( `${ body || 'zotero add ok' }\n` );
	return result;
}

async function runZoteroDelete( reference, options ) {
	const auth = mergeZoteroAuth( options );
	requireZoteroLibrary( auth );
	if ( !auth.apiKey ) {
		throw new Error( 'zotero delete requires API key with write permission' );
	}
	const ref = parseZoteroItemReference( reference, auth );
	const useAuth = {
		...auth,
		libraryType: ref.libraryType,
		libraryId: ref.libraryId
	};
	const confirmed = await confirmDelete( ref, options );
	if ( !confirmed ) {
		if ( options.json ) {
			jsonOut( {
				ok: false,
				command: 'zotero',
				stage: 'delete',
				error: 'Delete cancelled by user'
			} );
			return;
		}
		process.stdout.write( 'delete cancelled\n' );
		return;
	}
	const currentVersion = await fetchZoteroItemVersion( useAuth, ref );
	if ( !currentVersion ) {
		throw new Error( 'Could not determine current item version for safe delete' );
	}
	const { url, response, body } = await zoteroApiWriteRequest(
		useAuth,
		'DELETE',
		`/${ ref.libraryType }/${ encodeURIComponent( ref.libraryId ) }/items/${ encodeURIComponent( ref.itemKey ) }`,
		undefined,
		{ 'If-Unmodified-Since-Version': currentVersion }
	);
	if ( response.statusCode === 412 ) {
		throw new Error( 'zotero delete rejected: item changed remotely (412)' );
	}
	if ( response.statusCode < 200 || response.statusCode >= 299 ) {
		throw new Error( `zotero delete failed (${ response.statusCode }) at ${ url }: ${ body.slice( 0, 300 ) }` );
	}
	if ( options.json ) {
		jsonOut( {
			ok: true,
			command: 'zotero',
			stage: 'delete',
			library_type: ref.libraryType,
			library_id: ref.libraryId,
			item_key: ref.itemKey
		} );
		return;
	}
	process.stdout.write( `deleted ${ ref.libraryType }/${ ref.libraryId }/${ ref.itemKey }\n` );
}

async function runZoteroUpdate( reference, payloadInput, options ) {
	const payload = parseJsonInputArg( payloadInput, 'update' );
	return runZoteroUpdatePayload( reference, payload, options );
}

async function runZoteroUpdatePayload( reference, payload, options ) {
	const auth = mergeZoteroAuth( options );
	requireZoteroLibrary( auth );
	if ( !auth.apiKey ) {
		throw new Error( 'zotero update requires API key with write permission' );
	}
	const ref = parseZoteroItemReference( reference, auth );
	const useAuth = {
		...auth,
		libraryType: ref.libraryType,
		libraryId: ref.libraryId
	};
	validateZoteroUpdatePayload( payload );
	const currentVersion = await fetchZoteroItemVersion( useAuth, ref );
	if ( !currentVersion ) {
		throw new Error( 'Could not determine current item version for safe update' );
	}
	const { url, response, body } = await zoteroApiWriteRequest(
		useAuth,
		'PATCH',
		`/${ ref.libraryType }/${ encodeURIComponent( ref.libraryId ) }/items/${ encodeURIComponent( ref.itemKey ) }`,
		payload,
		{ 'If-Unmodified-Since-Version': currentVersion }
	);
	if ( response.statusCode === 412 ) {
		throw new Error( 'zotero update rejected: item changed remotely (412)' );
	}
	if ( response.statusCode < 200 || response.statusCode >= 300 ) {
		throw new Error( `zotero update failed (${ response.statusCode }) at ${ url }: ${ body.slice( 0, 300 ) }` );
	}
	if ( options.json ) {
		jsonOut( {
			ok: true,
			command: 'zotero',
			stage: 'update',
			library_type: ref.libraryType,
			library_id: ref.libraryId,
			item_key: ref.itemKey
		} );
		return true;
	}
	process.stdout.write( `updated ${ ref.libraryType }/${ ref.libraryId }/${ ref.itemKey }\n` );
	return true;
}

async function runZoteroNoteAdd( parentReference, noteInput, options ) {
	const auth = mergeZoteroAuth( options );
	requireZoteroLibrary( auth );
	const parent = parseZoteroItemReference( parentReference, auth );
	const payload = {
		itemType: 'note',
		parentItem: parent.itemKey,
		note: normalizeNoteContent( noteInput )
	};
	const result = await runZoteroAddPayload( payload, {
		...options,
		json: false
	} );
	if ( options.json ) {
		jsonOut( {
			ok: true,
			command: 'zotero',
			stage: 'note-add',
			parent_item: parent.itemKey,
			result
		} );
		return result;
	}
	process.stdout.write( `note added under ${ parent.itemKey }\n` );
	return result;
}

async function runZoteroNoteList( parentReference, options ) {
	const auth = mergeZoteroAuth( options );
	requireZoteroLibrary( auth );
	const parent = parseZoteroItemReference( parentReference, auth );
	const useAuth = {
		...auth,
		libraryType: parent.libraryType,
		libraryId: parent.libraryId
	};
	const limit = Math.max( 1, Math.min( 100, Number.isFinite( options.limit ) ? options.limit : 20 ) );
	const { url, response, body } = await zoteroApiRequest(
		useAuth,
		`/${ parent.libraryType }/${ encodeURIComponent( parent.libraryId ) }/items/${ encodeURIComponent( parent.itemKey ) }/children`,
		{
			format: 'json',
			include: 'data',
			limit
		}
	);
	if ( response.statusCode < 200 || response.statusCode >= 300 ) {
		throw new Error( `zotero note list failed (${ response.statusCode }) at ${ url }` );
	}
	const rows = parseZoteroJsonArray( body, url )
		.filter( ( item ) => item && item.data && item.data.itemType === 'note' )
		.map( ( item ) => ( {
			key: item.key,
			parentItem: item.data.parentItem || parent.itemKey,
			preview: summarizeNote( item.data.note || '' ),
			dateModified: item.data.dateModified || ''
		} ) );
	if ( options.json ) {
		jsonOut( {
			ok: true,
			command: 'zotero',
			stage: 'note-list',
			parent_item: parent.itemKey,
			count: rows.length,
			notes: rows
		} );
		return rows;
	}
	process.stdout.write( `${ JSON.stringify( rows, null, 2 ) }\n` );
	return rows;
}

async function runZoteroNoteUpdate( noteReference, noteInput, options ) {
	const payload = {
		note: normalizeNoteContent( noteInput )
	};
	const done = await runZoteroUpdatePayload( noteReference, payload, {
		...options,
		json: false
	} );
	if ( options.json ) {
		jsonOut( {
			ok: true,
			command: 'zotero',
			stage: 'note-update',
			reference: noteReference
		} );
		return done;
	}
	return done;
}

async function runZoteroNoteDelete( noteReference, options ) {
	const done = await runZoteroDelete( noteReference, options );
	return done;
}

async function runZoteroNoteCommand( options ) {
	const action = String( options.args.shift() || '' ).trim().toLowerCase();
	if ( !action ) {
		usageZotero( 'note' );
		return;
	}
	if ( action === 'add' ) {
		const parentRef = String( options.args[ 0 ] || '' ).trim();
		const noteInput = options.args.slice( 1 ).join( ' ' ).trim();
		if ( !parentRef || !noteInput ) {
			throw new Error( 'zotero note add requires <parent-item-key|zotero-url> and <note>' );
		}
		await runZoteroNoteAdd( parentRef, noteInput, options );
		return;
	}
	if ( action === 'list' ) {
		const parentRef = String( options.args[ 0 ] || '' ).trim();
		if ( !parentRef ) {
			throw new Error( 'zotero note list requires <parent-item-key|zotero-url>' );
		}
		await runZoteroNoteList( parentRef, options );
		return;
	}
	if ( action === 'update' ) {
		const noteRef = String( options.args[ 0 ] || '' ).trim();
		const noteInput = options.args.slice( 1 ).join( ' ' ).trim();
		if ( !noteRef || !noteInput ) {
			throw new Error( 'zotero note update requires <note-key|zotero-url> and <note>' );
		}
		await runZoteroNoteUpdate( noteRef, noteInput, options );
		return;
	}
	if ( action === 'delete' ) {
		const noteRef = String( options.args[ 0 ] || '' ).trim();
		if ( !noteRef ) {
			throw new Error( 'zotero note delete requires <note-key|zotero-url>' );
		}
		await runZoteroNoteDelete( noteRef, options );
		return;
	}
	throw new Error( `Unsupported zotero note action: ${ action }` );
}

async function runZoteroCommand( subAction, options ) {
	const action = String( subAction || '' ).trim().toLowerCase();
	if ( action === 'login' ) {
		await runZoteroLogin( options );
		return;
	}
	if ( action === 'logout' ) {
		await runZoteroLogout( options );
		return;
	}
	if ( action === 'whoami' ) {
		await runZoteroWhoami( options );
		return;
	}
	if ( action === 'query' ) {
		const query = options.args.join( ' ' ).trim();
		await runZoteroQuery( query, options );
		return;
	}
	if ( action === 'dump' ) {
		await runZoteroDump( options );
		return;
	}
	if ( action === 'cite' ) {
		const reference = options.args.join( ' ' ).trim();
		if ( !reference ) {
			throw new Error( 'zotero cite requires <item-key|zotero-url>' );
		}
		await runZoteroCite( reference, options );
		return;
	}
	if ( action === 'add' ) {
		const payloadInput = options.args.join( ' ' ).trim();
		await runZoteroAdd( payloadInput, options );
		return;
	}
	if ( action === 'delete' ) {
		const reference = options.args.join( ' ' ).trim();
		if ( !reference ) {
			throw new Error( 'zotero delete requires <item-key|zotero-url>' );
		}
		await runZoteroDelete( reference, options );
		return;
	}
	if ( action === 'update' ) {
		const reference = String( options.args[ 0 ] || '' ).trim();
		const payloadInput = options.args.slice( 1 ).join( ' ' ).trim();
		if ( !reference || !payloadInput ) {
			throw new Error( 'zotero update requires <item-key|zotero-url> and <json-patch>' );
		}
		await runZoteroUpdate( reference, payloadInput, options );
		return;
	}
	if ( action === 'note' ) {
		await runZoteroNoteCommand( options );
		return;
	}
	throw new Error( `Unsupported zotero action: ${ action }` );
}

function isLikelyPdfUrl( raw ) {
	try {
		const parsed = new URL( String( raw || '' ).trim() );
		if ( parsed.protocol !== 'http:' && parsed.protocol !== 'https:' ) {
			return false;
		}
		return /\.pdf(?:$|[?#])/i.test( parsed.pathname + parsed.search + parsed.hash );
	} catch ( error ) {
		return false;
	}
}

function sanitizeFileName( raw ) {
	return raw
		.replace( /[^a-zA-Z0-9._-]+/g, '_' )
		.replace( /_+/g, '_' )
		.replace( /^_+|_+$/g, '' )
		.slice( 0, 120 ) || 'paper';
}

function defaultPdfOutputPath( identifier ) {
	const marker = sanitizeFileName( identifier.replace( /^https?:\/\//, '' ) );
	return path.resolve( `${ marker }.pdf` );
}

class HostRateLimiter {
	constructor( minIntervalMs ) {
		this.minIntervalMs = Math.max( 0, Number.isFinite( minIntervalMs ) ? minIntervalMs : 0 );
		this.lastRequestByHost = new Map();
	}

	async wait( host ) {
		if ( !host || this.minIntervalMs <= 0 ) {
			return;
		}
		const now = Date.now();
		const last = this.lastRequestByHost.get( host ) || 0;
		const waitMs = last + this.minIntervalMs - now;
		if ( waitMs > 0 ) {
			await sleep( waitMs );
		}
		this.lastRequestByHost.set( host, Date.now() );
	}
}

function requestExternal( urlString, limiter, options = {} ) {
	const timeoutMs = options.timeoutMs || defaultRequestTimeoutMs;
	const maxRedirects = options.maxRedirects || 8;
	const maxBodyBytes = options.maxBodyBytes > 0 ? options.maxBodyBytes : null;
	const requestBody = options.bodyBuffer ?
		options.bodyBuffer :
		( typeof options.bodyText === 'string' ? Buffer.from( options.bodyText, 'utf8' ) : null );

	return new Promise( ( resolve, reject ) => {
		const doRequest = async ( nextUrlString, redirectsLeft ) => {
			let parsed;
			try {
				parsed = new URL( nextUrlString );
			} catch ( error ) {
				reject( new Error( `Invalid URL: ${ nextUrlString }` ) );
				return;
			}

			try {
				await limiter.wait( parsed.host );
			} catch ( error ) {
				reject( error );
				return;
			}

			const transport = parsed.protocol === 'https:' ? https : http;
			const headers = {
				...( options.headers || {} )
			};
			if ( requestBody && !headers[ 'Content-Length' ] && !headers[ 'content-length' ] ) {
				headers[ 'Content-Length' ] = String( requestBody.length );
			}
			const req = transport.request( nextUrlString, {
				method: options.method || 'GET',
				headers
			}, ( res ) => {
				const status = res.statusCode || 0;
				const location = res.headers.location;
				if ( status >= 300 && status < 400 && location ) {
					if ( redirectsLeft <= 0 ) {
						reject( new Error( `Too many redirects for ${ urlString }` ) );
						return;
					}
					const target = new URL( location, nextUrlString ).toString();
					res.resume();
					doRequest( target, redirectsLeft - 1 );
					return;
				}

				const chunks = [];
				let keptBytes = 0;
				res.on( 'data', ( chunk ) => {
					if ( maxBodyBytes && keptBytes >= maxBodyBytes ) {
						return;
					}
					if ( maxBodyBytes && keptBytes + chunk.length > maxBodyBytes ) {
						const remain = maxBodyBytes - keptBytes;
						if ( remain > 0 ) {
							chunks.push( chunk.slice( 0, remain ) );
							keptBytes += remain;
						}
						return;
					}
					chunks.push( chunk );
					keptBytes += chunk.length;
				} );
				res.on( 'end', () => {
					resolve( {
						statusCode: status,
						headers: res.headers,
						bodyBuffer: Buffer.concat( chunks ),
						finalUrl: nextUrlString
					} );
				} );
			} );

			req.setTimeout( timeoutMs, () => {
				req.destroy( new Error( `request timeout after ${ timeoutMs }ms` ) );
			} );
			req.on( 'error', reject );
			if ( requestBody ) {
				req.write( requestBody );
			}
			req.end();
		};

		doRequest( urlString, maxRedirects );
	} );
}

function bodyToText( response ) {
	const contentType = String( response.headers[ 'content-type' ] || '' ).toLowerCase();
	const isUtf8 = /charset\s*=\s*utf-8/.test( contentType );
	return isUtf8 ? response.bodyBuffer.toString( 'utf8' ) : response.bodyBuffer.toString();
}

function isPdfResponse( response ) {
	const contentType = String( response.headers[ 'content-type' ] || '' ).toLowerCase();
	if ( contentType.includes( 'application/pdf' ) ) {
		return true;
	}
	return response.bodyBuffer.slice( 0, 5 ).toString() === '%PDF-';
}

function extractPdfLinksFromHtml( html, baseUrl ) {
	const links = [];
	const hrefRegex = /href\s*=\s*["']([^"']+)["']/ig;
	let match;
	while ( ( match = hrefRegex.exec( html ) ) ) {
		const href = match[ 1 ].trim();
		const lowerHref = href.toLowerCase();
		if ( !href || href.startsWith( '#' ) || lowerHref.startsWith( 'mailto:' ) ||
			lowerHref.startsWith( `javascript${ ':' }` ) ) {
			continue;
		}
		let resolved;
		try {
			resolved = new URL( href, baseUrl ).toString();
		} catch ( error ) {
			continue;
		}
		if ( /\.pdf(?:$|[?#])/i.test( resolved ) || /\/pdf(?:$|[/?#])/i.test( resolved ) ) {
			links.push( resolved );
		}
	}
	return uniqueKeepOrder( links );
}

function extractHttpLinksFromText( text ) {
	const matches = text.match( /https?:\/\/[^\s"'<>]+/g ) || [];
	return uniqueKeepOrder( matches.map( ( item ) => item.trim() ) );
}

function isUsefulResolverLink( link ) {
	const lower = link.toLowerCase();
	if ( /\.(?:png|jpg|jpeg|gif|svg|webp|css|js|woff2?|ttf|ico)(?:$|[?#])/.test( lower ) ) {
		return false;
	}
	if ( /(?:\/pdf(?:$|[/?#])|\.pdf(?:$|[?#]))/.test( lower ) ) {
		return true;
	}
	if ( /(?:fulltext|download|article|doi\.org|dx\.doi\.org|arxiv\.org\/(?:abs|pdf))/.test( lower ) ) {
		return true;
	}
	return false;
}

function filterUsefulResolverLinks( links ) {
	return uniqueKeepOrder( links.filter( isUsefulResolverLink ) );
}

function buildOpenUrlQueries( normalized ) {
	const common = {
		url_ver: 'Z39.88-2004',
		ctx_ver: 'Z39.88-2004',
		sid: 'botcite:fetch-pdf'
	};

	if ( normalized.type === 'doi' ) {
		return [ {
			...common,
			genre: 'article',
			'rft.doi': normalized.value,
			rft_id: `info:doi/${ normalized.value }`
		} ];
	}

	if ( normalized.type === 'arxiv' ) {
		const absUrl = `https://arxiv.org/abs/${ normalized.value }`;
		return [ {
			...common,
			genre: 'preprint',
			rft_id: absUrl
		}, {
			...common,
			genre: 'preprint',
			rft_id: `info:arxiv/${ normalized.value }`
		} ];
	}

	return [ {
		...common,
		rft_id: normalized.value
	} ];
}

function buildOpenUrlRequestUrl( openUrlBase, queryObj ) {
	const parsedBase = new URL( openUrlBase );
	const requestUrl = new URL( parsedBase.toString() );
	Object.entries( queryObj ).forEach( ( [ key, value ] ) => {
		if ( value !== undefined && value !== null && value !== '' ) {
			requestUrl.searchParams.set( key, String( value ) );
		}
	} );
	return requestUrl.toString();
}

async function fetchFullPdfResponse( urlString, limiter ) {
	const response = await requestExternal( urlString, limiter );
	if ( response.statusCode >= 200 &&
		response.statusCode < 300 &&
		isPdfResponse( response ) ) {
		return response;
	}
	throw new Error( `Failed to fetch full PDF: ${ urlString }` );
}

async function probeSingleCandidateForPdf( candidate, limiter ) {
	let res;
	try {
		res = await requestExternal( candidate, limiter, {
			maxBodyBytes: defaultProbeBodyBytes
		} );
	} catch ( error ) {
		return null;
	}
	if ( res.statusCode >= 200 && res.statusCode < 300 && isPdfResponse( res ) ) {
		const fullPdf = await fetchFullPdfResponse( res.finalUrl, limiter );
		return { pdfUrl: fullPdf.finalUrl, directResponse: fullPdf };
	}
	if ( res.statusCode < 200 || res.statusCode >= 300 ) {
		return null;
	}

	const html = bodyToText( res );
	const nested = extractPdfLinksFromHtml( html, res.finalUrl );
	for ( const nestedUrl of nested ) {
		try {
			const nestedRes = await requestExternal( nestedUrl, limiter );
			if ( nestedRes.statusCode >= 200 &&
				nestedRes.statusCode < 300 &&
				isPdfResponse( nestedRes ) ) {
				return { pdfUrl: nestedRes.finalUrl, directResponse: nestedRes };
			}
		} catch ( error ) {
		}
	}
	return null;
}

async function probeCandidatesForPdf( candidates, limiter, concurrency = defaultFetchConcurrency ) {
	const uniqueCandidates = uniqueKeepOrder( candidates );
	const limit = Math.max( 1, Math.min( concurrency || 1, uniqueCandidates.length ) );
	if ( !uniqueCandidates.length ) {
		return null;
	}

	let index = 0;
	let found = null;
	const worker = async () => {
		while ( !found && index < uniqueCandidates.length ) {
			const current = uniqueCandidates[ index ];
			index++;
			const result = await probeSingleCandidateForPdf( current, limiter );
			if ( result ) {
				found = result;
				return;
			}
		}
	};

	const workers = [];
	for ( let i = 0; i < limit; i++ ) {
		workers.push( worker() );
	}
	await Promise.all( workers );
	return found;
}

async function resolvePdfFromOpenUrl( normalized, limiter, openUrlBase ) {
	if ( !openUrlBase ) {
		throw new Error( 'OPENURL_BASE is not configured' );
	}
	const queryOptions = buildOpenUrlQueries( normalized );
	let allCandidates = [];

	for ( const queryObj of queryOptions ) {
		const requestUrl = buildOpenUrlRequestUrl( openUrlBase, queryObj );
		let response;
		try {
			response = await requestExternal( requestUrl, limiter, {
				maxBodyBytes: defaultProbeBodyBytes
			} );
		} catch ( error ) {
			continue;
		}

		if ( response.statusCode >= 200 &&
			response.statusCode < 300 &&
			isPdfResponse( response ) ) {
			const fullPdf = await fetchFullPdfResponse( response.finalUrl, limiter );
			return { pdfUrl: fullPdf.finalUrl, directResponse: fullPdf };
		}

		const text = bodyToText( response );
		const htmlLinks = extractPdfLinksFromHtml( text, response.finalUrl );
		const rawLinks = filterUsefulResolverLinks( extractHttpLinksFromText( text ) );
		allCandidates = allCandidates.concat( [
			response.finalUrl,
			...htmlLinks,
			...rawLinks
		] );
	}

	const resolved = await probeCandidatesForPdf( allCandidates, limiter );
	if ( resolved ) {
		return resolved;
	}
	throw new Error( 'OpenURL resolver did not yield a downloadable PDF' );
}

async function runOpenUrlResolve( identifier, options ) {
	const normalized = detectIdentifierType( identifier );
	const limiter = new HostRateLimiter( defaultPdfFetchIntervalMs );
	const openUrlBase = options.base || defaultOpenUrlBase;
	if ( !openUrlBase ) {
		throw new Error( 'Missing OpenURL base. Pass --base or set OPENURL_BASE.' );
	}
	const startedAt = Date.now();
	const cached = await readThroughCache(
		'openurl-resolve',
		{ normalized, openUrlBase },
		options.cacheTtlSec,
		async () => {
			const queryOptions = buildOpenUrlQueries( normalized );
			const outputs = [];
			for ( const queryObj of queryOptions ) {
				const requestUrl = buildOpenUrlRequestUrl( openUrlBase, queryObj );
				let response;
				try {
					response = await requestExternal( requestUrl, limiter, {
						maxBodyBytes: defaultProbeBodyBytes
					} );
				} catch ( error ) {
					outputs.push( {
						request_url: requestUrl,
						error: error.message
					} );
					continue;
				}

				const text = bodyToText( response );
				outputs.push( {
					request_url: requestUrl,
					final_url: response.finalUrl,
					status_code: response.statusCode,
					is_pdf: isPdfResponse( response ),
					candidate_links: filterUsefulResolverLinks( [
						...extractPdfLinksFromHtml( text, response.finalUrl ),
						...extractHttpLinksFromText( text )
					] ).slice( 0, 100 )
				} );
			}
			return outputs;
		}
	);

	const output = {
		identifier: normalized,
		openurl_base: openUrlBase,
		cache_hit: cached.cacheHit,
		elapsed_ms: Date.now() - startedAt,
		stage: 'done',
		results: cached.value
	};
	if ( options.json ) {
		jsonOut( {
			ok: true,
			command: 'openurl-resolve',
			...output
		} );
		return output;
	}
	if ( !options.silent ) {
		process.stdout.write( `${ JSON.stringify( output, null, 2 ) }\n` );
	}
	return output;
}

async function resolvePdfFromDoi( doi, limiter ) {
	const candidates = [];
	const doiUrl = `https://doi.org/${ encodeURIComponent( doi ) }`;
	candidates.push( doiUrl );

	const landing = await requestExternal( doiUrl, limiter, {
		headers: {
			Accept: 'text/html,application/xhtml+xml'
		},
		maxBodyBytes: defaultProbeBodyBytes
	} );

	if ( isPdfResponse( landing ) ) {
		const fullPdf = await fetchFullPdfResponse( landing.finalUrl, limiter );
		return { pdfUrl: fullPdf.finalUrl, directResponse: fullPdf };
	}

	if ( landing.statusCode >= 200 && landing.statusCode < 300 ) {
		const html = bodyToText( landing );
		const htmlCandidates = extractPdfLinksFromHtml( html, landing.finalUrl );
		candidates.push( ...htmlCandidates );
	}

	const email = process.env.UNPAYWALL_EMAIL || process.env.MAILTO;
	if ( email ) {
		const unpaywallUrl = `https://api.unpaywall.org/v2/${ encodeURIComponent( doi ) }?email=${ encodeURIComponent( email ) }`;
		try {
			const oaRes = await requestExternal( unpaywallUrl, limiter, {
				maxBodyBytes: defaultProbeBodyBytes
			} );
			if ( oaRes.statusCode >= 200 && oaRes.statusCode < 300 ) {
				const data = JSON.parse( bodyToText( oaRes ) );
				const urls = [
					data && data.best_oa_location && data.best_oa_location.url_for_pdf,
					data && data.best_oa_location && data.best_oa_location.url,
					...( Array.isArray( data.oa_locations ) ?
						data.oa_locations.map( ( x ) => x && ( x.url_for_pdf || x.url ) ) : [] )
				].filter( Boolean );
				candidates.push( ...urls );
			}
		} catch ( error ) {
		}
	}

	const resolved = await probeCandidatesForPdf( candidates, limiter );
	if ( resolved ) {
		return resolved;
	}

	throw new Error( `Could not find downloadable PDF for DOI: ${ doi }` );
}

async function resolvePdfFromArxiv( arxivId, limiter ) {
	const pdfUrl = `https://arxiv.org/pdf/${ encodeURIComponent( arxivId ) }.pdf`;
	const res = await requestExternal( pdfUrl, limiter );
	if ( res.statusCode >= 200 && res.statusCode < 300 && isPdfResponse( res ) ) {
		return { pdfUrl: res.finalUrl, directResponse: res };
	}
	throw new Error( `Could not fetch arXiv PDF for ${ arxivId }` );
}

async function resolvePdfFromUrl( urlString, limiter ) {
	const res = await requestExternal( urlString, limiter );
	if ( res.statusCode >= 200 && res.statusCode < 300 && isPdfResponse( res ) ) {
		return { pdfUrl: res.finalUrl, directResponse: res };
	}
	if ( res.statusCode >= 200 && res.statusCode < 300 ) {
		const html = bodyToText( res );
		const links = extractPdfLinksFromHtml( html, res.finalUrl );
		const resolved = await probeCandidatesForPdf( links, limiter );
		if ( resolved ) {
			return resolved;
		}
	}
	throw new Error( `Could not find PDF from URL: ${ urlString }` );
}

function ensurePdfOutputDir( outPath ) {
	const dir = path.dirname( outPath );
	if ( !fileExists( dir ) ) {
		fs.mkdirSync( dir, { recursive: true } );
	}
}

async function runFetchPdf( identifier, options ) {
	const normalized = detectIdentifierType( identifier );
	const limiter = new HostRateLimiter( defaultPdfFetchIntervalMs );
	const openUrlBase = options.base || defaultOpenUrlBase;
	const startedAt = Date.now();
	const outPath = path.resolve( options.out || defaultPdfOutputPath( identifier ) );
	ensurePdfOutputDir( outPath );
	const cachePayload = { normalized, openUrlBase };
	const cacheKey = makeCacheKey( 'fetch-pdf', cachePayload );
	const cachedMeta = getCachedValue( cacheKey );
	let cacheHit = false;
	let sourceUrl = '';

	if ( cachedMeta && cachedMeta.cacheFile && fileExists( cachedMeta.cacheFile ) ) {
		fs.copyFileSync( cachedMeta.cacheFile, outPath );
		cacheHit = true;
		sourceUrl = cachedMeta.sourceUrl || '';
	} else {
		let resolved;
		if ( normalized.type === 'doi' ) {
			try {
				resolved = await resolvePdfFromDoi( normalized.value, limiter );
			} catch ( error ) {
				if ( openUrlBase ) {
					resolved = await resolvePdfFromOpenUrl( normalized, limiter, openUrlBase );
				} else {
					throw error;
				}
			}
		} else if ( normalized.type === 'arxiv' ) {
			try {
				resolved = await resolvePdfFromArxiv( normalized.value, limiter );
			} catch ( error ) {
				if ( openUrlBase ) {
					resolved = await resolvePdfFromOpenUrl( normalized, limiter, openUrlBase );
				} else {
					throw error;
				}
			}
		} else {
			try {
				resolved = await resolvePdfFromUrl( normalized.value, limiter );
			} catch ( error ) {
				if ( openUrlBase ) {
					resolved = await resolvePdfFromOpenUrl( normalized, limiter, openUrlBase );
				} else {
					throw error;
				}
			}
		}

		const cachedFileName = `${ cacheKey }.pdf`;
		const cachedFilePath = path.join( pdfCacheDir, cachedFileName );
		fs.writeFileSync( cachedFilePath, resolved.directResponse.bodyBuffer );
		fs.copyFileSync( cachedFilePath, outPath );
		setCachedValue( cacheKey, {
			cacheFile: cachedFilePath,
			sourceUrl: resolved.pdfUrl || ''
		}, options.cacheTtlSec );
		sourceUrl = resolved.pdfUrl || '';
	}

	if ( options.json ) {
		jsonOut( {
			ok: true,
			command: 'fetch-pdf',
			stage: 'done',
			elapsed_ms: Date.now() - startedAt,
			cache_hit: cacheHit,
			identifier,
			out_path: outPath,
			source_url: sourceUrl
		} );
		return outPath;
	}
	if ( !options.silent ) {
		process.stdout.write( `${ outPath }\n` );
	}
	return outPath;
}

async function runCitationStyle( query, options ) {
	const stylePath = resolveStylePath( options.style );
	const localeCode = options.locale || 'en-US';
	const startedAt = Date.now();
	const cached = await readThroughCache(
		'cite-style',
		{ query, stylePath, localeCode, plain: options.plain },
		options.cacheTtlSec,
		async () => {
			const response = await withRunningServices( ( ctx ) => httpGet(
				`http://127.0.0.1:${ ctx.citoidPort }/zotero/${ encodeURIComponent( query ) }`
			) );
			const data = JSON.parse( response.body );
			if ( !Array.isArray( data ) || !data.length ) {
				throw new Error( 'No citation result for styled output' );
			}
			const cslItem = zoteroToCsl( data[ 0 ] );
			const renderedHtml = renderWithCsl( cslItem, stylePath, localeCode );
			return options.plain ? htmlToPlainText( renderedHtml ) : renderedHtml;
		}
	);
	const rendered = cached.value;
	if ( options.json ) {
		jsonOut( {
			ok: true,
			command: 'cite-style',
			stage: 'done',
			elapsed_ms: Date.now() - startedAt,
			cache_hit: cached.cacheHit,
			query,
			style: stylePath,
			locale: localeCode,
			plain: !!options.plain,
			output: rendered
		} );
		return rendered;
	}
	if ( !options.silent ) {
		process.stdout.write( rendered );
		if ( !rendered.endsWith( '\n' ) ) {
			process.stdout.write( '\n' );
		}
	}
	return rendered;
}

function readBatchLines( inputPath ) {
	if ( !inputPath ) {
		throw new Error( 'Missing --in for batch mode' );
	}
	const fullPath = path.resolve( inputPath );
	if ( !fileExists( fullPath ) ) {
		throw new Error( `Batch input not found: ${ fullPath }` );
	}
	return fs.readFileSync( fullPath, 'utf8' )
		.split( /\r?\n/ )
		.map( ( line ) => line.trim() )
		.filter( ( line ) => line && !line.startsWith( '#' ) );
}

function writeJsonl( rows, outputPath ) {
	const text = rows.map( ( row ) => JSON.stringify( row ) ).join( '\n' ) + ( rows.length ? '\n' : '' );
	if ( outputPath ) {
		const fullOut = path.resolve( outputPath );
		ensurePdfOutputDir( fullOut );
		fs.writeFileSync( fullOut, text );
		return fullOut;
	}
	process.stdout.write( text );
	return '';
}

async function mapWithConcurrency( items, concurrency, mapper ) {
	const list = Array.isArray( items ) ? items : [];
	const limit = Math.max( 1, Math.min( Number.isFinite( concurrency ) ? concurrency : 1, list.length || 1 ) );
	const results = new Array( list.length );
	let cursor = 0;

	const worker = async () => {
		while ( true ) {
			const index = cursor;
			cursor++;
			if ( index >= list.length ) {
				return;
			}
			results[ index ] = await mapper( list[ index ], index );
		}
	};

	const workers = [];
	for ( let i = 0; i < limit; i++ ) {
		workers.push( worker() );
	}
	await Promise.all( workers );
	return results;
}

function makeBatchRow( index, input, startedAt, output, error ) {
	if ( error ) {
		return {
			index,
			input,
			ok: false,
			elapsed_ms: Date.now() - startedAt,
			error: error.message
		};
	}
	return {
		index,
		input,
		ok: true,
		elapsed_ms: Date.now() - startedAt,
		output
	};
}

async function runBatch( options ) {
	const batchStartedAt = Date.now();
	const op = options.op || '';
	const lines = readBatchLines( options.in );
	const concurrency = Math.max( 1, Number.isFinite( options.concurrency ) ? options.concurrency : defaultBatchConcurrency );
	let rows = [];

	if ( op === 'cite' ) {
		const format = options.format || 'bibtex';
		rows = await withRunningServices( async ( ctx ) => mapWithConcurrency( lines, concurrency, async ( item, i ) => {
			const startedAt = Date.now();
			try {
				const normalized = normalizeCitationQuery( item );
				const cached = await readThroughCache(
					'cite-response',
					{ format, query: normalized.query },
					options.cacheTtlSec,
					async () => queryCitationWithContext( ctx, format, normalized.query )
				);
				return makeBatchRow( i, item, startedAt, {
					status_code: cached.value.statusCode,
					body: cached.value.body,
					cache_hit: cached.cacheHit,
					query_used: normalized.query,
					query_normalized: normalized.normalized
				} );
			} catch ( error ) {
				return makeBatchRow( i, item, startedAt, null, error );
			}
		} ) );
	} else if ( op === 'cite-style' ) {
		const stylePath = resolveStylePath( options.style );
		const localeCode = options.locale || 'en-US';
		rows = await withRunningServices( async ( ctx ) => mapWithConcurrency( lines, concurrency, async ( item, i ) => {
			const startedAt = Date.now();
			try {
				const cached = await readThroughCache(
					'cite-style',
					{ query: item, stylePath, localeCode, plain: options.plain },
					options.cacheTtlSec,
					async () => {
						const response = await httpGet(
							`http://127.0.0.1:${ ctx.citoidPort }/zotero/${ encodeURIComponent( item ) }`
						);
						const data = JSON.parse( response.body );
						if ( !Array.isArray( data ) || !data.length ) {
							throw new Error( 'No citation result for styled output' );
						}
						const cslItem = zoteroToCsl( data[ 0 ] );
						const renderedHtml = renderWithCsl( cslItem, stylePath, localeCode );
						return options.plain ? htmlToPlainText( renderedHtml ) : renderedHtml;
					}
				);
				return makeBatchRow( i, item, startedAt, {
					output: cached.value,
					cache_hit: cached.cacheHit
				} );
			} catch ( error ) {
				return makeBatchRow( i, item, startedAt, null, error );
			}
		} ) );
	} else if ( op === 'fetch-pdf' || op === 'openurl-resolve' ) {
		rows = await mapWithConcurrency( lines, concurrency, async ( item, i ) => {
			const startedAt = Date.now();
			try {
				let output;
				if ( op === 'fetch-pdf' ) {
					const outPath = await runFetchPdf( item, {
						...options,
						json: false,
						silent: true,
						out: ''
					} );
					output = { out_path: outPath };
				} else {
					output = await runOpenUrlResolve( item, {
						...options,
						json: false,
						silent: true
					} );
				}
				return makeBatchRow( i, item, startedAt, output );
			} catch ( error ) {
				return makeBatchRow( i, item, startedAt, null, error );
			}
		} );
	} else {
		throw new Error( `Unsupported --op: ${ op }` );
	}

	const outFile = writeJsonl( rows, options.outJsonl );
	profileLog( options, 'batch', batchStartedAt, `op=${ op } count=${ rows.length } concurrency=${ concurrency }` );
	if ( options.json ) {
		jsonOut( {
			ok: true,
			command: 'batch',
			stage: 'done',
			op,
			count: rows.length,
			ok_count: rows.filter( ( row ) => row.ok ).length,
			fail_count: rows.filter( ( row ) => !row.ok ).length,
			out_jsonl: outFile || null
		} );
	} else if ( outFile ) {
		process.stdout.write( `${ outFile }\n` );
	}
}

function handleCommandError( error, options, command, stage ) {
	if ( options && options.json ) {
		jsonOut( {
			ok: false,
			command,
			stage: stage || 'failed',
			error: error.message
		} );
	} else {
		console.error( error.message );
	}
	process.exit( 1 );
}

function writeMcpMessage( payload ) {
	const body = Buffer.from( JSON.stringify( payload ), 'utf8' );
	const header = Buffer.from( `Content-Length: ${ body.length }\r\n\r\n`, 'utf8' );
	process.stdout.write( Buffer.concat( [ header, body ] ) );
}

function makeMcpTools() {
	return [
		{
			name: 'cite',
			description: 'Generate citation in target format from DOI/URL/title',
			inputSchema: {
				type: 'object',
				properties: {
					format: { type: 'string' },
					query: { type: 'string' }
				},
				required: [ 'format', 'query' ]
			}
		},
		{
			name: 'cite_pdf',
			description: 'Generate bibtex citation from a local PDF path',
			inputSchema: {
				type: 'object',
				properties: {
					pdf_path: { type: 'string' }
				},
				required: [ 'pdf_path' ]
			}
		},
		{
			name: 'fetch_pdf',
			description: 'Resolve and download PDF from DOI/arXiv/URL',
			inputSchema: {
				type: 'object',
				properties: {
					identifier: { type: 'string' },
					out: { type: 'string' },
					base: { type: 'string' }
				},
				required: [ 'identifier' ]
			}
		},
		{
			name: 'openurl_resolve',
			description: 'Run OpenURL resolver diagnostics for an identifier',
			inputSchema: {
				type: 'object',
				properties: {
					identifier: { type: 'string' },
					base: { type: 'string' }
				},
				required: [ 'identifier' ]
			}
		}
	];
}

async function callMcpTool( name, args ) {
	const options = { json: false, silent: true, headers: false };
	if ( name === 'cite' ) {
		const format = String( args && args.format || '' ).trim();
		const query = String( args && args.query || '' ).trim();
		if ( !format || !query ) {
			throw new Error( 'cite requires format and query' );
		}
		const response = await runCitation( format, query, options );
		return response.body || '';
	}
	if ( name === 'cite_pdf' ) {
		const pdfPath = String( args && args.pdf_path || '' ).trim();
		if ( !pdfPath ) {
			throw new Error( 'cite_pdf requires pdf_path' );
		}
		const response = await runCitationFromPdf( pdfPath, options );
		return response.body || '';
	}
	if ( name === 'fetch_pdf' ) {
		const identifier = String( args && args.identifier || '' ).trim();
		if ( !identifier ) {
			throw new Error( 'fetch_pdf requires identifier' );
		}
		const outPath = await runFetchPdf( identifier, {
			...options,
			out: args && args.out ? String( args.out ) : '',
			base: args && args.base ? String( args.base ) : ''
		} );
		return outPath;
	}
	if ( name === 'openurl_resolve' ) {
		const identifier = String( args && args.identifier || '' ).trim();
		if ( !identifier ) {
			throw new Error( 'openurl_resolve requires identifier' );
		}
		const output = await runOpenUrlResolve( identifier, {
			...options,
			base: args && args.base ? String( args.base ) : ''
		} );
		return JSON.stringify( output, null, 2 );
	}
	throw new Error( `unknown tool: ${ name }` );
}

function serveMcp() {
	const tools = makeMcpTools();
	let buffer = Buffer.alloc( 0 );

	const handleMessage = async ( msg ) => {
		if ( !msg || typeof msg !== 'object' || !msg.method ) {
			return;
		}

		if ( msg.method === 'notifications/initialized' ) {
			return;
		}

		const id = msg.id;
		if ( msg.method === 'initialize' ) {
			writeMcpMessage( {
				jsonrpc: '2.0',
				id,
				result: {
					protocolVersion: '2024-11-05',
					serverInfo: { name: 'botcite', version: '2.0.0' },
					capabilities: { tools: {} }
				}
			} );
			return;
		}
		if ( msg.method === 'ping' ) {
			writeMcpMessage( { jsonrpc: '2.0', id, result: {} } );
			return;
		}
		if ( msg.method === 'tools/list' ) {
			writeMcpMessage( { jsonrpc: '2.0', id, result: { tools } } );
			return;
		}
		if ( msg.method === 'tools/call' ) {
			try {
				const toolName = msg.params && msg.params.name;
				const toolArgs = msg.params && msg.params.arguments || {};
				const text = await callMcpTool( toolName, toolArgs );
				writeMcpMessage( {
					jsonrpc: '2.0',
					id,
					result: {
						content: [ { type: 'text', text } ],
						isError: false
					}
				} );
			} catch ( error ) {
				writeMcpMessage( {
					jsonrpc: '2.0',
					id,
					result: {
						content: [ { type: 'text', text: error.message } ],
						isError: true
					}
				} );
			}
			return;
		}

		if ( id !== undefined ) {
			writeMcpMessage( {
				jsonrpc: '2.0',
				id,
				error: { code: -32601, message: `Method not found: ${ msg.method }` }
			} );
		}
	};

	process.stdin.on( 'data', ( chunk ) => {
		buffer = Buffer.concat( [ buffer, chunk ] );
		while ( true ) {
			const headerEnd = buffer.indexOf( '\r\n\r\n' );
			if ( headerEnd < 0 ) {
				return;
			}
			const headerText = buffer.slice( 0, headerEnd ).toString( 'utf8' );
			const lengthMatch = headerText.match( /Content-Length:\s*(\d+)/i );
			if ( !lengthMatch ) {
				buffer = buffer.slice( headerEnd + 4 );
				continue;
			}
			const contentLength = parseInt( lengthMatch[ 1 ], 10 );
			const frameTotal = headerEnd + 4 + contentLength;
			if ( buffer.length < frameTotal ) {
				return;
			}
			const body = buffer.slice( headerEnd + 4, frameTotal ).toString( 'utf8' );
			buffer = buffer.slice( frameTotal );
			try {
				const msg = JSON.parse( body );
				Promise.resolve( handleMessage( msg ) ).catch( () => {} );
			} catch ( error ) {
			}
		}
	} );
	process.stdin.resume();
}

const action = process.argv[ 2 ];

if ( action === 'mcp' ) {
	serveMcp();
	return;
}

if ( action === 'setup' ) {
	try {
		bootstrapLocalEnvironment();
		process.stdout.write( 'local runtime ready\n' );
		process.exit( 0 );
	} catch ( error ) {
		console.error( error.message );
		process.exit( 1 );
	}
}

if ( action === 'styles' ) {
	const parsed = parseOptions( process.argv.slice( 3 ) );
	const subAction = parsed.args[ 0 ];
	if ( subAction !== 'sync' ) {
		usage();
		process.exit( 1 );
	}
	syncStyles( parsed ).catch( ( error ) => {
		handleCommandError( error, parsed, 'styles', 'sync' );
	} );
	return;
}

if ( action === 'api' ) {
	const parsed = parseOptions( process.argv.slice( 3 ) );
	const requestPath = parsed.args.join( ' ' ).trim();

	if ( !requestPath ) {
		usage();
		process.exit( 1 );
	}

	runApiPath( requestPath, parsed ).catch( ( error ) => {
		handleCommandError( error, parsed, 'api' );
	} );
	return;
}

if ( action === 'cite' ) {
	const parsed = parseOptions( process.argv.slice( 3 ) );
	const format = parsed.args[ 0 ];
	const query = parsed.args.slice( 1 ).join( ' ' ).trim();

	if ( !format || !query ) {
		usage();
		process.exit( 1 );
	}

	runCitation( format, query, parsed ).catch( ( error ) => {
		handleCommandError( error, parsed, 'cite' );
	} );
	return;
}

if ( action === 'cite-pdf' ) {
	const parsed = parseOptions( process.argv.slice( 3 ) );
	const pdfPath = parsed.args.join( ' ' ).trim();

	if ( !pdfPath ) {
		usage();
		process.exit( 1 );
	}

	runCitationFromPdf( pdfPath, parsed ).catch( ( error ) => {
		handleCommandError( error, parsed, 'cite-pdf' );
	} );
	return;
}

if ( action === 'cite-style' ) {
	const parsed = parseOptions( process.argv.slice( 3 ) );
	const query = parsed.args.join( ' ' ).trim();
	if ( !query ) {
		usage();
		process.exit( 1 );
	}
	runCitationStyle( query, parsed ).catch( ( error ) => {
		handleCommandError( error, parsed, 'cite-style' );
	} );
	return;
}

if ( action === 'fetch-pdf' ) {
	const parsed = parseOptions( process.argv.slice( 3 ) );
	const identifier = parsed.args.join( ' ' ).trim();
	if ( !identifier ) {
		usage();
		process.exit( 1 );
	}
	runFetchPdf( identifier, parsed ).catch( ( error ) => {
		handleCommandError( error, parsed, 'fetch-pdf' );
	} );
	return;
}

if ( action === 'openurl-resolve' ) {
	const parsed = parseOptions( process.argv.slice( 3 ) );
	const identifier = parsed.args.join( ' ' ).trim();
	if ( !identifier ) {
		usage();
		process.exit( 1 );
	}
	runOpenUrlResolve( identifier, parsed ).catch( ( error ) => {
		handleCommandError( error, parsed, 'openurl-resolve' );
	} );
	return;
}

if ( action === 'zotero' ) {
	const rawArgs = process.argv.slice( 3 );
	if ( rawArgs.length === 0 ||
		rawArgs[ 0 ] === '--help' ||
		rawArgs[ 0 ] === '-h' ||
		rawArgs[ 0 ] === 'help' ) {
		usageZotero();
		process.exit( 0 );
	}
	const subAction = String( rawArgs[ 0 ] || '' ).trim();
	const parsed = parseOptions( rawArgs.slice( 1 ) );
	if ( parsed.args.includes( '--help' ) || parsed.args.includes( '-h' ) ) {
		usageZotero( subAction );
		process.exit( 0 );
	}
	runZoteroCommand( subAction, parsed ).catch( ( error ) => {
		handleCommandError( error, parsed, 'zotero', subAction );
	} );
	return;
}

if ( action === 'batch' ) {
	const parsed = parseOptions( process.argv.slice( 3 ) );
	if ( !parsed.op || !parsed.in ) {
		usage();
		process.exit( 1 );
	}
	runBatch( parsed ).catch( ( error ) => {
		handleCommandError( error, parsed, 'batch' );
	} );
	return;
}

if ( action === 'info' ) {
	const parsed = parseOptions( process.argv.slice( 3 ) );
	runApiPath( '/_info', parsed ).catch( ( error ) => {
		handleCommandError( error, parsed, 'info' );
	} );
	return;
}

if ( action === 'spec' ) {
	const parsed = parseOptions( process.argv.slice( 3 ) );
	runApiPath( '/?spec', parsed ).catch( ( error ) => {
		handleCommandError( error, parsed, 'spec' );
	} );
	return;
}

usage();
process.exit( 1 );
