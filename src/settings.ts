import { App, PluginSettingTab, Setting } from 'obsidian';
import XMindViewerPlugin from './main';
import { t } from './i18n';

export class XMindViewerSettingTab extends PluginSettingTab {
	plugin: XMindViewerPlugin;

	constructor(app: App, plugin: XMindViewerPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName(t('settings.language.name'))
			.setDesc(t('settings.language.desc'))
			.addDropdown(dropdown => dropdown
				.addOption('auto', t('settings.language.auto'))
				.addOption('zh', t('settings.language.zh'))
				.addOption('en', t('settings.language.en'))
				.setValue(this.plugin.settings.language)
				.onChange(async (value) => {
					this.plugin.settings.language = value as 'auto' | 'en' | 'zh';
					await this.plugin.saveSettings();
					this.plugin.applyLocale();
					this.display();
				}));

		new Setting(containerEl)
			.setName(t('settings.defaultProperty.name'))
			.setDesc(t('settings.defaultProperty.desc'))
			.addText(text => text
				.setPlaceholder(t('settings.defaultProperty.placeholder'))
				.setValue(this.plugin.settings.defaultProperty)
				.onChange(async (value) => {
					this.plugin.settings.defaultProperty = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName(t('settings.renderMode.name'))
			.setDesc(t('settings.renderMode.desc'))
			.addDropdown(dropdown => dropdown
				.addOption('thumbnail', t('settings.renderMode.thumbnail'))
				.addOption('online', t('settings.renderMode.online'))
				.setValue(this.plugin.settings.renderMode)
				.onChange(async (value) => {
					this.plugin.settings.renderMode = value as 'online' | 'thumbnail';
					await this.plugin.saveSettings();
					this.display();
				}));

		if (this.plugin.settings.renderMode === 'online') {
			new Setting(containerEl)
				.setName(t('settings.region.name'))
				.setDesc(t('settings.region.desc'))
				.addDropdown(dropdown => dropdown
					.addOption('global', t('settings.region.global'))
					.addOption('cn', t('settings.region.cn'))
					.setValue(this.plugin.settings.region)
					.onChange(async (value) => {
						this.plugin.settings.region = value as 'global' | 'cn';
						await this.plugin.saveSettings();
						// Region changes the iframe URL — re-preload if enabled
						if (this.plugin.settings.preloadViewer) {
							this.plugin.schedulePreloadViewer();
						}
					}));

			new Setting(containerEl)
				.setName(t('settings.preloadViewer.name'))
				.setDesc(t('settings.preloadViewer.desc'))
				.addToggle(toggle => toggle
					.setValue(this.plugin.settings.preloadViewer)
					.onChange(async (value) => {
						this.plugin.settings.preloadViewer = value;
						await this.plugin.saveSettings();
						if (value) {
							this.plugin.schedulePreloadViewer();
						} else {
							this.plugin.clearPreload();
						}
					}));
		}

		new Setting(containerEl)
			.setName(t('settings.viewerHeight.name'))
			.setDesc(t('settings.viewerHeight.desc'))
			.addText(text => text
				.setPlaceholder(t('settings.viewerHeight.placeholder'))
				.setValue(this.plugin.settings.viewerHeight)
				.onChange(async (value) => {
					this.plugin.settings.viewerHeight = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName(t('settings.showToolbar.name'))
			.setDesc(t('settings.showToolbar.desc'))
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showToolbar)
				.onChange(async (value) => {
					this.plugin.settings.showToolbar = value;
					await this.plugin.saveSettings();
					this.display();
				}));

		if (this.plugin.settings.showToolbar) {
			new Setting(containerEl)
				.setName(t('settings.doubleClickOpen.name'))
				.setDesc(t('settings.doubleClickOpen.desc'))
				.addToggle(toggle => toggle
					.setValue(this.plugin.settings.doubleClickOpen)
					.onChange(async (value) => {
						this.plugin.settings.doubleClickOpen = value;
						await this.plugin.saveSettings();
					}));
		}
	}
}
