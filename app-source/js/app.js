'use strict'

const i18n = require( './i18n.min' )

const { ipcRenderer, shell, remote } = require( 'electron' )
const Store				= require( 'electron-store' )
const store				= new Store()
const dialog			= remote.dialog
const $					= require( 'jquery' )
const removeMarkdown	= require( 'remove-markdown' )
const EasyMDE			= require( 'easymde' )
const hljs				= require( 'highlight.js' )
const entities			= require( 'html-entities' ).AllHtmlEntities
const replaceString		= require('replace-string')
const log				= require( 'electron-log' )

const fetch				= require( './fetch.min' )
const dates				= require( './dates.min' )
const editor			= require( './editor.min' )
const categories		= require( './categories.min' )
const search			= require( './search.min' )
const modalWindow		= require( './modal.min' )

let server 		= store.get( 'loginCredentials.server' ),
	username 	= store.get( 'loginCredentials.username' ),
	password 	= store.get( 'loginCredentials.password' ),
	easymde 	= new EasyMDE( editor.easymdeSetup ),
	firstLoad 	= true,
	database 	= new Store({
					name: 'database',
					notes: {}
				})



//note(dgmid): log exceptions

window.onerror = function( error, url, line ) {
	
	ipcRenderer.send( 'error-in-render', {error, url, line} )
}



function fetchResult( call, id, body, notes ) {
	
	switch( call ) {
			
		case 'new': // create new note
			
			store.set('appInterface.selected', notes.id)
			fetch.apiCall( 'all', null, null, function( call, id, body, notes ) {
				
				fetchResult( call, id, body, notes )
			})
			
		break
		
		case 'save': // save note
			
			fetch.apiCall( 'sidebar', null, null, function( call, id, body, notes ) {
				
				fetchResult( call, id, body, notes )
			})
			
		break
		
		case 'update': // modify existing note
			
			$(`button[data-id="${id}"]`).removeData('favorite')
			$(`button[data-id="${id}"]`).attr('data-favorite', body.favorite)
		
		break
		
		case 'category':
		
			fetch.apiCall( 'sidebar', null, null, function( call, id, body, notes ) {
				
				fetchResult( call, id, body, notes )
			})
			
		break
		
		case 'delete': // delete note
			
			let selected = $('#sidebar li button.selected').attr('data-id')
			
			if( selected == id) {
				
				resetEditor()
				
				store.set( 'appInterface.selected', null )
				$('#note').attr('data-id', null)
				$('#time, #note').html('')
			}
			
			fetch.apiCall( 'all', null, null, function( call, id, body, notes ) {
				
				fetchResult( call, id, body, notes )
			})
		
		break
		
		case 'export':
			
			const exportnote = require( './export.min' )
			exportnote.exportNote( notes )
			
		break
		
		case 'sidebar':
			
			listNotes( notes, 'sidebar' )
			
		break
		
		default: // get single note or all notes
			
			(id) ? displayNote( notes ) : listNotes( notes )
	}
}



//note reset editor

function resetEditor() {
	
	easymde.codemirror.setValue('')
	easymde.value('')
	$('.editor-preview').html('')
}



//note(dgmid): codeMirror - insert / wrap text

function insertTextAtCursor( text ) {
	
	let note = easymde.codemirror.getDoc()
	let cursor = note.getCursor()
	note.replaceRange(text, cursor)
}

function wrapTextToSelection( start, end ) {
	
	let note 		= easymde.codemirror.getDoc(),
		selection 	= note.getSelection()
	note.replaceSelection( start + selection + end )
}

function wrapBlockToSelection( start, end ) {
	
	let note 		= easymde.codemirror.getDoc(),
		selection 	= note.getSelection(),
		cursor 		= note.getCursor()
	
	if(selection.length < 1) {
	
	note.replaceRange(
`${start}

${end}`, cursor)
	
	cursor = note.getCursor()
	let line = cursor.line -1
	note.setCursor({ line: line })

	} else {
		
		wrapTextToSelection(
`${start}
`,
`
${end}` )
	}
}



//note(dgmid): generate ordered sidebar entries

