import { Plugin, TFile, moment } from 'obsidian';
import { XMindViewerSettingTab } from './settings';
import { registerXMindCodeBlock } from './xmind-codeblock';
import { registerXMindComment } from './xmind-comment';
import { setLocale, t } from './i18n';

export interface XMindViewerSettings {
	defaultProperty: string;
	renderMode: 'online' | 'thumbnail';
	region: 'global' | 'cn';
	viewerHeight: string;
	showToolbar: boolean;
	doubleClickOpen: boolean;
	language: 'auto' | 'en' | 'zh';
	preloadViewer: boolean;
}

export const DEFAULT_SETTINGS: XMindViewerSettings = {
	defaultProperty: 'xmind',
	renderMode: 'thumbnail',
	region: 'global',
	viewerHeight: '500px',
	showToolbar: true,
	doubleClickOpen: true,
	language: 'auto',
	preloadViewer: true,
};

interface FileCacheEntry {
	data: ArrayBuffer;
	mtime: number;
}

interface ThumbnailCacheEntry {
	/** Canvas-encoded blob URL (with white background + DPR scaling). */
	url: string;
	mtime: number;
	/** CSS pixel width of the canvas output, used to size the <img>. */
	width: number;
	/** CSS pixel height of the canvas output, used to size the <img>. */
	height: number;
	/** Reference count; entry is freed when it drops to zero. */
	refCount: number;
}

export default class XMindViewerPlugin extends Plugin {
	settings: XMindViewerSettings;
	private fileCache: Map<string, FileCacheEntry> = new Map();
	private readonly MAX_FILE_CACHE = 20;
	private thumbnailCache: Map<string, ThumbnailCacheEntry> = new Map();
	private readonly MAX_THUMBNAIL_CACHE = 20;
	private preloadHandle: number | null = null;
	private preloadIframe: HTMLIFrameElement | null = null;

