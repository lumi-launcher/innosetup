import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

export interface CompilerOptions {
    /**
     * Path to the `.iss` script to be compiled by the Inno Setup Compiler.
     */
    scriptPath: string;
    /**
     * Optional path for the Inno Setup Compiler executable (`ISCC.exe`) to use.
     * If not provided, the bundled copy that ships with the package will be
     * used instead.
     */
    compilerPath?: string;
    /**
     * An object of name/value pairs to be passed to the `/D` option.
     *
     * `/D` - Emulate `#define public <name> <value>`
     *
     * If a define's value is `true` or `undefined`, it is treated as a define
     * without an explicit value.
     *
     * If a define's value is `false`, it will be skipped and dropped.
     */
    defines?: Record<string, string | number | boolean | undefined>;
    /**
     * `/O` - Output files to specified path (overrides `OutputDir`).
     */
    outputDir?: string;
    /**
     * `/F` - Specifies an output filename (overrides `OutputBaseFilename`).
     */
    outputBaseName?: string;
    /**
     * `/Q` - Quiet compile (print error messages only).
     */
    quiet?: boolean;
    /**
     * Extra raw arguments to append before the script path.
     */
    extraArgs?: string[];
    /**
     * If true, return error information instead of throwing on non-zero exit.
     */
    noThrow?: boolean;

    /**
     * Optional callback invoked whenever the compiler writes to standard
     * output.
     */
    onStdout?: (data: string) => void;

    /**
     * Optional callback invoked whenever the compiler writes to standard error.
     */
    onStderr?: (data: string) => void;
}

export interface CompilerResult {
    /**
     * The full path to the `ISCC.exe` executable that was invoked.
     */
    command: string;

    /**
     * The list of arguments passed to the compiler executable.
     */
    args: string[];

    /**
     * The process exit code, or `null` if the process failed to start.
     */
    exitCode: number | null;

    /**
     * Captured standard output from the compiler process.
     */
    stdout: string;

    /**
     * Captured standard error output from the compiler process.
     */
    stderr: string;

    /**
     * Whether the compilation was successful (if the exit code is 0).
     */
    success: boolean;
}

export class InnoSetupCompilerError extends Error {
    public readonly result: CompilerResult;