function listNotes( array, sidebar ) {
	
	if( sidebar !== null ) database.set('notes', array)
	
	let sortby 	= store.get( 'appSettings.sortby' ),
		orderby = store.get( 'appSettings.orderby' ),
		noteList = '',
		allCats = []
	
	if( array.length > 1 ) {
		
		array.sort(function(x, y) {
			
			var itemX = x[sortby]
			var itemY = y[sortby]
			
			if( orderby === 'asc' ) {
				
				return (itemX < itemY) ? -1 : (itemX > itemY) ? 1 : 0
			
			} else {
				
				return (itemX > itemY) ? -1 : (itemX < itemY) ? 1 : 0
			}
		})
	}
	
	for ( let item of array ) {
		
		noteList += addSidebarEntry( item )
		allCats.push( item.category )
	}
	
	$('#sidebar').html( noteList )
	
	if( sidebar ) {
		
		getSelected( 'sidebar' )
	
	} else {
		
		getSelected()
	}
	
	categories.categoryList( allCats )
	categories.selectCategory( store.get('categories.selected') )
}



//note(dgmid): add sidebar entry

function addSidebarEntry( item ) {
	
	let theDate = new Date( item.modified ),
		formattedDate = dates.sidebarDate( theDate.getTime() )
	
	let	catClass = ( item.category ) ? categories.sanitizeCategory( item.category ) : '##none##'
	
	let	theCat = ( item.category ) ? item.category : i18n.t('app:categories.none', 'Uncategorised')
	
	let plainTxt = removeMarkdown( item.content.replace(/(!\[.*\]\(.*\)|<[^>]*>|>|<)/g, ''))
	
	if( plainTxt ) {

		plainTxt = plainTxt.substr(0, 120).slice(item.title.length)
		plainTxt = replaceString(plainTxt, '[x]', '<span class="checked"></span>')
		plainTxt = replaceString(plainTxt, '[ ]', '<span class="unchecked"></span>')
		
	} else {
		
		plainTxt = i18n.t('app:sidebar.notext', 'No additional text')
	}
	
	let entry = `<li data-id="${item.id}">
					<button data-id="${item.id}" data-title="${item.title}" data-content="" data-catid="${catClass}" data-category="${item.category}" data-favorite="${item.favorite}">
						<span class="side-title">${item.title}</span>
						<span class="side-text">${formattedDate}&nbsp;&nbsp;<span class="excerpt">${plainTxt}</span></span>
						<span class="side-cat">${theCat}</span>
					</button>
				</li>`
	
	return entry
}



//note(dgmid): display single note

function displayNote( note ) {
	
	$('#edit').removeClass('editing')
	
	$('#time').html( dates.titlebarDate( note.modified ) )
	
	if( easymde ) {
		
		easymde.toTextArea()
		easymde = null
	}
	
	easymde = new EasyMDE( editor.easymdeSetup )
	
	toggleSpellcheck( store.get('appSettings.spellcheck') )	
	
	// register right click for notes menu
	
	easymde.codemirror.on( 'mousedown', function( instance, event ) {
		
		if( event.which === 3 ) {
			
			let selection = easymde.codemirror.doc.getSelection()
			
			ipcRenderer.send('show-notes-menu',
				{
					selection: selection,
					preview: false
				}
			)
			return
		}
	})
	
	$('#note').attr('data-id', note.id)
	easymde.value( note.content )
	easymde.codemirror.clearHistory()
	easymde.togglePreview()
	setCheckLists()
	
	$('time').fadeIn('fast')
	$('.loader').fadeOut(400, function() { $(this).remove() } )
	
	if( firstLoad === true ) {
		
		const check = require( './version.min' )		
		firstLoad = 1
		check.appVersion()
		setFocus()
	}
}



//note(dgmid): get selected note

function getSelected( sidebar ) {
	
	let selected = store.get( 'appInterface.selected' )
	
	if( selected ) {
		
		$(`button[data-id="${selected}"]`).addClass('selected').parent().prev().children().addClass('above-selected')
		
		if( !sidebar ) {
			
			fetch.apiCall( 'single', selected, null, function( call, id, body, notes ) {
				
				fetchResult( call, id, body, notes )
			})
		}
	}
}



//note(dgmid): edit note

