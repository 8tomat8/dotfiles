import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { homedir } from "node:os";

type PrefixChoice = "model" | "compact" | "tuicr" | undefined;

const OPT_X_RAW = "≈";

class OptXPrefixPrompt {
	private readonly done: (choice: PrefixChoice) => void;

	constructor(done: (choice: PrefixChoice) => void) {
		this.done = done;
	}

	render(): readonly string[] {
		return ["Opt+X prefix: m model | c compact | t tuicr | Esc cancel"];
	}

	handleInput(data: string): void {
		if (data === "\x1b" || data === "\x03") {
			this.done(undefined);
			return;
		}

		switch (data.toLowerCase()) {
			case "m":
				this.done("model");
				return;
			case "c":
				this.done("compact");
				return;
			case "t":
				this.done("tuicr");
				return;
		}
	}
}

function reportPrefixError(ctx: ExtensionContext, error: unknown): void {
	ctx.ui.notify(`Opt+X shortcut failed: ${error instanceof Error ? error.message : String(error)}`, "error");
}

async function runPrefix(pi: ExtensionAPI, ctx: ExtensionContext | ExtensionCommandContext): Promise<void> {
	if (!ctx.hasUI) return;

	const choice = await ctx.ui.custom<PrefixChoice>(
		(_tui, _theme, _keybindings, done) => new OptXPrefixPrompt(done),
	);

	if (choice === "model") {
		const models = ctx.models.list();
		if (models.length === 0) {
			ctx.ui.notify("No available models", "warning");
			return;
		}

		const labels = new Map<string, (typeof models)[number]>();
		const current = ctx.models.current();
		const options = models.map(model => {
			const label = `${model.provider}/${model.id}`;
			labels.set(label, model);
			return {
				label,
				description: current?.provider === model.provider && current.id === model.id ? "current" : undefined,
			};
		});
		const selected = await ctx.ui.select("Select model", options);
		if (!selected) return;

		const model = labels.get(selected);
		if (!model) return;

		if (await pi.setModel(model)) {
			ctx.ui.notify(`Model set to ${selected}`, "info");
		} else {
			ctx.ui.notify(`No credentials for ${selected}`, "warning");
		}
		return;
	}

	if (choice === "compact") {
		if ("waitForIdle" in ctx) await ctx.waitForIdle();
		await ctx.compact();
	}

	if (choice === "tuicr") {
		// Extensions can't dispatch slash commands (`sendUserMessage("/tuicr")` reaches the
		// model as text), so borrow the handler pi-tuicr registers for `/tuicr`. Dynamic
		// import: the plugin lives in OMP's plugin dir under $HOME, not a static specifier.
		// ponytail: relies on pi-tuicr's default export registering a command; breaks if it stops
		const tuicr = await import(`${homedir()}/.omp/plugins/node_modules/@joelazar/pi-tuicr/index.ts`);
		type Handler = (args: string, ctx: ExtensionContext) => Promise<void>;
		const captured: { handler?: Handler } = {};
		tuicr.default({
			registerCommand: (_name: string, cmd: { handler: Handler }) => (captured.handler = cmd.handler),
			registerShortcut() {},
		});
		if (!captured.handler) throw new Error("pi-tuicr registered no /tuicr command");
		await captured.handler("", ctx);
	}
}

export default function opencodePrefixShortcuts(pi: ExtensionAPI): void {
	let prefixOpen = false;

	const runPrefixOnce = (ctx: ExtensionContext | ExtensionCommandContext): void => {
		if (prefixOpen) return;
		prefixOpen = true;
		void runPrefix(pi, ctx)
			.catch(error => reportPrefixError(ctx, error))
			.finally(() => {
				prefixOpen = false;
			});
	};

	pi.on("session_start", (_event, ctx) => {
		if (!ctx.hasUI) return;
		ctx.ui.onTerminalInput(data => {
			if (data !== OPT_X_RAW) return undefined;
			runPrefixOnce(ctx);
			return { consume: true };
		});
	});

	pi.registerShortcut("alt+x", {
		description: "Open opencode-style Opt+X prefix shortcuts",
		handler: runPrefixOnce,
	});

	pi.registerShortcut("ctrl+alt+x", {
		description: "Open opencode-style Ctrl+Opt+X prefix shortcuts",
		handler: runPrefixOnce,
	});
}
