import { App, PluginSettingTab, SettingDefinitionItem } from 'obsidian';
import XMindViewerPlugin from './main';
import { t } from './i18n';

export class XMindViewerSettingTab extends PluginSettingTab {
	icon: string = 'chart-network';
	plugin: XMindViewerPlugin;

	constructor(app: App, plugin: XMindViewerPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		const defs: SettingDefinitionItem[] = [
			{
				name: t('settings.language.name'),
				desc: t('settings.language.desc'),
				control: {
					type: 'dropdown',
					key: 'language',
					options: {
						auto: t('settings.language.auto'),
						zh: t('settings.language.zh'),
						en: t('settings.language.en'),
					},
				},
			},
			{
				name: t('settings.defaultProperty.name'),
				desc: t('settings.defaultProperty.desc'),
				control: {
					type: 'text',
					key: 'defaultProperty',
					placeholder: t('settings.defaultProperty.placeholder'),
				},
			},
			{
				name: t('settings.renderMode.name'),
				desc: t('settings.renderMode.desc'),
				control: {
					type: 'dropdown',
					key: 'renderMode',
					options: {
						thumbnail: t('settings.renderMode.thumbnail'),
						online: t('settings.renderMode.online'),
					},
				},
			},
			{
				name: t('settings.region.name'),
				desc: t('settings.region.desc'),
				visible: () => this.plugin.settings.renderMode === 'online',
				control: {
					type: 'dropdown',
					key: 'region',
					options: {
						global: t('settings.region.global'),
						cn: t('settings.region.cn'),
					},
				},
			},
			{
				name: t('settings.preloadViewer.name'),
				desc: t('settings.preloadViewer.desc'),
				visible: () => this.plugin.settings.renderMode === 'online',
				control: {
					type: 'toggle',
					key: 'preloadViewer',
				},
			},
			{
				name: t('settings.viewerHeight.name'),
				desc: t('settings.viewerHeight.desc'),
				control: {
					type: 'text',
					key: 'viewerHeight',
					placeholder: t('settings.viewerHeight.placeholder'),
				},
			},
			{
				name: t('settings.showToolbar.name'),
				desc: t('settings.showToolbar.desc'),
				control: {
					type: 'toggle',
					key: 'showToolbar',
				},
			},
			{
				name: t('settings.doubleClickOpen.name'),
				desc: t('settings.doubleClickOpen.desc'),
				visible: () => this.plugin.settings.showToolbar,
				control: {
					type: 'toggle',
					key: 'doubleClickOpen',
				},
			},
		];
		return defs;
	}

	/**
	 * Persist setting changes and trigger side effects.
	 *
	 * The framework auto-saves for `control` bindings, but we override to
	 * run side effects (locale switch, preload scheduling, visibility
	 * refresh) that the declarative API can't express on its own.
	 */
	async setControlValue(key: string, value: unknown): Promise<void> {
		Object.assign(this.plugin.settings, { [key]: value });
		await this.plugin.saveSettings();

		switch (key) {
			case 'language':
				this.plugin.applyLocale();
				// Rebuild all definitions so t() calls re-evaluate in the new locale.
				this.update();
				break;
			case 'renderMode':
				// Toggle region/preloadViewer visibility without full re-render.
				this.refreshDomState();
				break;
			case 'region':
				// Region change invalidates the preload iframe URL.
				if (this.plugin.settings.preloadViewer) {
					this.plugin.schedulePreloadViewer();
				}
				break;
			case 'preloadViewer':
				if (value) {
					this.plugin.schedulePreloadViewer();
				} else {
					this.plugin.clearPreload();
				}
				break;
			case 'showToolbar':
				// Toggle doubleClickOpen visibility without full re-render.
				this.refreshDomState();
				break;
		}
	}
}
