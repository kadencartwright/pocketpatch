#!/usr/bin/env node
import type { ConfigEnv } from "@pocketpatch/config";
import { runPocketPatchCli } from "./runtime";

const readConfigEnv = (): ConfigEnv => ({
  HOME: process.env.HOME,
  XDG_CACHE_HOME: process.env.XDG_CACHE_HOME,
  XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
  XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR,
  XDG_STATE_HOME: process.env.XDG_STATE_HOME,
});

const result = await runPocketPatchCli(process.argv.slice(2), readConfigEnv());

if (result.stdout !== "") {
  process.stdout.write(result.stdout);
}

if (result.stderr !== "") {
  process.stderr.write(result.stderr);
}

process.exitCode = result.exitCode;
