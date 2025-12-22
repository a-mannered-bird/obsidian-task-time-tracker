import {App, PluginSettingTab, Setting} from "obsidian";
import TaskTimeTracker from "./main";

export interface TaskTimeTrackerSettings {
	mySetting: string;
}

export const DEFAULT_SETTINGS: TaskTimeTrackerSettings = {
	mySetting: 'default'
}

export class SampleSettingTab extends PluginSettingTab {
	plugin: TaskTimeTracker;

	constructor(app: App, plugin: TaskTimeTracker) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Settings #1')
			.setDesc('It\'s a secret')
			.addText(text => text
				.setPlaceholder('Enter your secret')
				.setValue(this.plugin.settings.mySetting)
				.onChange(async (value) => {
					this.plugin.settings.mySetting = value;
					await this.plugin.saveSettings();
				}));
	}
}
