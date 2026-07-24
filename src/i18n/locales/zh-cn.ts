export default {
	// Settings
	'settings.language.name': '语言',
	'settings.language.desc': '设置界面语言。"自适应" 将跟随 Obsidian 的语言设置。',
	'settings.language.auto': '自适应 Obsidian',
	'settings.language.zh': '中文',
	'settings.language.en': 'English',

	'settings.defaultProperty.name': '默认属性',
	'settings.defaultProperty.desc': '包含 xmind 文件链接的 frontmatter 属性名称。',
	'settings.defaultProperty.placeholder': 'xmind',

	'settings.renderMode.name': '渲染模式',
	'settings.renderMode.desc': '缩略图模式显示 XMind 生成的预览图（最快、原生效果）。在线模式使用 XMind 嵌入服务（需要网络）。',
	'settings.renderMode.thumbnail': '缩略图（XMind 预览图）',
	'settings.renderMode.online': '在线（XMind 嵌入服务）',

	'settings.region.name': '区域',
	'settings.region.desc': 'XMind 嵌入服务区域。在中国大陆使用 "cn" 可加快加载速度。',
	'settings.region.global': '全球 (xmind.app)',
	'settings.region.cn': '中国 (xmind.cn)',

	'settings.preloadViewer.name': '启动时预加载查看器',
	'settings.preloadViewer.desc': '在启动时后台加载 XMind 嵌入页面，让首次预览打开更快。仅在线模式下有效。',

	'settings.viewerHeight.name': '查看器高度',
	'settings.viewerHeight.desc': '嵌入查看器的 CSS 高度。',
	'settings.viewerHeight.placeholder': '500px',

	'settings.showToolbar.name': '显示工具栏',
	'settings.showToolbar.desc': '在查看器上方显示工具栏，包含文件名和外部打开按钮。',

	'settings.doubleClickOpen.name': '双击打开',
	'settings.doubleClickOpen.desc': '双击工具栏区域以默认应用程序打开 xmind 文件。',

	// Commands
	'command.insertCodeblock': '插入 XMind 查看器代码块',

	// Errors
	'error.renderFailed': '渲染失败：{message}',
	'error.propertyNotFound': "在此笔记中未找到属性 '{name}' 或为空。",
	'error.couldNotResolve': '无法从以下内容解析 xmind 文件：{content}',
	'error.fileNotFound': "未找到 xmind 文件 '{name}'。",
	'error.notXmindFile': "文件 '{name}' 不是 .xmind 文件。",
	'error.parseFailed': '解析 xmind 文件失败：{message}',
	'error.thumbnailFailed': '加载缩略图失败：{message}',

	// UI
	'ui.openWithDefaultApp': '使用默认应用打开',
	'ui.loadingMindMap': '正在加载思维导图...',
	'ui.mindMapThumbnail': '思维导图缩略图',
};
