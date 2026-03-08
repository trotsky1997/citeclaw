'use strict';

const assert = require( '../../utils/assert.js' );
const OpenAlexService = require( '../../../lib/external-apis/OpenAlexService.js' );

describe( 'lib/external-apis/OpenAlexService.js', () => {

	it( 'maps a work payload to zotero-compatible citation content', () => {
		const service = new OpenAlexService( {
			conf: {
				openAlex: {
					enabled: true
				}
			}
		} );

		const result = service.toCitation( {
			id: 'https://openalex.org/W123',
			display_name: 'Attention is All you Need',
			doi: 'https://doi.org/10.5555/3295222.3295349',
			type: 'proceedings-article',
			publication_date: '2017-06-12',
			abstract_inverted_index: {
				Transformer: [ 0 ],
				paper: [ 1 ]
			},
			biblio: {
				volume: '30',
				issue: '1',
				first_page: '6000',
				last_page: '6010'
			},
			primary_location: {
				landing_page_url: 'https://doi.org/10.5555/3295222.3295349',
				source: {
					display_name: 'Neural Information Processing Systems'
				}
			},
			authorships: [
				{
					author: {
						display_name: 'Ashish Vaswani'
					}
				}
			],
			ids: {
				pmid: 'https://pubmed.ncbi.nlm.nih.gov/12345678/'
			}
		}, 'https://doi.org/10.5555/3295222.3295349' );

		assert.deepEqual( result.itemType, 'conferencePaper' );
		assert.deepEqual( result.title, 'Attention is All you Need' );
		assert.deepEqual( result.DOI, '10.5555/3295222.3295349' );
		assert.deepEqual( result.publicationTitle, 'Neural Information Processing Systems' );
		assert.deepEqual( result.abstractNote, 'Transformer paper' );
		assert.deepEqual( result.pages, '6000–6010' );
		assert.deepEqual( result.creators[ 0 ].firstName, 'Ashish' );
		assert.deepEqual( result.creators[ 0 ].lastName, 'Vaswani' );
		assert.match( result.extra, /PMID: 12345678/ );
	} );

	it( 'looks up a work by identifier', () => {
		const service = new OpenAlexService( {
			conf: {
				openAlex: {
					enabled: true,
					apiKey: 'test-key'
				}
			}
		} );
		let capturedOptions;
		const request = {
			logger: {
				log() {
				}
			},
			issueRequest( options ) {
				capturedOptions = options;
				return Promise.resolve( {
					status: 200,
					body: {
						id: 'https://openalex.org/W123',
						display_name: 'Example work'
					}
				} );
			}
		};

		return service.getWork( 'pmid:12345678', request ).then( ( work ) => {
			assert.deepEqual( work.id, 'https://openalex.org/W123' );
			assert.match( capturedOptions.uri, /\/works\/pmid%3A12345678$/ );
			assert.deepEqual( capturedOptions.qs.api_key, 'test-key' );
		} );
	} );

	it( 'searches works and limits the result count', () => {
		const service = new OpenAlexService( {
			conf: {
				openAlex: {
					enabled: true,
					searchLimit: 2
				}
			}
		} );
		const request = {
			logger: {
				log() {
				}
			},
			issueRequest() {
				return Promise.resolve( {
					status: 200,
					body: {
						results: [
							{ id: 'https://openalex.org/W1' },
							{ id: 'https://openalex.org/W2' },
							{ id: 'https://openalex.org/W3' }
						]
					}
				} );
			}
		};

		return service.searchWorks( 'transformer attention', request ).then( ( works ) => {
			assert.deepEqual( works.length, 2 );
			assert.deepEqual( works[ 0 ].id, 'https://openalex.org/W1' );
			assert.deepEqual( works[ 1 ].id, 'https://openalex.org/W2' );
		} );
	} );

} );
