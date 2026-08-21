import { execFileSync, spawn } from "node:child_process";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const rootDir = resolve(import.meta.dirname, "..");
const previewDir = join(rootDir, "dist-preview");
const tempDir = mkdtempSync(join(tmpdir(), "ku2hakuasso-dist-"));
rmSync(tempDir, { recursive: true, force: true });
let worktreeAdded = false;

try {
    console.log("📥 正在 fetch origin/dist...");
    execFileSync("git", ["fetch", "origin", "dist"], {
        cwd: rootDir,
        stdio: "inherit",
    });

    console.log("📂 正在从本地 FETCH_HEAD 创建临时 worktree...");
    execFileSync(
        "git",
        ["worktree", "add", "--detach", tempDir, "FETCH_HEAD"],
        { cwd: rootDir, stdio: ["ignore", "ignore", "inherit"] },
    );
    worktreeAdded = true;
    rmSync(previewDir, { recursive: true, force: true });
    cpSync(tempDir, previewDir, { recursive: true });
    rmSync(join(previewDir, ".git"), { recursive: true, force: true });
    console.log("✅ dist-preview 已更新，启动预览服务器...");

    const previewCommand = process.platform === "win32" ? "cmd.exe" : "pnpm";
    const previewArgs =
        process.platform === "win32"
            ? ["/d", "/s", "/c", "pnpm run preview"]
            : ["run", "preview"];
    const preview = spawn(previewCommand, previewArgs, {
        cwd: rootDir,
        stdio: "inherit",
    });

    process.on("SIGINT", () => preview.kill("SIGINT"));
    process.on("SIGTERM", () => preview.kill("SIGTERM"));

    await new Promise((resolvePromise, reject) => {
        preview.once("error", reject);
        preview.once("exit", (code, signal) => {
            if (signal) {
                resolvePromise();
            } else if (code === 0) {
                resolvePromise();
            } else {
                reject(new Error(`preview 退出，状态码 ${code}`));
            }
        });
    });
} finally {
    if (worktreeAdded) {
        execFileSync("git", ["worktree", "remove", "--force", tempDir], {
            cwd: rootDir,
            stdio: ["ignore", "ignore", "inherit"],
        });
    }
    rmSync(tempDir, { recursive: true, force: true });
}
