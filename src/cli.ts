#!/usr/bin/env node
import path from "node:path";

import { Command } from "commander";

import { runMacroList } from "./commands/macro-list.js";
import { runPack } from "./commands/pack.js";
import { runUnpack } from "./commands/unpack.js";

async function main(): Promise<void> {
  const program = new Command();
  program
    .name("maptool-extractor")
    .description("MapTool .cmpgn macro unpack/pack CLI")
    .version("0.1.0");

  program
    .command("unpack")
    .description("Extract a .cmpgn into a working directory for macro editing")
    .argument("<campaign>", "path to campaign.cmpgn")
    .argument("[outputDir]", "output directory (default: <campaign-base>_work)")
    .action(async (campaign: string, outputDir?: string) => {
      const out =
        outputDir ??
        path.join(path.dirname(campaign), `${path.basename(campaign, path.extname(campaign))}_work`);
      await runUnpack(campaign, out);
      console.error(`Unpacked to ${out}`);
    });

  program
    .command("pack")
    .description("Reassemble a working directory into a .cmpgn file")
    .argument("<workDir>", "working directory from unpack")
    .argument("<output>", "path to output .cmpgn")
    .action(async (workDir: string, output: string) => {
      await runPack(workDir, output);
      console.error(`Wrote ${output}`);
    });

  const macro = program.command("macro").description("Inspect unpacked macros");
  macro
    .command("list")
    .description("List campaign and token macros for a working directory")
    .argument("<workDir>", "working directory")
    .action(async (workDir: string) => {
      await runMacroList(workDir);
    });

  await program.parseAsync(process.argv);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
