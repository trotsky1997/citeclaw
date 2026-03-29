'use strict';

const assert = require( '../../utils/assert.js' );
const {
	detectPdfIdentifierCandidates,
	extractBestDoiCandidate,
	normalizeCommandForSpawn,
	normalizeDoi,
	shouldAttemptPdfOcr
} = require( '../../../scripts/citeclaw.js' );

describe( 'scripts/citeclaw.js', () => {

	describe( 'normalizeDoi()', () => {

		it( 'strips DOI prefixes and trailing punctuation', () => {
			assert.strictEqual(
				normalizeDoi( 'https://doi.org/10.1021/acsomega.2c05310).' ),
				'10.1021/acsomega.2c05310'
			);
		} );

	} );

	describe( 'normalizeCommandForSpawn()', () => {

		it( 'keeps commands unchanged on non-Windows platforms', () => {
			assert.strictEqual( normalizeCommandForSpawn( 'npm', 'linux' ), 'npm' );
			assert.strictEqual( normalizeCommandForSpawn( 'git', 'darwin' ), 'git' );
		} );

		it( 'maps common CLI tools to Windows executables', () => {
			assert.strictEqual( normalizeCommandForSpawn( 'npm', 'win32' ), 'npm.cmd' );
			assert.strictEqual( normalizeCommandForSpawn( 'git', 'win32' ), 'git.exe' );
			assert.strictEqual( normalizeCommandForSpawn( 'curl', 'win32' ), 'curl.exe' );
		} );

		it( 'does not rewrite explicit paths or extensions', () => {
			assert.strictEqual( normalizeCommandForSpawn( 'C:\\tools\\npm.cmd', 'win32' ), 'C:\\tools\\npm.cmd' );
			assert.strictEqual( normalizeCommandForSpawn( 'bun.exe', 'win32' ), 'bun.exe' );
		} );

	} );

	describe( 'normalizeArxivId()', () => {

		it( 'keeps explicit arXiv versions for abs urls', () => {
			assert.strictEqual(
				require( '../../../scripts/citeclaw.js' ).normalizeArxivId( 'https://arxiv.org/abs/2510.14901v1' ),
				'2510.14901v1'
			);
		} );

		it( 'normalizes html arXiv urls without dropping explicit versions', () => {
			assert.strictEqual(
				require( '../../../scripts/citeclaw.js' ).normalizeArxivId( 'https://arxiv.org/html/2510.14901v1' ),
				'2510.14901v1'
			);
		} );

		it( 'normalizes pdf arXiv urls without dropping explicit versions', () => {
			assert.strictEqual(
				require( '../../../scripts/citeclaw.js' ).normalizeArxivId( 'https://arxiv.org/pdf/2510.14901v1.pdf' ),
				'2510.14901v1'
			);
		} );

	} );

	describe( 'extractBestDoiCandidate()', () => {

		it( 'prefers the front-matter DOI over reference list DOIs', () => {
			const text = [
				'Real Money, Fake Models: Deceptive Model Claims in Shadow APIs',
				'DOI: 10.48550/arXiv.2603.01919',
				'',
				'Abstract',
				'This paper studies deceptive model claims.',
				'',
				'References',
				'[1] Example Prior Work. doi:10.1145/1234567.8901234',
				'[2] Another Citation (2024). https://doi.org/10.9999/example.2024.55'
			].join( '\n' );

			assert.strictEqual(
				extractBestDoiCandidate( text ),
				'10.48550/arXiv.2603.01919'
			);
		} );

		it( 'keeps DOI characters that appear in legacy DOI suffixes', () => {
			const text = 'doi:10.1002/1096-8628(20000612)96:3<302::aid-ajmg13>3.0.co;2-i';

			assert.strictEqual(
				extractBestDoiCandidate( text ),
				'10.1002/1096-8628(20000612)96:3<302::aid-ajmg13>3.0.co;2-i'
			);
		} );

	} );

	describe( 'detectPdfIdentifierCandidates()', () => {

		it( 'falls back to title extraction when DOI is absent', () => {
			const result = detectPdfIdentifierCandidates(
				'Real Money, Fake Models: Deceptive Model Claims in Shadow APIs\nAbstract\nBody text.',
				''
			);

			assert.strictEqual( result.type, 'title' );
			assert.strictEqual( result.value, 'Real Money, Fake Models: Deceptive Model Claims in Shadow APIs' );
			assert.strictEqual( result.extraction_source, 'text' );
		} );

	} );

	describe( 'shouldAttemptPdfOcr()', () => {

		it( 'only enables OCR when both text layer and metadata title are empty', () => {
			assert.strictEqual( shouldAttemptPdfOcr( '', '' ), true );
			assert.strictEqual( shouldAttemptPdfOcr( 'some extracted text', '' ), false );
			assert.strictEqual( shouldAttemptPdfOcr( '', 'Metadata Title' ), false );
		} );

	} );

} );
