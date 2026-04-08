# maptool-extractor-cli

Command-line tool to **unpack** and **repack** MapTool campaign files (`.cmpgn`) so you can edit macros outside the client.

Requires **Node.js 18+**.

## Global install

```bash
npm install -g maptool-extractor-cli
```

After installation, the **`maptool-extractor`** command is on your `PATH` (the npm package name is `maptool-extractor-cli`).

Verify:

```bash
maptool-extractor --help
```

## Typical workflow

1. **Unpack** the campaign into a working directory (default: next to the file, with a `_work` suffix):

   ```bash
   maptool-extractor unpack "/path/to/my-campaign.cmpgn"
   ```

   Optionally pass an output directory:

   ```bash
   maptool-extractor unpack "/path/to/my-campaign.cmpgn" "/path/to/work_dir"
   ```

2. **Edit** macro files in the generated tree (e.g. in a text editor).

3. **Pack** back to `.cmpgn`:

   ```bash
   maptool-extractor pack "/path/to/work_dir" "/path/to/my-campaign_edited.cmpgn"
   ```

   Prefer writing a new file first, verifying in MapTool, then replacing the original.

## Commands

| Command | Description |
|---------|-------------|
| `maptool-extractor unpack <campaign.cmpgn> [outputDir]` | Extracts `.cmpgn` contents into a working directory |
| `maptool-extractor pack <workDir> <output.cmpgn>` | Rebuilds a campaign file from the working directory |
| `maptool-extractor macro list <workDir>` | Lists campaign and token macros in an unpacked directory |

Help for a single command:

```bash
maptool-extractor unpack --help
maptool-extractor pack --help
maptool-extractor macro list --help
```

## Local development (global link)

If you clone the repo instead of installing from npm:

```bash
npm install
npm run build
npm link
```

Then `maptool-extractor` in the shell points at your local build.

## License

MIT
