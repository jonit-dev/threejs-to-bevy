import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export function resolveCargoCommand(): string {
  if (process.env.CARGO !== undefined && process.env.CARGO.length > 0) {
    return process.env.CARGO;
  }
  const stableCargo = join(homedir(), ".rustup/toolchains/stable-x86_64-unknown-linux-gnu/bin/cargo");
  if (existsSync(stableCargo)) {
    return stableCargo;
  }
  return "cargo";
}

export function cargoCaptureEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.RUSTUP_TOOLCHAIN;
  return env;
}
