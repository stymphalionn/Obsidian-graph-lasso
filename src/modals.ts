import { App, Modal, Setting, TextComponent } from "obsidian";

export class TextPromptModal extends Modal {
	result: string | null = null;

	constructor(
		app: App,
		readonly title: string,
		readonly placeholder: string,
		readonly initial = "",
		readonly onSubmit: (value: string) => Promise<void> | void,
	) {
		super(app);
	}

	onOpen(): void {
		this.titleEl.setText(this.title);
		let text: TextComponent;
		new Setting(this.contentEl).addText((t) => {
			text = t;
			t.setPlaceholder(this.placeholder);
			t.setValue(this.initial);
		});
		new Setting(this.contentEl).addButton((b) =>
			b.setButtonText("Cancel").onClick(() => {
				this.result = null;
				this.close();
			}),
		);
		new Setting(this.contentEl).addButton((b) =>
			b
				.setButtonText("OK")
				.setCta()
				.onClick(async () => {
					const v = text!.getValue().trim();
					this.result = v;
					await this.onSubmit(v);
					this.close();
				}),
		);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

export class TwoFieldPromptModal extends Modal {
	constructor(
		app: App,
		readonly title: string,
		readonly labelA: string,
		readonly labelB: string,
		readonly onSubmit: (a: string, b: string) => Promise<void> | void,
	) {
		super(app);
	}

	onOpen(): void {
		this.titleEl.setText(this.title);
		let ta!: TextComponent;
		let tb!: TextComponent;
		new Setting(this.contentEl).setName(this.labelA).addText((t) => (ta = t));
		new Setting(this.contentEl).setName(this.labelB).addText((t) => (tb = t));
		new Setting(this.contentEl).addButton((btn) =>
			btn.setButtonText("Cancel").onClick(() => this.close()),
		);
		new Setting(this.contentEl).addButton((btn) =>
			btn
				.setButtonText("OK")
				.setCta()
				.onClick(async () => {
					await this.onSubmit(ta.getValue().trim(), tb.getValue().trim());
					this.close();
				}),
		);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
