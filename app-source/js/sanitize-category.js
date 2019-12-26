'use strict'



module.exports.sanitizeCategory = function( category ) {
	
	category = category.toLowerCase()
	category = category.replace( 'ß', 'ss' )
	category = category.normalize( 'NFD' ).replace( /[\u0300-\u036f]/g, '' )
	category = category.replace( /[^0-9a-z ]/gi, '' )
	category = category.replace( /\s+/g, '_' )
	
	return category
}