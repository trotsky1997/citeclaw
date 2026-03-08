'use strict';

const BBPromise = require( 'bluebird' );

const { validateZotero } = require( '../Exporter.js' );
const cRef = require( '../translators/crossRef.js' );

class OpenAlexService {

	constructor( app ) {
		const conf = app.conf.openAlex || {};
		this.api = conf.api || 'https://api.openalex.org';
		this.apiKey = conf.apiKey || null;
		this.enabled = !!conf.enabled;
		this.searchLimit = Number.isFinite( conf.searchLimit ) ? conf.searchLimit : 2;
		this.requestTimeout = Number.isFinite( conf.timeout ) ? conf.timeout : 5000;
	}

	issueRequest( request, options ) {
		const qs = Object.assign( {}, options.qs );
		if ( this.apiKey ) {
			qs.api_key = this.apiKey;
		}

		return request.issueRequest( {
			uri: `${ this.api }${ options.path }`,
			qs,
			timeout: this.requestTimeout
		} );
	}

	getWork( identifier, request ) {
		if ( !identifier ) {
			return BBPromise.reject( 'No OpenAlex identifier provided' );
		}

		request.logger.log( 'debug/other', `Making request to OpenAlex for work ${ identifier }` );

		return this.issueRequest( request, {
			path: `/works/${ encodeURIComponent( identifier ) }`
		} ).then( ( response ) => {
			if ( response && response.status === 200 && response.body && response.body.id ) {
				return response.body;
			}
			return BBPromise.reject( `No OpenAlex work found for ${ identifier }` );
		} );
	}

	searchWorks( query, request ) {
		if ( !query ) {
			return BBPromise.reject( 'No OpenAlex search query provided' );
		}

		request.logger.log( 'debug/other', `Making request to OpenAlex search for ${ query }` );

		return this.issueRequest( request, {
			path: '/works',
			qs: {
				search: query,
				'per-page': this.searchLimit
			}
		} ).then( ( response ) => {
			if ( response && response.status === 200 && response.body &&
				Array.isArray( response.body.results ) && response.body.results.length ) {
				return response.body.results.slice( 0, this.searchLimit );
			}
			return BBPromise.reject( `No OpenAlex results found for ${ query }` );
		} );
	}

	toCitation( work, originalQuery ) {
		if ( !work || !work.id || !work.display_name ) {
			throw new Error( 'Invalid OpenAlex work payload' );
		}

		const doiUrl = work.doi || work.ids && work.ids.doi || null;
		const doi = this.normalizeDoi( doiUrl );
		const citation = {
			itemType: this.resolveItemType( work ),
			title: work.display_name,
			url: this.resolveUrl( work, originalQuery ),
			libraryCatalog: 'OpenAlex',
			accessDate: ( new Date() ).toISOString().slice( 0, 10 )
		};
		const abstract = this.restoreAbstract( work.abstract_inverted_index );
		const source = work.primary_location && work.primary_location.source;
		const biblio = work.biblio || {};
		const pages = this.buildPages( biblio.first_page, biblio.last_page );
		const extra = this.buildExtra( work );

		if ( doi ) {
			citation.DOI = doi;
		}
		if ( abstract ) {
			citation.abstractNote = abstract;
		}
		if ( work.publication_date ) {
			citation.date = work.publication_date;
		} else if ( work.publication_year ) {
			citation.date = String( work.publication_year );
		}
		if ( source && source.display_name ) {
			citation.publicationTitle = source.display_name;
		}
		if ( biblio.volume ) {
			citation.volume = String( biblio.volume );
		}
		if ( biblio.issue ) {
			citation.issue = String( biblio.issue );
		}
		if ( pages ) {
			citation.pages = pages;
		}
		if ( Array.isArray( work.authorships ) && work.authorships.length ) {
			citation.creators = work.authorships
				.map( ( authorship ) => this.authorToCreator( authorship ) )
				.filter( Boolean );
		}
		if ( extra ) {
			citation.extra = extra;
		}

		return validateZotero( null, citation );
	}

	resolveItemType( work ) {
		if ( work.type_crossref && cRef.types[ work.type_crossref ] ) {
			return cRef.types[ work.type_crossref ];
		}

		const mapping = {
			article: 'journalArticle',
			book: 'book',
			'book-chapter': 'bookSection',
			dataset: 'webpage',
			dissertation: 'thesis',
			editorial: 'journalArticle',
			erratum: 'journalArticle',
			letter: 'journalArticle',
			monograph: 'book',
			'peer-review': 'journalArticle',
			preprint: 'preprint',
			'proceedings-article': 'conferencePaper',
			report: 'report',
			review: 'journalArticle',
			standard: 'document'
		};

		return mapping[ work.type ] || 'journalArticle';
	}

	resolveUrl( work, originalQuery ) {
		if ( work.doi ) {
			return work.doi;
		}
		if ( work.primary_location && work.primary_location.landing_page_url ) {
			return work.primary_location.landing_page_url;
		}
		if ( work.best_oa_location && work.best_oa_location.landing_page_url ) {
			return work.best_oa_location.landing_page_url;
		}
		if ( typeof originalQuery === 'string' && originalQuery.startsWith( 'http' ) ) {
			return originalQuery;
		}
		return work.id;
	}

	restoreAbstract( invertedIndex ) {
		if ( !invertedIndex || typeof invertedIndex !== 'object' ) {
			return null;
		}

		const words = [];
		Object.keys( invertedIndex ).forEach( ( token ) => {
			const positions = invertedIndex[ token ];
			if ( Array.isArray( positions ) ) {
				positions.forEach( ( position ) => {
					words[ position ] = token;
				} );
			}
		} );

		const abstract = words.filter( Boolean ).join( ' ' ).trim();
		return abstract || null;
	}

	buildPages( firstPage, lastPage ) {
		if ( firstPage && lastPage && String( firstPage ) !== String( lastPage ) ) {
			return `${ firstPage }-${ lastPage }`;
		}
		return firstPage || lastPage || null;
	}

	buildExtra( work ) {
		const extra = [];
		if ( work.id ) {
			extra.push( `OpenAlex: ${ work.id }` );
		}
		if ( work.ids && work.ids.pmid ) {
			extra.push( `PMID: ${ this.stripIdentifierPrefix( work.ids.pmid ) }` );
		}
		if ( work.ids && work.ids.pmcid ) {
			extra.push( `PMCID: ${ this.stripIdentifierPrefix( work.ids.pmcid ) }` );
		}
		return extra.join( '\n' );
	}

	authorToCreator( authorship ) {
		if ( !authorship || !authorship.author || !authorship.author.display_name ) {
			return null;
		}

		const name = authorship.author.display_name.trim();
		const parts = name.split( /\s+/ );

		if ( parts.length === 1 ) {
			return {
				creatorType: 'author',
				lastName: parts[ 0 ]
			};
		}

		return {
			creatorType: 'author',
			firstName: parts.slice( 0, -1 ).join( ' ' ),
			lastName: parts[ parts.length - 1 ]
		};
	}

	normalizeDoi( doiUrl ) {
		if ( !doiUrl || typeof doiUrl !== 'string' ) {
			return null;
		}
		return doiUrl.replace( /^https?:\/\/(?:dx\.)?doi\.org\//i, '' );
	}

	stripIdentifierPrefix( value ) {
		if ( !value || typeof value !== 'string' ) {
			return value;
		}
		return value.replace( /^https?:\/\/[^/]+\//i, '' ).replace( /^(?:pmid:|pmcid:)/i, '' );
	}
}

module.exports = OpenAlexService;
