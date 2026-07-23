import { App, PluginSettingTab, Setting } from 'obsidian';
import XMindViewerPlugin from './main';

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
			.setName('Default property')
			.setDesc('Name of the frontmatter property that contains the xmind file link.')
			.addText(text => text
				.setPlaceholder('xmind')
				.setValue(this.plugin.settings.defaultProperty)
				.onChange(async (value) => {
					this.plugin.settings.defaultProperty = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Render mode')
			.setDesc('Online uses XMind embed service (requires network). Offline parses and renders locally (no network, simpler visual style).')
			.addDropdown(dropdown => dropdown
				.addOption('online', 'Online (XMind embed service)')
				.addOption('offline', 'Offline (local renderer)')
				.setValue(this.plugin.settings.renderMode)
				.onChange(async (value) => {
					this.plugin.settings.renderMode = value as 'online' | 'offline';
					await this.plugin.saveSettings();
					this.display();
				}));

		if (this.plugin.settings.renderMode === 'online') {
			new Setting(containerEl)
				.setName('Region')
				.setDesc('XMind embed service region. Use "cn" for faster loading in mainland China.')
				.addDropdown(dropdown => dropdown
					.addOption('global', 'Global (xmind.app)')
					.addOption('cn', 'China (xmind.cn)')
					.setValue(this.plugin.settings.region)
					.onChange(async (value) => {
						this.plugin.settings.region = value as 'global' | 'cn';
						await this.plugin.saveSettings();
					}));
		}

		new Setting(containerEl)
			.setName('Viewer height')
			.setDesc('CSS height for the embedded viewer.')
			.addText(text => text
				.setPlaceholder('500px')
				.setValue(this.plugin.settings.viewerHeight)
				.onChange(async (value) => {
					this.plugin.settings.viewerHeight = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Show toolbar')
			.setDesc('Display a toolbar above the viewer with the file name and an open-externally button.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showToolbar)
				.onChange(async (value) => {
					this.plugin.settings.showToolbar = value;
					await this.plugin.saveSettings();
					this.display();
				}));

		if (this.plugin.settings.showToolbar) {
			new Setting(containerEl)
				.setName('Double-click to open')
				.setDesc('Double-click the toolbar area to open the xmind file with the default application.')
				.addToggle(toggle => toggle
					.setValue(this.plugin.settings.doubleClickOpen)
					.onChange(async (value) => {
						this.plugin.settings.doubleClickOpen = value;
						await this.plugin.saveSettings();
					}));
		}
	}
}