function editNote() {
	
	let selected = store.get( 'appInterface.selected' )
		
	if( selected ) {
		
		if( easymde.isPreviewActive() ) {
		
			$('#edit').attr('title', i18n.t('app:main.button.save', 'Save Note')).addClass('editing')
			easymde.togglePreview()
			easymde.codemirror.focus()
			initCheckboxes()
			easymde.codemirror.on("changes", initCheckboxes)
			
			
			if( store.get('appSettings.cursor') == 'end' ) {
				
				easymde.codemirror.setCursor(easymde.codemirror.lineCount(), 0)
			}
		
		} else {
			
			if( easymde.codemirror.historySize().undo > 0 ) {
			
				let response = dialog.showMessageBoxSync(remote.getCurrentWindow(), {
								message: i18n.t('app:dialog.save.title', 'You have made changes to this note'),
								detail: i18n.t('app:dialog.save.text', 'Do you want to save them?'),
								buttons: [i18n.t('app:dialog.button.savechanges', 'Save changes'), i18n.t('app:dialog.button.cancel', 'Cancel')]
							})
				
				if( response === 0 ) {
					
					let body = {	
						"content": easymde.value(),
						"modified": Math.floor(Date.now() / 1000)
					}
					
					easymde.codemirror.clearHistory()
					
					fetch.apiCall( 'save', selected, body, function( call, id, body, notes ) {
						
						fetchResult( call, id, body, notes )
					})
					
				} else {
			
					while ( easymde.codemirror.historySize().undo > 0) easymde.codemirror.undo()
					
				}
			}
			
			easymde.togglePreview()
			$('.editor-toolbar button').removeClass('active')
			$('#edit').attr('title', i18n.t('app:main.button.edit', 'Edit Note')).removeClass('editing').focus()
			setCheckLists()
		}
	}
}



//editor checkboxes - based on https://github.com/nextcloud/notes/issues/117
//note(dgmid): init checkboxes

function initCheckboxes() {
	
	$('.cm-formatting-task').off('click.toggleEditorCheckboxes').on('click.toggleEditorCheckboxes', function (event) {
		
		$('.cm-formatting-task').off('click.toggle_checkbox')
		
		event.stopPropagation()
		event.preventDefault()
		toggleEditorCheckboxes( $(this) )
	})
}



//note(dgmid): toggle checkbox state

function toggleEditorCheckboxes( element ) {
	
	let doc 	= easymde.codemirror.getDoc(),
		index 	= element.parents( '.CodeMirror-line' ).index(),
		line 	= doc.getLineHandle( index )
	
	let newvalue = ( element.text() == '[x]' ) ? '[ ]' : '[x]'
	
	doc.replaceRange(
		newvalue,
		{
			line: index,
			ch: line.text.indexOf( '[' )
		},
		{
			line: index,
			ch: line.text.indexOf( ']' ) + 1
		}
	)

	easymde.codemirror.execCommand( 'goLineEnd' )
}



//note(dgmid): save note

function saveNote( id ) {
	
	if(	!easymde.isPreviewActive() && easymde.codemirror.historySize().undo > 0 ) {
		
		let body = {
			"content": easymde.value(),
			"modified": Math.floor(Date.now() / 1000)
		}
					
		easymde.codemirror.clearHistory()
		
		fetch.apiCall( 'save', id, body, function( call, id, body, notes ) {
			
			fetchResult( call, id, body, notes )
		})
		
		
	}
}



//note(dgmid): delete check

function deleteCheck( id ) {
	
	let response = dialog.showMessageBoxSync(remote.getCurrentWindow(), {
							message: i18n.t('app:dialog.delete.title', 'Are you sure you want to delete this note?'),
							detail: i18n.t('app:dialog.delete.text', 'This operation is not reversable.'),
							buttons: [i18n.t('app:dialog.button.delete', 'Delete Note'), i18n.t('app:dialog.button.cancel', 'Cancel')]
						})
		
	if( response === 0 ) {
		
		fetch.apiCall( 'delete', id, null, function( call, id, body, notes ) {
			
			fetchResult( call, id, body, notes )
		})
	}
}



//note(dgmid): apply zoom level

function applyZoom( level ) {
	
	$('.editor-preview').css({ "font-size": `${level/10}rem` })
}



//note(dgmid): toggle spellcheck

function toggleSpellcheck( state ) {
	
	( state ) ? $('.CodeMirror').addClass('spellcheck') : $('.CodeMirror').removeClass('spellcheck')
}



//note(dgmid): set zoom slider

ipcRenderer.on('set-zoom-slider', (event, message) => {
	
	applyZoom( message )
})



//note(dgmid): reload sidebar

