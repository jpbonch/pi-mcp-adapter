import { existsSync } from "node:fs";
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";
import { join, dirname } from "node:path";
import { platform } from "node:os";
import { createRequire } from "node:module";

// Resolve the Swift glimpse binary at first use. We spawn it directly via stdio
// instead of routing through glimpseui's glimpse.mjs wrapper, so embedders only
// need to ship the single Swift binary — no sibling .mjs files required.

let glimpseAvailable: boolean | null = null;
let resolvedBinaryPath: string | null = null;

export function isGlimpseAvailable(): boolean {
  if (glimpseAvailable !== null) return glimpseAvailable;

  if (platform() !== "darwin") {
    glimpseAvailable = false;
    return false;
  }

  resolvedBinaryPath = getGlimpseBinaryPath();
  glimpseAvailable = resolvedBinaryPath !== null;
  return glimpseAvailable;
}

function getGlimpseBinaryPath(): string | null {
  const envOverride = process.env.GLIMPSE_BINARY || process.env.GLIMPSE_BINARY_PATH;
  if (envOverride && existsSync(envOverride)) return envOverride;

  // Local node_modules (dev path)
  try {
    const require = createRequire(import.meta.url);
    const glimpseuiEntry = require.resolve("glimpseui");
    const binaryPath = join(dirname(glimpseuiEntry), "glimpse");
    if (existsSync(binaryPath)) return binaryPath;
  } catch {}

  // Global npm install
  try {
    const globalRoot = execFileSync("npm", ["root", "-g"], { encoding: "utf-8" }).trim();
    const binaryPath = join(globalRoot, "glimpseui", "src", "glimpse");
    if (existsSync(binaryPath)) return binaryPath;
  } catch {}

  return null;
}

type GlimpseOptions = {
  title: string;
  width?: number;
  height?: number;
  onClosed: () => void;
};

type GlimpseHandle = {
  close: () => void;
};

export async function openGlimpseWindow(html: string, options: GlimpseOptions): Promise<GlimpseHandle> {
  const binary = resolvedBinaryPath ?? getGlimpseBinaryPath();
  if (!binary) {
    throw new Error("Glimpse binary not found. Set GLIMPSE_BINARY or install glimpseui.");
  }

  const args: string[] = [];
  if (options.width != null) args.push("--width", String(options.width));
  if (options.height != null) args.push("--height", String(options.height));
  args.push("--title", options.title);

  const proc: ChildProcess = spawn(binary, args, { stdio: ["pipe", "pipe", "inherit"] });
  const stdin = proc.stdin!;
  const stdout = proc.stdout!;
  stdin.on("error", () => {}); // swallow EPIPE if native exits first

  let active = true;
  let closed = false;
  const fireClosed = () => {
    if (closed) return;
    closed = true;
    if (active) {
      active = false;
      options.onClosed();
    }
  };

  const rl = createInterface({ input: stdout, crlfDelay: Infinity });
  rl.on("line", (line) => {
    let msg: { type?: string };
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }
    if (msg.type === "ready") {
      // Swift host is up; send the HTML (protocol expects base64).
      const encoded = Buffer.from(html, "utf8").toString("base64");
      stdin.write(JSON.stringify({ type: "html", html: encoded }) + "\n");
    } else if (msg.type === "closed") {
      fireClosed();
    }
  });
  proc.on("exit", fireClosed);
  proc.on("error", fireClosed);

  return {
    close: () => {
      if (!active) return;
      active = false;
      try {
        stdin.write(JSON.stringify({ type: "close" }) + "\n");
      } catch {}
    },
  };
}
