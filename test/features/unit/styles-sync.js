'use strict';

const fs = require( 'fs' );
const os = require( 'os' );
const path = require( 'path' );

const assert = require( '../../utils/assert.js' );

function clearCliModules() {
	delete require.cache[ require.resolve( '../../../scripts/citeclaw.js' ) ];
	delete require.cache[ require.resolve( '../../../scripts/botcite.js' ) ];
}

describe( 'styles sync helpers', () => {
	let tempPaths = [];
	let originalLocalStylesDir;

	beforeEach( () => {
		tempPaths = [];
		originalLocalStylesDir = process.env.LOCAL_STYLES_DIR;
	} );

	afterEach( () => {
		if ( originalLocalStylesDir === undefined ) {
			delete process.env.LOCAL_STYLES_DIR;
		} else {
			process.env.LOCAL_STYLES_DIR = originalLocalStylesDir;
		}
		clearCliModules();
		tempPaths.forEach( ( tempPath ) => {
			fs.rmSync( tempPath, { recursive: true, force: true } );
		} );
	} );

	it( 'falls back to the next locale mirror when the first download fails', () => {
		const tempDir = fs.mkdtempSync( path.join( os.tmpdir(), 'citeclaw-download-' ) );
		const dest = path.join( tempDir, 'locales-en-US.xml' );
		let attempts = 0;

		tempPaths.push( tempDir );
		clearCliModules();
		const { downloadFileWithCurlFallbacks } = require( '../../../scripts/citeclaw.js' );

		downloadFileWithCurlFallbacks(
			[ 'https://bad.example/locales-en-US.xml', 'https://good.example/locales-en-US.xml' ],
			dest,
			'locale en-US',
			( command, args ) => {
				attempts++;
				assert.strictEqual( command, 'curl' );
				assert.isInArray( args, '--retry-all-errors' );
				if ( attempts === 1 ) {
					throw new Error( 'curl: (22) The requested URL returned error: 503' );
				}
				fs.writeFileSync( args[ args.length - 1 ], '<locale>ok</locale>' );
			}
		);

		assert.strictEqual( attempts, 2 );
		assert.strictEqual( fs.readFileSync( dest, 'utf8' ), '<locale>ok</locale>' );
	} );

	it( 'syncs styles with an injected locale downloader', () => {
		const sourceDir = fs.mkdtempSync( path.join( os.tmpdir(), 'citeclaw-style-source-' ) );
		const stylesRoot = fs.mkdtempSync( path.join( os.tmpdir(), 'citeclaw-style-runtime-' ) );
		const nestedDir = path.join( sourceDir, 'nested' );
		const downloadedLocales = [];

		tempPaths.push( sourceDir, stylesRoot );
		fs.mkdirSync( nestedDir, { recursive: true } );
		fs.writeFileSync( path.join( nestedDir, 'example-style.csl' ), '<style />' );
		process.env.LOCAL_STYLES_DIR = stylesRoot;
		clearCliModules();
		const { syncStyles } = require( '../../../scripts/citeclaw.js' );

		syncStyles(
			{ repo: sourceDir },
			{
				downloadFile: ( urls, dest, label ) => {
					downloadedLocales.push( { urls, dest, label } );
					fs.writeFileSync( dest, `<locale id="${ label }" />` );
				}
			}
		);

		assert.strictEqual( downloadedLocales.length, 2 );
		assert.strictEqual( fs.existsSync( path.join( stylesRoot, 'csl', 'example-style.csl' ) ), true );
		assert.strictEqual( fs.existsSync( path.join( stylesRoot, 'locales', 'locales-en-US.xml' ) ), true );
		assert.strictEqual( fs.existsSync( path.join( stylesRoot, 'locales', 'locales-zh-CN.xml' ) ), true );
		assert.match( downloadedLocales[ 0 ].urls[ 0 ], /raw\.githubusercontent\.com/ );
	} );
} );