ipcRenderer.on('reload-sidebar', (event, message) => {
	
	if( message === 'login' ) {
		
		server 		= store.get( 'loginCredentials.server' ),
		username 	= store.get( 'loginCredentials.username' ),
		password 	= store.get( 'loginCredentials.password' )
		
		log.info( `${message} completed` )
		
		fetch.apiCall( 'all', null, null, function( call, id, body, notes ) {
			
			fetchResult( call, id, body, notes )
		})
	
	} else if( message === 'logout' ) {
		
		server = username = password = null
		
		resetEditor()
		$('#sidebar, #categories').empty()
	
	} else {
		
		fetch.apiCall( 'sidebar', null, null, function( call, id, body, notes ) {
			
			fetchResult( call, id, body, notes )
		})
	}
})



//note(dgmid): spellcheck

ipcRenderer.on('spellcheck', (event, message) => {
	
	let state = ( message ) ? false : true
	
	store.set('appSettings.spellcheck', state)
	toggleSpellcheck( state )
})



//note(dgmid): display categories

ipcRenderer.on('showcats', (event, message) => {
	
	categories.toggleCategories( message )
})



//note(dgmid): update-theme

ipcRenderer.on('set-theme', (event, message) => {
	
	__setTheme()
})



//note(dgmid): toggle-sidebar

ipcRenderer.on('toggle-categories', (event, message) => {
	
	$('#frame, footer').toggleClass('slide')
	
	let cats = store.get( 'appInterface.categories' ) ? false : true
	store.set( 'appInterface.categories', cats )
})



//note(dgmid): toggle category count

ipcRenderer.on('toggle-catcount', (event, message) => {
	
	$('.cat-count').toggleClass('show')
	
	let count = store.get( 'appSettings.catcount' ) ? false : true
	store.set( 'appSettings.catcount', count )
})



//note(dgmid): toggle category icons is sidebar

ipcRenderer.on('toggle-caticons', (event, message) => {
	
	$('#sidebar').toggleClass('showcats')
	
	let icons = store.get( 'appSettings.showcats' ) ? false : true
	store.set( 'appSettings.showcats', icons )
})



//note(dgmid): log in modal

ipcRenderer.on('open-login-modal', (event, message) => {
	
	modalWindow.openModal( `file://${__dirname}/../html/login.html`, 480, 210, false )
})



//note(dgmid): close login modal

ipcRenderer.on('close-login-modal', (event, message) => {
	
	modalWindow.closeModal
})



//note(dgmid): note menu commands

ipcRenderer.on('note', (event, message) => {
	
	let selected = store.get( 'appInterface.selected' )
	
	switch( message ) {
		
		case 'new':
			
			let body
			
			switch( store.get( 'categories.selected' ) ) {
			
				case '##all##':
				case '##none##':
					
					body = {
						"content": '# ' +  i18n.t('app:sidebar.new', 'New note')
					}
					
				break
				
				case '##fav##':
					
					body = {
						"content": '# ' +  i18n.t('app:sidebar.new', 'New note'),
						"favorite": true
					}
					
				break
				
				default:
					
					body = {
						"content": '# ' +  i18n.t('app:sidebar.new', 'New note'),
						"category": $('.categories li button.selected').data('category')
					}
			}
			
			fetch.apiCall( 'new', null, body, function( call, id, body, notes ) {
				
				fetchResult( call, id, body, notes )
			})
			
		break
		
		case 'edit':
			if( selected ) editNote( selected )
		break
		
		case 'save':
			if( selected ) saveNote( selected )
		break
		
		case 'favorite':
			if( selected ) {
			
				let favorite = ( $(`#sidebar li button[data-id="${selected}"]`).attr('data-favorite') == 'true' ) ? false : true
				
				fetch.apiCall( 'update', selected, {"favorite": favorite}, function( call, id, body, notes ) {
					
					fetchResult( call, id, body, notes )
				})
			}
		break
		
		case 'newcat':
			
			if( selected ) {
				modalWindow.openModal( `file://${__dirname}/../html/new-category.html?id=${selected}`, 480, 180, false )
			}
		break
		
		break
		
		case 'export':
			if( selected ) {
				
				fetch.apiCall( 'export', selected, null, function( call, id, body, notes ) {
					
					fetchResult( call, id, body, notes )
				})
			}
		break
		
		case 'delete':
			if( selected ) deleteCheck( selected )
		break
		
		case 'selectall':
			if( !easymde.isPreviewActive() ) {
				
				easymde.codemirror.execCommand('selectAll')
			
			} else if( $('#search:focus') ) {
				
				$('#search').select()
			}
		break
		
		case 'find':
			if( store.get( 'appInterface.categories' ) === false ) {
				
				$('#frame, footer').addClass('slide')
				store.set( 'appInterface.categories', true )
			}
			
			$('#search').focus()
		break
	}
})



