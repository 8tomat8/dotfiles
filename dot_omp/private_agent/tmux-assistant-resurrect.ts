import { execSync } from "node:child_process";
import { mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import type { ExtensionAPI, ExtensionContext } from "@oh-my-pi/pi-coding-agent";

const STATE_DIR =
	process.env.TMUX_ASSISTANT_RESURRECT_DIR ||
	`${process.env.XDG_RUNTIME_DIR || process.env.TMPDIR || tmpdir()}/tmux-assistant-resurrect`;
const STATE_FILE = `${STATE_DIR}/omp-${process.pid}.json`;

function captureEnvVars(): string[] {
	try {
		const raw = execSync("tmux show-option -gqv @assistant-resurrect-capture-env 2>/dev/null", {
			encoding: "utf8",
			timeout: 2000,
		}).trim();
		return raw ? raw.split(/\s+/).filter(Boolean) : [];
	} catch {
		return [];
	}
}

function cleanup(): void {
	try {
		unlinkSync(STATE_FILE);
	} catch {
		// File may already be gone.
	}
}

function writeSessionFile(eventType: string, ctx: ExtensionContext): void {
	const sessionID = ctx.sessionManager.getSessionId();
	if (!sessionID) return;

	const env: Record<string, string> = {
		tmux_pane: process.env.TMUX_PANE || "",
		shell: process.env.SHELL || "",
	};
	for (const varName of captureEnvVars()) {
		env[varName] = process.env[varName] || "";
	}

	const model = ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : "";
	const data = JSON.stringify(
		{
			tool: "omp",
			session_id: sessionID,
			pid: process.pid,
			cwd: ctx.sessionManager.getCwd(),
			session_file: ctx.sessionManager.getSessionFile() || "",
			title: ctx.sessionManager.getSessionName() || "",
			model,
			timestamp: new Date().toISOString(),
			event_type: eventType,
			env,
		},
		null,
		2,
	);

	try {
		mkdirSync(STATE_DIR, { recursive: true, mode: 0o700 });
		writeFileSync(STATE_FILE, data);
	} catch {
		// Best-effort tracking must never crash OMP.
	}
}

export default function tmuxAssistantResurrect(pi: ExtensionAPI): void {
	process.on("exit", cleanup);

	pi.on("session_start", (event, ctx) => writeSessionFile(event.type, ctx));
	pi.on("session_switch", (event, ctx) => writeSessionFile(event.type, ctx));
	pi.on("session_branch", (event, ctx) => writeSessionFile(event.type, ctx));
	pi.on("session_tree", (event, ctx) => writeSessionFile(event.type, ctx));
	pi.on("session_compact", (event, ctx) => writeSessionFile(event.type, ctx));
	pi.on("session_shutdown", () => cleanup());
}
