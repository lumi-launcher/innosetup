# @lumi-launcher/innosetup

A small Node.js library written in TypeScript that provides a modern wrapper around the Inno Setup compiler (`ISCC.exe`).

Because the Inno Setup Compiler is only available for Windows, support for other platforms is untested, behavior may vary.

### Why not use existing [innosetup](https://www.npmjs.com/package/innosetup) package instead?

While it works, it is based on a dated callback API and lacks TypeScript support. This library implements a newer TypeScript-compatible Promise-based approach that newer projects can benefit from.

If TypeScript support is not a priority for you, and you're fine with the older callback-based API, you may consider using the [innosetup](https://www.npmjs.com/package/innosetup) package instead.

## Installation

Install as usual with your package manager of choice.

To install `@lumi-launcher/innosetup` as a `devDependency` using pnpm:

```sh
pnpm i --save-dev @lumi-launcher/innosetup
```

## Usage

```ts
import { compile } from "@lumi-launcher/innosetup";

async function buildInstaller() {
    const result = await compile({
        scriptPath: "./installer/setup.iss",
        outputDir: "./dist",
        quiet: true,
        defines: {
            MyAppName: "My Program",
            MyAppVersion: "1.5",
        },
    });

    if (!result.success) {
        console.error("Compilation failed:");
        console.error(result.stderr);
        process.exit(1);
    }

    console.log("Installer built successfully!");
    console.log("Compiler output:", result.stdout);
}
```

## API

### `compile(options: CompilerOptions): Promise<CompilerResult>`

Compiles an Inno Setup script (`.iss`) using the Inno Setup Compiler.

### `CompilerOptions`

- `scriptPath: string` – path to a `.iss` file
- `compilerPath?: string` – optional path to a custom `ISCC.exe`
- `defines?: Record<string, string | number | boolean | undefined>` – passed as `/D`
- `outputDir?: string` – passed as `/O`
- `outputBaseName?: string` – passed as `/F`
- `quiet?: boolean` – passed as `/Q`
- `extraArgs?: string[]` – raw arguments passed to ISCC
- `noThrow?: boolean` – resolve instead of throwing on non-zero exit

### `CompilerResult`

- `command` – resolved path to the invoked compiler
- `args` – full argument list
- `exitCode` – exit code or `null`
- `stdout` / `stderr` – captured output
- `success` – whether `exitCode === 0`

## Versioning

Unlike [innosetup](https://www.npmjs.com/package/innosetup) package, `@lumi-launcher/innosetup` uses individual versioning. However, major and minor updates will be released accordingly when updating the bundled Inno Setup Compiler, signaling when breaking changes occur.

## License & Acknowledgements

This library is licensed under the [MIT](LICENSE) license.

A copy of the Inno Setup Compiler is bundled and redistributed under its original license terms.

- For more information on the Inno Setup license, see [`bin/license.txt`](bin/license.txt).
- If you plan to use Inno Setup commercially, consider purchasing a commercial license. For information on Inno Setup commercial licenses, see https://jrsoftware.org/isorder.php.
