import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";

export default function colonQ(pi: ExtensionAPI) {
	pi.on("input", async event => {
		if (event.source !== "interactive") return;
		if (event.text.trim() !== ":q") return;

		return { text: "/exit" };
	});
}
