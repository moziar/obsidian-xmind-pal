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
}

export const DEFAULT_SETTINGS: XMindViewerSettings = {
	defaultProperty: 'xmind',
	renderMode: 'online',
	region: 'global',
	viewerHeight: '500px',
	showToolbar: true,
	doubleClickOpen: true,
	language: 'auto',
};

interface FileCacheEntry {
	data: ArrayBuffer;
	mtime: number;
}

export default class XMindViewerPlugin extends Plugin {
	settings: XMindViewerSettings;
	private fileCache: Map<string, FileCacheEntry> = new Map();

	async onload() {
		await this.loadSettings();

		this.applyLocale();

		this.addSettingTab(new XMindViewerSettingTab(this.app, this));

		registerXMindCodeBlock(this);

		this.addCommand({
			id: 'insert-xmind-codeblock',
			name: t('command.insertCodeblock'),
			editorCallback: (editor) => {
				editor.replaceSelection('```xmind\n```');
			},
		});

		// Warm up DNS/TLS connection to XMind embed service for faster iframe loading
		injectPreconnect(this.settings.region);

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