//note(dgmid): markdown menu commands

ipcRenderer.on('markdown', (event, message) => {
	
	if( !easymde.isPreviewActive() ) {
		
		switch( message ) {
			
			case 'h1':
				easymde.toggleHeading1()
			break
			case 'h2':
				easymde.toggleHeading2()
			break
			case 'h3':
				easymde.toggleHeading3()
			break
			case 'h4':
				easymde.toggleHeading4()
			break
			case 'h5':
				easymde.toggleHeading5()
			break
			case 'h6':
				easymde.toggleHeading6()
			break
			case 'b':
				easymde.toggleBold()
			break
			case 'i':
				easymde.toggleItalic()
			break
			case 'del':
				easymde.toggleStrikethrough()
			break
			case 'ul':
				easymde.toggleUnorderedList()
			break
			case 'ol':
				easymde.toggleOrderedList()
			break
			case 'cl':
				easymde.codemirror.replaceSelection('- [ ]  ')
				easymde.codemirror.focus()
			break
			case 'a':
				modalWindow.openModal( `file://${__dirname}/../html/insert-hyperlink.html`, 480, 180, false )
			break
			case 'img':
				easymde.drawImage()
			break
			case 'code':
				easymde.toggleCodeBlock()
			break
			case 'blockquote':
				easymde.toggleBlockquote()
			break
			case 'table':
				easymde.drawTable()
			break
			case 'hr':
				easymde.drawHorizontalRule()
			break
		}
	}
})



//note(dgmid): html submenu menu commands

ipcRenderer.on('html', (event, message) => {
	
	
	if( !easymde.isPreviewActive() ) {
		
		switch( message ) {
			
			case 'small':
			case 'sup':
			case 'sub':
			case 'u':
			case 'mark':
				wrapTextToSelection( `<${message}>`, `</${message}>` )
			break
			case 'javascript':
			case 'json':
			case 'html':
			case 'css':
			case 'scss':
			case 'php':
			case 'objective-c':
			case 'c-like':
			case 'bash':
				wrapBlockToSelection( `\`\`\` ${message}`, `\`\`\`` )
			break
			case 'dl':
				insertTextAtCursor(
`<dl>
	<dt>${i18n.t('app:main.title', 'title')}</dt>
	<dd>${i18n.t('app:main.description', 'description')}</dd>
	<dt>${i18n.t('app:main.title', 'title')}</dt>
	<dd>${i18n.t('app:main.description', 'description')}</dd>
</dl>` )
			break
		}
	}
})



//note(dgmid): view menu - zoom levels

ipcRenderer.on('set-zoom-level', (event, message) => {
	
	let zoom = store.get( 'appSettings.zoom' )
	
	switch( message ) {
		
		case 1:
			zoom++
			if( zoom > 16 ) zoom = 16
		break
		
		case -1:
			zoom--
			if( zoom < 4 ) zoom = 4
		break
		
		default:
			zoom = 10
	}
	
	store.set( 'appSettings.zoom', zoom )
	applyZoom( zoom )
})



//note(dgmid): sidebar context menu commands

ipcRenderer.on('context-favorite', (event, message) => {
	
	let favorite 	= ( message.favorite == 'true' ) ? false : true,
		id 			= message.id
	
	fetch.apiCall( 'update', id, {"favorite": favorite}, function( call, id, body, notes ) {
			
		fetchResult( call, id, body, notes )
	})
})


ipcRenderer.on('context-export', (event, id) => {
	
	fetch.apiCall( 'export', id, null, function( call, id, body, notes ) {
			
		fetchResult( call, id, body, notes )
	})
})


ipcRenderer.on('context-delete', (event, id) => {
	
	deleteCheck( id )
})


ipcRenderer.on('context-category', (event, message) => {
	
	let id 			= parseInt( message.id ),
		category	= message.category,
		notes		= database.get('notes')
	
	let note = notes.find( x => x.id === id ),
		body = {
		
		"modified": 	note.modified,
		"content": 		note.content,
		"category":		category
	}
	
	fetch.apiCall( 'category', id, body, function( call, id, body, notes ) {
			
		fetchResult( call, id, body, notes )
	})
})


