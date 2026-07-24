import { Plugin, TFile, moment } from 'obsidian';
import { XMindViewerSettingTab } from './settings';
import { registerXMindCodeBlock } from './xmind-codeblock';
import { setLocale, t } from './i18n';

export interface XMindViewerSettings {
	defaultProperty: string;
	renderMode: 'online' | 'offline';
	region: 'global' | 'cn';
	viewerHeight: string;
	showToolbar: boolean;
	doubleClickOpen: boolean;
	language: 'auto' | 'en' | 'zh';
	preloadViewer: boolean;
}

export const DEFAULT_SETTINGS: XMindViewerSettings = {
	defaultProperty: 'xmind',
	renderMode: 'online',
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

export default class XMindViewerPlugin extends Plugin {
	settings: XMindViewerSettings;
	private fileCache: Map<string, FileCacheEntry> = new Map();
	private preloadHandle: number | null = null;
	private preloadIframe: HTMLIFrameElement | null = null;

	async onload() {
		await this.loadSettings();

		this.applyLocale();

		this.addSettingTab(new XMindViewerSettingTab(this.app, this));

		registerXMindCodeBlock(this);

		this.addCommand({
			id: 'insert-xmind-codeblock',
			name: t('command.insertCodeblock'),
			editorCallback: (editor) => {
				editor.replaceSelection('```xmind-pal\n```');
			},
		});

		// Warm up DNS/TLS connection to XMind embed service for faster iframe loading
		injectPreconnect(this.settings.region);

		// Preload the XMind embed-viewer page so browser caches its JS/HTML/CSS.
		// First-view latency is dominated by iframe resource download; this brings
		// every subsequent file close to "already loaded" speed.
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
			}
		}));
		this.registerEvent(this.app.vault.on('delete', (file) => {
			if (file instanceof TFile && file.extension === 'xmind') {
				this.fileCache.delete(file.path);
			}
		}));
		this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
			if (file instanceof TFile && file.extension === 'xmind') {
				this.fileCache.delete(oldPath);
				this.fileCache.delete(file.path);
			}
		}));
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
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
		const ric = (window as any).requestIdleCallback as
			| ((cb: () => void, opts?: { timeout: number }) => number)
			| undefined;
		if (ric) {
			this.preloadHandle = ric(run, { timeout: 2000 });
		} else {
			this.preloadHandle = window.setTimeout(run, 2000) as unknown as number;
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
		const iframe = document.createElement('iframe');
		iframe.style.display = 'none';
		iframe.setAttribute('aria-hidden', 'true');
		iframe.setAttribute('tabindex', '-1');
		iframe.src = `${domain}/embed-viewer`;
		document.body.appendChild(iframe);
		this.preloadIframe = iframe;
	}

	clearPreload(): void {
		if (this.preloadHandle !== null) {
			const cic = (window as any).cancelIdleCallback as
				| ((handle: number) => void)
				| undefined;
			if (cic) {
				cic(this.preloadHandle);
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
		this.fileCache.set(file.path, { data, mtime: file.stat.mtime });
		return data;
	}
}

/**
 * Inject <link rel="preconnect"> to warm up DNS/TLS connection to the XMind embed service.
 * This reduces latency when the first iframe is created.
 */
function injectPreconnect(region: 'global' | 'cn'): void {
	const domain = region === 'cn' ? 'https://www.xmind.cn' : 'https://www.xmind.app';
	if (document.head.querySelector(`link[rel="preconnect"][href="${domain}"]`)) return;
	const link = document.createElement('link');
	link.rel = 'preconnect';
	link.href = domain;
	document.head.appendChild(link);
}
