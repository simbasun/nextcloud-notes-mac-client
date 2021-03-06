
window.__setTheme = () => {
	
	let userTheme 		= localStorage.user_theme,
		OSTheme 		= localStorage.os_theme,
		defaultTheme 	= 'light',
		accent			= localStorage.accent,
		accent_light	= localStorage.accent_light,
		accent_dark		= localStorage.accent_dark,
		app_light,
		app_dark
	
	
	document.documentElement.setAttribute(
		'data-theme',
		userTheme || OSTheme || defaultTheme,
	)
	
	if( userTheme ) {
		
		document.documentElement.setAttribute( 'data-user', userTheme )
		
	} else {
		
		document.documentElement.removeAttribute( 'data-user' )
	}
	
	// if accent is blue or graphite - don't use accent for app color
	
	if( accent === '#0a5fff' || accent === '#868686' ) {
		
		document.documentElement.removeAttribute( 'data-select' )
		
		app_light	= '#fee298'
		app_dark	= '#c5993e'
		
	} else {
		
		document.documentElement.setAttribute( 'data-select', 'inverted' )
		
		app_light	= accent_light
		app_dark	= accent_dark
	}
	
	document.documentElement.setAttribute( 'style', `--accent: ${accent}; --accent-light: ${accent_light}; --accent-dark: ${accent_dark}; --app-light: ${app_light}; --app-dark: ${app_dark};`)
}

__setTheme()
