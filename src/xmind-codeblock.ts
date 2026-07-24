import { MarkdownPostProcessorContext, MarkdownRenderChild, TFile, setIcon } from 'obsidian';
import XMindViewerPlugin from './main';
import { renderOnline } from './xmind-online';
import { renderOffline } from './xmind-offline';
import { t } from './i18n';

export function registerXMindCodeBlock(plugin: XMindViewerPlugin): void {
	plugin.registerMarkdownCodeBlockProcessor('xmind-pal', async (source, el, ctx) => {
		const container = el.createDiv({ cls: 'xmind-viewer-container' });

		const child = new MarkdownRenderChild(container);
		let cleanup: (() => void) | undefined;
		child.onunload = () => {
			cleanup?.();
			cleanup = undefined;
		};
		ctx.addChild(child);

		try {
			await processXMindBlock(plugin, source, container, ctx, (fn) => {
				cleanup = fn;
			});
		} catch (e) {
			showError(container, t('error.renderFailed', { message: e instanceof Error ? e.message : String(e) }));
		}
	});
}

async function processXMindBlock(
	plugin: XMindViewerPlugin,
	source: string,
	container: HTMLElement,
	ctx: MarkdownPostProcessorContext,
	setCleanup: (fn: () => void) => void
): Promise<void> {
	const content = source.trim();
	const sourcePath = ctx.sourcePath;

	// Determine the file link source
	let fileLink: string | null = null;

	if (content === '') {
		// Empty → use default property from settings
		fileLink = getPropertyLink(plugin, sourcePath, plugin.settings.defaultProperty);
	} else if (content.startsWith('property:')) {
		// property: name
		const propertyName = content.slice('property:'.length).trim();
		fileLink = getPropertyLink(plugin, sourcePath, propertyName);
	} else if (content.startsWith('![[') || content.startsWith('[[')) {
		// Direct file link: ![[file.xmind]] or [[file.xmind]]
		fileLink = extractFileLink(content);
	} else if (content.startsWith('file:')) {
		// file: path
		const fileValue = content.slice('file:'.length).trim();
		fileLink = extractFileLink(fileValue) || fileValue;
	} else {
		// Otherwise → treat as a property name
		fileLink = getPropertyLink(plugin, sourcePath, content);
	}

	if (!fileLink) {
		if (content === '') {
			showError(container, t('error.propertyNotFound', { name: plugin.settings.defaultProperty }));
		} else if (content.startsWith('property:')) {
			const propertyName = content.slice('property:'.length).trim();
			showError(container, t('error.propertyNotFound', { name: propertyName }));
		} else {
			showError(container, t('error.couldNotResolve', { content }));
		}
		return;
	}

	// Resolve the file
	const file = plugin.app.metadataCache.getFirstLinkpathDest(fileLink, sourcePath);
	if (!file) {
		showError(container, t('error.fileNotFound', { name: fileLink }));
		return;
	}

	if (file.extension !== 'xmind') {
		showError(container, t('error.notXmindFile', { name: file.name }));
		return;
	}

	// Read the file as ArrayBuffer (cached)
	const fileData = await plugin.readXmindFile(file);

	// Create toolbar if enabled
	const viewerEl = container.createDiv({ cls: 'xmind-viewer-content' });

	if (plugin.settings.showToolbar) {
		createToolbar(plugin, container, file, viewerEl);
	}

	// Render
	if (plugin.settings.renderMode === 'online') {
		// Online mode: create a fixed-height wrapper so the loading overlay and iframe share the same box.
		const wrapper = viewerEl.createDiv({ cls: 'xmind-viewer-online-wrapper' });
		wrapper.style.height = plugin.settings.viewerHeight;

		const loadingEl = createLoadingPlaceholder();
		wrapper.appendChild(loadingEl);
		setCleanup(renderOnline(wrapper, fileData, plugin.settings, loadingEl));
	} else {
		// Offline mode: show loading placeholder while parsing asynchronously
		const loadingEl = createLoadingPlaceholder();
		loadingEl.style.position = 'relative';
		loadingEl.style.height = plugin.settings.viewerHeight;
		viewerEl.appendChild(loadingEl);

		renderOffline(viewerEl, fileData, plugin.settings, (cleanupFn) => {
			loadingEl.remove();
			setCleanup(cleanupFn);
		});
	}
}

function getPropertyLink(plugin: XMindViewerPlugin, sourcePath: string, propertyName: string): string | null {
	const file = plugin.app.vault.getAbstractFileByPath(sourcePath);
	if (!file || !(file instanceof TFile)) {
		return null;
	}

	const cache = plugin.app.metadataCache.getFileCache(file);
	if (!cache || !cache.frontmatter) {
		return null;
	}

	const value = cache.frontmatter[propertyName];
	if (!value || typeof value !== 'string') {
		return null;
	}

	return extractFileLink(value) || value;
}

function extractFileLink(text: string): string | null {
	const trimmed = text.trim();

	// ![[file.xmind]]
	const embedMatch = trimmed.match(/^!\[\[(.+?)\]\]$/);
	if (embedMatch) {
		return embedMatch[1];
	}

	// [[file.xmind]]
	const linkMatch = trimmed.match(/^\[\[(.+?)\]\]$/);
	if (linkMatch) {
		return linkMatch[1];
	}

	return null;
}

function createToolbar(
	plugin: XMindViewerPlugin,
	container: HTMLElement,
	file: TFile,
	viewerEl: HTMLElement
): void {
	const toolbar = container.createDiv({ cls: 'xmind-viewer-toolbar' });
	container.insertBefore(toolbar, viewerEl);

	const filenameEl = toolbar.createDiv({ cls: 'xmind-viewer-filename' });
	filenameEl.textContent = file.name;
	filenameEl.title = file.path;

	const openBtn = toolbar.createDiv({ cls: 'xmind-viewer-open-btn' });
	openBtn.title = t('ui.openWithDefaultApp');
	setIcon(openBtn, 'external-link');
	openBtn.addEventListener('click', () => {
		openWithDefaultApp(plugin, file);
	});

	if (plugin.settings.doubleClickOpen) {
		toolbar.addEventListener('dblclick', () => {
			openWithDefaultApp(plugin, file);
		});
	}
}

function openWithDefaultApp(plugin: XMindViewerPlugin, file: TFile): void {
	const app = plugin.app as any;
	if (typeof app.openWithDefaultApp === 'function') {
		app.openWithDefaultApp(file.path);
	}
}

function showError(container: HTMLElement, message: string): void {
	const errorEl = container.createDiv({ cls: 'xmind-viewer-error' });
	errorEl.textContent = message;
}

function createLoadingPlaceholder(): HTMLElement {
	const el = document.createElement('div');
	el.className = 'xmind-viewer-loading';

	const spinner = document.createElement('div');
	spinner.className = 'xmind-viewer-spinner';
	el.appendChild(spinner);

	const text = document.createElement('div');
	text.className = 'xmind-viewer-loading-text';
	text.textContent = t('ui.loadingMindMap');
	el.appendChild(text);

	return el;
}
