import { packWorkingDir } from "../pack/merge.js";

export async function runPack(workDir: string, outputCmpgn: string): Promise<void> {
  await packWorkingDir(workDir, outputCmpgn);
}