ipcRenderer.on('context-newcategory', (event, message) => {
	
	modalWindow.openModal( `file://${__dirname}/../html/new-category.html?id=${message}`, 480, 180, false )
})


ipcRenderer.on('category-order', (event, message) => {
	
	store.set( 'appSettings.ordercats', message )
	
	$('#categories').removeClass( 'asc desc' ).addClass( message )
})


//note(dgmid): notes context menu commands

ipcRenderer.on('context-note-encode', (event, message) => {
	
	let encoded = entities.encode( message )
	easymde.codemirror.doc.replaceSelection( encoded )
})


ipcRenderer.on('context-note-decode', (event, message) => {
	
	let decoded = entities.decode( message )
	easymde.codemirror.doc.replaceSelection( decoded )
})


ipcRenderer.on('context-note-upper', (event, message) => {
	
	easymde.codemirror.doc.replaceSelection(
		message.toLocaleUpperCase( i18n.language )
	)
})


ipcRenderer.on('context-note-lower', (event, message) => {
	
	easymde.codemirror.doc.replaceSelection(
		message.toLocaleLowerCase( i18n.language )
	)
})


ipcRenderer.on('context-note-caps', (event, message) => {
	
	let selection = message.toLocaleLowerCase( i18n.language )
	easymde.codemirror.doc.replaceSelection(
		capitalize( selection )
	)
})

function capitalize( string ) {

    return string.replace(/(?:^|\s)\S/g,
		function(a) {
			return a.toLocaleUpperCase( i18n.language )
	})
}



ipcRenderer.on('add-hyperlink', (event, message) => {
	
	//todo(dgmid): when selection < 1
	
	//if selection
	
	wrapTextToSelection( `[`, `](${message})` )
	
	// else
	
	// get cursor position
	// insert link: [](${message})
	//move cursor inside []
	
})



//note(dgmid): on click sidebar button

$('body').on('click', '#sidebar li button', function(event) {
	
	event.stopPropagation()
	
	let id = $(this).data('id')
	
	$('#time').empty().hide()
	$('main').append('<div class="loader"><div class="spinner"></div></div>')
	
	$('#sidebar li button').removeClass('selected').removeClass('above-selected')
	$(this).addClass('selected').parent().prev().children().addClass('above-selected')
	
	fetch.apiCall( 'single', id, null, function( call, id, body, notes ) {
			
			fetchResult( call, id, body, notes )
		})
	
	store.set( 'appInterface.selected', id )
})



//note(dgmid): on right click sidebar button

$('body').on('mouseup', '#sidebar li button', function(event) {
	
	event.stopPropagation()
	
	let data = {
		'id': 		$(this).data('id'),
		'title': 	$(this).data('title'),
		'favorite': $(this).attr('data-favorite'),
		'category': $(this).attr('data-category'),
		'catID': 	$(this).attr('data-catid')
	}
	
	if( event.which === 3 ) {
		
		ipcRenderer.send('show-sidebar-menu', data )
		return
	}
})


$('body').on('focus', '#sidebar li button', function(event) {
	
	$(this).parent().prev().children().addClass('above-selected')
})


$('body').on('focusout', '#sidebar li button', function(event) {
	
	if( !$(this).hasClass('selected') ) {
		
		$(this).parent().prev().children().removeClass('above-selected')
	}
})



//note(dgmid): on click empty sidebar

$('body').on('mouseup', 'aside', function(event) {
	
	if( event.which === 3 ) {
	
		ipcRenderer.send('show-sidebar-menu', null )
	}
})



//note(dgmid): on click note preview

$('body').on('mouseup', '.editor-preview-active', function(event) {
	
	if( event.which === 3 ) {
		
		ipcRenderer.send('show-notes-menu',
			{
				selection: '',
				preview: true
			}
		)
	}
})



//note(dgmid): add link from toolbar
$('body').on('click', '.editor-toolbar .link', (event) => {
	
	if( $('#edit').hasClass('editing') ) {
		
		modalWindow.openModal( `file://${__dirname}/../html/insert-hyperlink.html`, 480, 180, false )
	}
})



//note(dgmid): open links in default browser

$(document).on('click', 'a[href^="http"]', function(event) {
	
	event.preventDefault()
	shell.openExternal(this.href)
})



//note(dgmid): change category

