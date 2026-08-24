import { App, MarkdownPostProcessorContext, MarkdownRenderChild, TFile, debounce, setIcon } from 'obsidian';
import XMindViewerPlugin from './main';
import { renderOnline } from './xmind-online';
import { renderThumbnail } from './xmind-thumbnail';
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
			await processXMindBlock(plugin, source, container, ctx, (makeCleanup) => {
				cleanup?.();
				cleanup = makeCleanup();
			});
		} catch (e) {
			showError(container, t('error.renderFailed', { message: e instanceof Error ? e.message : String(e) }));
		}
	});
}

export async function processXMindBlock(
	plugin: XMindViewerPlugin,
	source: string,
	container: HTMLElement,
	ctx: MarkdownPostProcessorContext,
	setCleanup: (makeCleanup: () => (() => void)) => void
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

	// Render
	if (plugin.settings.renderMode === 'online') {
		if (plugin.settings.showToolbar) {
			createToolbar(plugin, container, file, viewerEl);
		}

		// Online mode: create a fixed-height wrapper so the loading overlay and iframe share the same box.
		const wrapper = viewerEl.createDiv({ cls: 'xmind-viewer-online-wrapper' });
		wrapper.style.height = plugin.settings.viewerHeight;

		const loadingEl = createLoadingPlaceholder();
		wrapper.appendChild(loadingEl);
		setCleanup(() => renderOnline(wrapper, fileData, plugin.settings, loadingEl));
	} else {
		// Thumbnail mode (default): render the XMind-generated preview image.
		// Faster than iframe, fully native XMind fidelity, and supports Obsidian's
		// built-in image Lightbox for zooming.
		//
		// The toolbar gets a refresh button that force re-reads the file from
		// disk and re-renders.

		let refreshBtn: HTMLElement | null = null;
		const refresh = createThumbnailRefresh(plugin, file, viewerEl, setCleanup, () => refreshBtn);
		if (plugin.settings.showToolbar) {
			refreshBtn = createToolbar(plugin, container, file, viewerEl, refresh);
		}

		setCleanup(() => renderThumbnail(viewerEl, file, fileData, plugin, { viewerHeight: plugin.settings.viewerHeight, fileName: file.name }));
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

	const value: unknown = cache.frontmatter[propertyName];
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

/**
 * Create the toolbar above the viewer: file name on the left, action
 * buttons on the right.
 *
 * Returns the refresh button when one was created (thumbnail mode with
 * toolbar enabled), or null otherwise — the caller hands it to the
 * refresh handler so it can stop the spin animation when done.
 */
function createToolbar(
	plugin: XMindViewerPlugin,
	container: HTMLElement,
	file: TFile,
	viewerEl: HTMLElement,
	refresh?: () => void
): HTMLElement | null {
	const toolbar = container.createDiv({ cls: 'xmind-viewer-toolbar' });
	container.insertBefore(toolbar, viewerEl);

	const filenameEl = toolbar.createDiv({ cls: 'xmind-viewer-filename' });
	filenameEl.textContent = file.name;
	filenameEl.title = file.path;

	// Refresh button (thumbnail mode only): force re-reads the file from
	// disk and re-renders. Created before the open button so it sits to
	// its left.
	let refreshBtn: HTMLElement | null = null;
	if (refresh) {
		const btn = toolbar.createDiv({ cls: 'xmind-viewer-open-btn' });
		btn.title = t('ui.refreshThumbnail');
		setIcon(btn, 'refresh-cw');
		btn.addEventListener('click', () => {
			// Spin immediately so there is feedback during the 500ms
			// debounce window; the handler stops it when the refresh
			// finishes. Idempotent across rapid repeated clicks.
			btn.addClass('xmind-viewer-refreshing');
			refresh();
		});
		refreshBtn = btn;
	}

	const openBtn = toolbar.createDiv({ cls: 'xmind-viewer-open-btn' });
	openBtn.title = t('ui.openWithDefaultApp');
	setIcon(openBtn, 'external-link');
	openBtn.addEventListener('click', () => {
		openWithDefaultApp(plugin, file);
	});

	if (plugin.settings.doubleClickOpen) {
		toolbar.addEventListener('dblclick', (e) => {
			// The dblclick-to-open gesture targets the toolbar's empty
			// space (filename area). Double-clicking a toolbar button —
			// e.g. rapidly clicking refresh — must not also launch the
			// external app; buttons own their click semantics.
			if ((e.target as HTMLElement).closest('.xmind-viewer-open-btn')) return;
			openWithDefaultApp(plugin, file);
		});
	}

	return refreshBtn;
}

/**
 * Build the debounced refresh handler for the thumbnail toolbar button.
 *
 * Flow per click (after the debounce window):
 *   1. Force re-read the .xmind file from disk, bypassing the file cache —
 *      this picks up edits Obsidian's vault events may not have detected.
 *   2. Drop the cached thumbnail so renderThumbnail takes the slow path
 *      with the fresh file data, then re-render.
 */
function createThumbnailRefresh(
	plugin: XMindViewerPlugin,
	file: TFile,
	viewerEl: HTMLElement,
	setCleanup: (makeCleanup: () => (() => void)) => void,
	getRefreshBtn: () => HTMLElement | null
): () => void {
	return debounce(500, async () => {
		// The code block may have been unloaded while the debounce was
		// pending — don't resurrect a dead DOM subtree.
		if (!viewerEl.isConnected) {
			getRefreshBtn()?.removeClass('xmind-viewer-refreshing');
			return;
		}
		try {
			const freshData = await plugin.readXmindFile(file, true);
			plugin.invalidateThumbnail(file.path);
			setCleanup(() => renderThumbnail(viewerEl, file, freshData, plugin, {
				viewerHeight: plugin.settings.viewerHeight,
				fileName: file.name,
			}));
		} catch (e) {
			// Refresh failed (e.g. unreadable zip mid-write) — keep the
			// current view rather than replacing it with an error.
			console.error('xmind-pal: thumbnail refresh failed', e);
		} finally {
			getRefreshBtn()?.removeClass('xmind-viewer-refreshing');
		}
	});
}

/** Minimal interface for the undocumented `app.openWithDefaultApp` API. */
interface AppWithDefaultApp {
	openWithDefaultApp?: (path: string) => void;
}

function openWithDefaultApp(plugin: XMindViewerPlugin, file: TFile): void {
	const app = plugin.app as App & AppWithDefaultApp;
	if (typeof app.openWithDefaultApp === 'function') {
		app.openWithDefaultApp(file.path);
	}
}

export function showError(container: HTMLElement, message: string): void {
	const errorEl = container.createDiv({ cls: 'xmind-viewer-error' });
	errorEl.textContent = message;
}

function createLoadingPlaceholder(): HTMLElement {
	const el = createDiv();
	el.className = 'xmind-viewer-loading';

	const spinner = createDiv();
	spinner.className = 'xmind-viewer-spinner';
	el.appendChild(spinner);

	const text = createDiv();
	text.className = 'xmind-viewer-loading-text';
	text.textContent = t('ui.loadingMindMap');
	el.appendChild(text);

	return el;
}