    constructor(message: string, result: CompilerResult) {
        super(message);
        this.name = "InnoSetupCompilerError";
        this.result = result;
    }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_BUNDLED_COMPILER = path.resolve(
    __dirname,
    "..",
    "bin",
    "ISCC.exe",
);

/**
 * Resolves the absolute path to the Inno Setup Compiler (`ISCC.exe`).
 *
 * It first attempts to use an explicitly provided path. If no explicit path is
 * given, it will use the bundled compiler instead.
 *
 * @param explicit - An optional absolute or relative path to the ISCC.exe
 *                   executable. If provided, this path will be validated and
 *                   used.
 * @returns          The absolute path to the ISCC.exe executable.
 */
const resolveCompilerPath = (explicit?: string): string => {
    if (explicit) {
        const normalizedPath = path.resolve(explicit);
        if (!fs.existsSync(normalizedPath))
            throw new Error(`Provided ISCC.exe not found: ${normalizedPath}`);

        return normalizedPath;
    }

    if (fs.existsSync(DEFAULT_BUNDLED_COMPILER)) {
        return DEFAULT_BUNDLED_COMPILER;
    }

    throw new Error(
        `Bundled ISCC.exe not found at ${DEFAULT_BUNDLED_COMPILER}. ` +
            "Download Inno Setup and pass a compilerPath instead.",
    );
};

const buildArguments = (
    options: CompilerOptions & {
        /** Path to the Inno Setup script (`.iss`) file to be compiled. */
        scriptPath: string;
    },
): string[] => {
    const args: string[] = [];

    if (options.quiet) args.push("/Q");
    if (options.outputDir) args.push(`/O${path.resolve(options.outputDir)}`);
    if (options.outputBaseName) args.push(`/F${options.outputBaseName}`);

    if (options.defines) {
        for (let [name, value] of Object.entries(options.defines)) {
            // drop false values (won't be defined)
            if (value === false) continue;

            // no explicit value (use as flags)
            if (value === true) value = undefined;

            // stringify any other types
            if (value !== undefined) value = String(value);
            args.push(value === undefined ? `/D${name}` : `/D${name}=${value}`);
        }
    }

    if (options.extraArgs?.length) args.push(...options.extraArgs);
    args.push(options.scriptPath);
    return args;
};

const ensureDirectoryExists = (target: string): void => {
    const dir = path.resolve(target);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

/**
 * Spawns the Inno Setup compiler process and captures its output.
 *
 * @param command - The absolute path to the `ISCC.exe` executable to run.
 * @param args    - The list of arguments to pass to the compiler.
 * @param noThrow - If `true`, the promise always resolves with a
 *                  {@link CompilerResult}, even on error. If `false`,
 *                  non-zero exit codes or spawn failures cause rejection.
 * @returns       A promise that resolves with {@link CompilerResult} if
 *                successful.
 */
const runCompiler = (
    command: string,
    args: string[],
    noThrow: boolean,
    onStdout?: (data: string) => void,
    onStderr?: (data: string) => void,
): Promise<CompilerResult> => {
    return new Promise<CompilerResult>((resolve, reject) => {
        const child = spawn(command, args, {
            windowsHide: true,
            stdio: ["ignore", "pipe", "pipe"],
        });

        let stdout = "";
        let stderr = "";

        child.stdout?.on("data", (chunk) => {
            const text = chunk.toString();
            stdout += text;
            if (onStdout) onStdout(text);
        });

        child.stderr?.on("data", (chunk) => {
            const text = chunk.toString();
            stderr += text;
            if (onStderr) onStderr(text);
        });

        child.on("error", (error) => {
            const result: CompilerResult = {
                command,
                args,
                exitCode: null,
                stdout,
                stderr: stderr || error.message,
                success: false,
            };
            if (noThrow) {
                resolve(result);
            } else {
                reject(
                    new InnoSetupCompilerError(
                        "Failed to start Inno Setup compiler.",
                        result,
                    ),
                );
            }
        });

        child.on("close", (code) => {
            const result: CompilerResult = {
                command,
                args,
                exitCode: code,
                stdout,
                stderr,
                success: code === 0,
            };

            if (result.success || noThrow) {
                resolve(result);
            } else {
                reject(
                    new InnoSetupCompilerError(
                        `Inno Setup compiler exited with code ${code}`,
                        result,
                    ),
                );
            }
        });
    });
};

/**
 * Compiles an Inno Setup script (`.iss`) using the Inno Setup Compiler.
 *
 * By default, a non-zero exit code or spawn failure causes the returned
 * promise to reject with an {@link InnoSetupCompilerError}. If `noThrow`
 * is set to `true` on {@link CompilerOptions}, the promise instead always
 * resolves with a {@link CompilerResult} instead.
 *
 * @param options - An options object to be passed to the compiler.
 * @returns       A promise that resolves with {@link CompilerResult}.
 * @throws        An {@link InnoSetupCompilerError} when the compiler fails or
 *                exits with a non-zero code if `noThrow` is `false`.
 */
export const compile = (options: CompilerOptions): Promise<CompilerResult> => {
    const scriptPath = path.resolve(options.scriptPath);
    if (!fs.existsSync(scriptPath))
        throw new Error(`Inno Setup script not found: ${scriptPath}`);

    const compilerPath = resolveCompilerPath(options.compilerPath);
    const args = buildArguments({ ...options, scriptPath });

    if (options.outputDir) ensureDirectoryExists(options.outputDir);
    return runCompiler(
        compilerPath,
        args,
        options.noThrow === true,
        options.onStdout,
        options.onStderr,
    );
};