$('body').on('click', '.categories button', function(event) {
	
	let cat = $(this).attr( 'data-category' ),
		catid = $(this).attr( 'data-catid' )
	
	$('.categories button').removeClass('selected')
	$(this).addClass('selected')
	
	store.set( 'categories.selected', catid )
	
	categories.selectCategory( catid )
	categories.showHideCategoryIcons()
})



//note(dgmid): keyboard arrow and enter keys

document.addEventListener( 'keydown', function( event ) {
	
	if( easymde.isPreviewActive() ) {
		
		let items
		
		switch( event.which ) {
			
			case 13:
				$(':focus').click().focus()
			break
			
			case 38:
				$('#sidebar button').blur()
				items = $('#sidebar button.selected').parent('li').prevAll('li:visible')
				items.first().find('button').click().focus()
			break
			
			case 40:
				$('#sidebar button').blur()
				items = $('#sidebar button.selected').parent('li').nextAll('li:visible')
				items.first().find('button').click().focus()
			break
		}
	}
})



//note(dgmid): open update link in default browser

$('body').on('click', '#update', (event) => {
	
	event.preventDefault()
	
	let link = $('#update').attr( 'data-url' )
	
	shell.openExternal(link)
})



//note(dgmid): remove bullets from checkbox lists

function setCheckLists() {
	
	$('input[type="checkbox"]').parent().css('list-style-type', 'none')
}



$('body').on('mouseenter', 'main a', function() {
	
	$('#location').empty().html( this.href )
	$('samp').addClass('show')
})

$('body').on('mouseleave', 'main a', function() {
	
	$('samp').removeClass('show')
})



//note(dgmid): search

$('#search').bind( 'keyup', function() {
	
	let str = $(this).val(),
		clear = $('#clear')
	
	let state = ( str.length > 0 ) ? $('#clear').show() : $('#clear').hide()
	
	search.searchNotes( str, function( result, clean ) {
		
		searchResult( result, clean )
	})
})


$('#clear').click(function() {
	
	$('#search').val('')
	$('#result').empty().hide()
	categories.selectCategory( store.get( 'categories.selected' ) )
	$('.categories button.selected').focus()
	$(this).hide()
})



//note(dgmid): initial focus

function setFocus() {
	
	if( store.get( 'appInterface.categories' ) ) {
	
		$('.categories button.selected').focus()
		
	} else {
		
		$('#sidebar button.selected').focus()
	} 
}



//note(dgmid): docready

$(document).ready(function() {
	
	//note(dgmid): set lang
	
	$('html').attr('lang', i18n.language)
	
	
	//note(dgmid): display category icons in sidebar 
	
	if( store.get( 'appSettings.showcats' ) ) {
		
		$('#sidebar').addClass( 'showcats' )
	}
	
	
	//note(dgmid): show or hide categories sidebar
	
	if( store.get( 'appInterface.categories' ) ) {
		
		$('#frame, footer').addClass( 'slide' )
	}
	
	
	//note(dgmid): show or hide category counts
	
	if( store.get( 'appSettings.catcount' ) ) {
		
		$('.cat-count').addClass('show')
	}
	
	
	//note(dgmid): set edit button title
	
	$('#edit').attr('title', i18n.t('app:main.button.edit', 'Edit Note'))
	
	
	//note(dgmid): set categories strings
	
	$('#cat-title').html( i18n.t('app:categories.title', 'Categories'))
	$('#cat-all').html( i18n.t('app:categories.all', 'All notes')).attr('title', i18n.t('app:categories.all', 'All notes'))
	$('#cat-fav').html( i18n.t('app:categories.fav', 'Favorites')).attr('title', i18n.t('app:categories.fav', 'Favorites'))
	$('#cat-none').html( i18n.t('app:categories.none', 'Uncategorised')).attr('title', i18n.t('app:categories.none', 'Uncategorised'))
	$('#search').attr('placeholder', i18n.t('app:sidebar.search', 'Search'))
	
	
	//note(dgmid): check login
	
	if( !server || !username || !password ) {
		
		modalWindow.openModal( `file://${__dirname}/../html/login.html`, 480, 210, false )
		
	} else {
		
		fetch.apiCall( 'all', null, null, function( call, id, body, notes ) {
			
			fetchResult( call, id, body, notes )
		})
	}

	
	//note(dgmid): edit save
	
	$('#edit').click(function() {
		
		editNote()
	})
})
