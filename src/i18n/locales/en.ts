export default {
	// Settings
	'settings.language.name': 'Language',
	'settings.language.desc': "Set the interface language. 'Auto' follows Obsidian's language setting.",
	'settings.language.auto': 'Auto (follow Obsidian)',
	'settings.language.zh': '中文',
	'settings.language.en': 'English',

	'settings.defaultProperty.name': 'Default property',
	'settings.defaultProperty.desc': 'Name of the frontmatter property that contains the xmind file link.',
	'settings.defaultProperty.placeholder': 'xmind',

	'settings.renderMode.name': 'Render mode',
	'settings.renderMode.desc': 'Online uses XMind embed service (requires network). Offline parses and renders locally (no network, simpler visual style).',
	'settings.renderMode.online': 'Online (XMind embed service)',
	'settings.renderMode.offline': 'Offline (local renderer)',

	'settings.region.name': 'Region',
	'settings.region.desc': 'XMind embed service region. Use "cn" for faster loading in mainland China.',
	'settings.region.global': 'Global (xmind.app)',
	'settings.region.cn': 'China (xmind.cn)',

	'settings.viewerHeight.name': 'Viewer height',
	'settings.viewerHeight.desc': 'CSS height for the embedded viewer.',
	'settings.viewerHeight.placeholder': '500px',

	'settings.showToolbar.name': 'Show toolbar',
	'settings.showToolbar.desc': 'Display a toolbar above the viewer with the file name and an open-externally button.',

	'settings.doubleClickOpen.name': 'Double-click to open',
	'settings.doubleClickOpen.desc': 'Double-click the toolbar area to open the xmind file with the default application.',

	// Commands
	'command.insertCodeblock': 'Insert XMind viewer code block',

	// Errors
	'error.renderFailed': 'Failed to render: {message}',
	'error.propertyNotFound': "Property '{name}' not found or empty in this note.",
	'error.couldNotResolve': 'Could not resolve xmind file from: {content}',
	'error.fileNotFound': "Xmind file '{name}' not found.",
	'error.notXmindFile': "File '{name}' is not a .xmind file.",
	'error.parseFailed': 'Failed to parse xmind file: {message}',
	'error.noSheets': 'No sheets found in xmind file',

	// UI
	'ui.openWithDefaultApp': 'Open with default app',
	'ui.loadingMindMap': 'Loading mind map...',
	'ui.sheetLabel': 'Sheet {index}',
};