	async onload() {
		await this.loadSettings();

		this.applyLocale();

		this.addSettingTab(new XMindViewerSettingTab(this.app, this));

		registerXMindCodeBlock(this);
		registerXMindComment(this);

		this.addCommand({
			id: 'insert-xmind-codeblock',
			name: t('command.insertCodeblock'),
			editorCallback: (editor) => {
				editor.replaceSelection('```xmind-pal\n```');
			},
		});

		this.addCommand({
			id: 'insert-xmind-comment',
			name: t('command.insertComment'),
			editorCallback: (editor) => {
				editor.replaceSelection('%%xmind-pal%%');
			},
		});

		// Preload the XMind embed-viewer page so browser caches its JS/HTML/CSS.
		// First-view latency is dominated by iframe resource download; this brings
		// every subsequent file close to "already loaded" speed. The hidden
		// iframe also warms DNS/TLS to the embed service, so no separate
		// <link rel="preconnect"> is needed.
		if (this.settings.preloadViewer && this.settings.renderMode === 'online') {
			// If Obsidian has finished starting up (e.g. plugin enabled manually
			// from settings after launch), preload immediately — idle scheduling
			// may be delayed by background work and leave the first preview blank.
			// During startup, defer to an idle slot to avoid competing for resources.
			if (this.app.workspace.layoutReady) {
				this.preloadViewer();
			} else {
				this.schedulePreloadViewer();
			}
		}

		// Invalidate file cache when xmind files change
		this.registerEvent(this.app.vault.on('modify', (file) => {
			if (file instanceof TFile && file.extension === 'xmind') {
				this.fileCache.delete(file.path);
				this.invalidateThumbnail(file.path);
			}
		}));
		this.registerEvent(this.app.vault.on('delete', (file) => {
			if (file instanceof TFile && file.extension === 'xmind') {
				this.fileCache.delete(file.path);
				this.invalidateThumbnail(file.path);
			}
		}));
		this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
			if (file instanceof TFile && file.extension === 'xmind') {
				this.fileCache.delete(oldPath);
				this.fileCache.delete(file.path);
				this.invalidateThumbnail(oldPath);
				this.invalidateThumbnail(file.path);
			}
		}));
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData()) as XMindViewerSettings;
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	/**
	 * Apply the configured language to the i18n module.
	 * 'auto' follows Obsidian's locale (via moment.locale()), otherwise the
	 * explicitly selected language is used.
	 */
	applyLocale(): void {
		const lang = this.settings.language;
		if (lang === 'auto') {
			setLocale(moment.locale());
		} else {
			setLocale(lang);
		}
	}

	/**
	 * Schedule a preload of the XMind embed-viewer page during an idle slot,
	 * so it doesn't compete with Obsidian's own startup work. Falls back to a
	 * 2s timeout in case no idle slot arrives (e.g. busy vault on launch).
	 */
	schedulePreloadViewer(): void {
		this.clearPreload();
		const run = () => {
			this.preloadHandle = null;
			this.preloadViewer();
		};
		// requestIdleCallback may never fire if the main thread stays busy;
		// the timeout ensures we eventually preload.
		type WindowWithIdle = Window & {
			requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
			cancelIdleCallback?: (handle: number) => void;
		};
		const win = window as WindowWithIdle;
		if (typeof win.requestIdleCallback === 'function') {
			this.preloadHandle = win.requestIdleCallback(run, { timeout: 2000 });
		} else {
			this.preloadHandle = window.setTimeout(run, 2000);
		}
	}

	/**
	 * Create a hidden iframe pointing at the XMind embed-viewer page for the
	 * current region. The iframe loads no file — its only purpose is to make
	 * the browser download and cache the page's JS/HTML/CSS so that the first
	 * real viewer instance is fast.
	 */
	private preloadViewer(): void {
		if (this.preloadIframe) return;
		const domain = this.settings.region === 'cn' ? 'https://www.xmind.cn' : 'https://www.xmind.app';
		const iframe = createEl('iframe');
		iframe.setCssProps({ display: 'none' });
		iframe.setAttribute('aria-hidden', 'true');
		iframe.setAttribute('tabindex', '-1');
		iframe.src = `${domain}/embed-viewer`;
		document.body.appendChild(iframe);
		this.preloadIframe = iframe;
	}

	clearPreload(): void {
		if (this.preloadHandle !== null) {
			type WindowWithIdle = Window & {
				cancelIdleCallback?: (handle: number) => void;
			};
			const win = window as WindowWithIdle;
			if (typeof win.cancelIdleCallback === 'function') {
				win.cancelIdleCallback(this.preloadHandle);
			} else {
				window.clearTimeout(this.preloadHandle);
			}
			this.preloadHandle = null;
		}
		if (this.preloadIframe) {
			this.preloadIframe.remove();
			this.preloadIframe = null;
		}
	}

	onunload(): void {
		this.clearPreload();
	}

	async readXmindFile(file: TFile): Promise<ArrayBuffer> {
		const cached = this.fileCache.get(file.path);
		if (cached && cached.mtime === file.stat.mtime) {
			return cached.data;
		}

		const data = await this.app.vault.readBinary(file);

		// Enforce an LRU-like size cap so opening many different files in one
		// session doesn't grow memory without bound.
		while (this.fileCache.size >= this.MAX_FILE_CACHE) {
			const oldest = this.fileCache.keys().next().value as string | undefined;
			if (oldest === undefined) break;
			this.fileCache.delete(oldest);
		}
		this.fileCache.set(file.path, { data, mtime: file.stat.mtime });
		return data;
	}

	/**
	 * Try to acquire a cached thumbnail blob URL for `file`.
	 *
	 * Returns the cache entry (with refCount already incremented) when a fresh
	 * entry exists, or null when the cache misses. On miss the caller is
	 * responsible for producing the thumbnail and calling `registerThumbnail`.
	 * Stale entries (mtime mismatch) are evicted eagerly.
	 */
	acquireThumbnail(file: TFile): ThumbnailCacheEntry | null {
		const entry = this.thumbnailCache.get(file.path);
		if (!entry) return null;
		if (entry.mtime !== file.stat.mtime) {
			URL.revokeObjectURL(entry.url);
			this.thumbnailCache.delete(file.path);
			return null;
		}
		entry.refCount++;
		return entry;
	}

	/**
	 * Register a freshly produced thumbnail blob URL in the cache. The caller
	 * holds the first reference (refCount = 1). LRU-evicts older entries when
	 * the cap is reached, revoking their blob URLs.
	 */
	registerThumbnail(file: TFile, url: string, width: number, height: number): void {
		// Replace any stale entry for this path (should normally be absent).
		const existing = this.thumbnailCache.get(file.path);
		if (existing) {
			URL.revokeObjectURL(existing.url);
			this.thumbnailCache.delete(file.path);
		}

		while (this.thumbnailCache.size >= this.MAX_THUMBNAIL_CACHE) {
			const oldest = this.thumbnailCache.keys().next().value as string | undefined;
			if (oldest === undefined) break;
			const evicted = this.thumbnailCache.get(oldest);
			if (evicted) URL.revokeObjectURL(evicted.url);
			this.thumbnailCache.delete(oldest);
		}

		this.thumbnailCache.set(file.path, {
			url,
			mtime: file.stat.mtime,
			width,
			height,
			refCount: 1,
		});
	}

	/**
	 * Release a reference to a cached thumbnail. When refCount reaches zero the
	 * blob URL is revoked and the entry is removed.
	 */
	releaseThumbnail(path: string): void {
		const entry = this.thumbnailCache.get(path);
		if (!entry) return;
		entry.refCount--;
		if (entry.refCount <= 0) {
			URL.revokeObjectURL(entry.url);
			this.thumbnailCache.delete(path);
		}
	}

	/**
	 * Drop a cached thumbnail without touching refCount — used when the
	 * underlying file changes, is deleted, or is renamed.
	 */
	private invalidateThumbnail(path: string): void {
		const entry = this.thumbnailCache.get(path);
		if (entry) {
			URL.revokeObjectURL(entry.url);
			this.thumbnailCache.delete(path);
		}
	}
}
