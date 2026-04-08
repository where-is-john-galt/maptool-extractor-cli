import { z } from "zod";

export const MACRO_DEFAULTS = {
  colorKey: "default",
  autoExecute: false,
  group: "",
  applyToTokens: false,
  includeLabel: false,
  sortby: "",
} as const;

const sparseMacroSchema = z
  .object({
    colorKey: z.string().optional(),
    autoExecute: z.boolean().optional(),
    group: z.string().optional(),
    applyToTokens: z.boolean().optional(),
    includeLabel: z.boolean().optional(),
    sortby: z.string().optional(),
    index: z.number().int().optional(),
    label: z.string().optional(),
  })
  .strict();

const tokenEntrySchema = z
  .object({
    id: z.string().optional(),
    overrides: z.record(z.unknown()).optional(),
    macros: z.record(sparseMacroSchema).default({}),
  })
  .strict();

export const manifestSchema = z
  .object({
    schemaVersion: z.number().int().positive(),
    tokens: z.record(tokenEntrySchema).default({}),
    campaign: z
      .object({
        macros: z.record(sparseMacroSchema).default({}),
      })
      .default({ macros: {} }),
    campaignGm: z
      .object({
        macros: z.record(sparseMacroSchema).default({}),
      })
      .optional(),
  })
  .strict();

export type Manifest = z.infer<typeof manifestSchema>;
export type ManifestMacro = z.infer<typeof sparseMacroSchema>;
export type ManifestTokenEntry = z.infer<typeof tokenEntrySchema>;

export function emptyManifest(): Manifest {
  return {
    schemaVersion: 1,
    tokens: {},
    campaign: { macros: {} },
  };
}
