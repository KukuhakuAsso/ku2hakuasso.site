// build-all.js
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ensureProjectsReady } from "./submodule-guard.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");

// ================= 🛠️ 多项目维护表 =================
const projectTable = JSON.parse(
    fs.readFileSync(path.resolve(ROOT_DIR, "projects.json"), "utf-8"),
);

// ✨ 优化：直接将预览总目录生成在项目根目录下，方便管理
const DIST_PREVIEW = path.resolve(ROOT_DIR, "dist-preview");

// ===== 子模块未初始化检测 =====
// 未初始化（gitlink 未 checkout）的子模块目录不存在，构建会直接报错；
// 这里先检测并询问是否初始化，选择「否」的子项目不构建、不合并产物。
// 旗标：--yes / -y 直接初始化；--no-init 直接跳过。
const argv = process.argv.slice(2);
const autoInit = argv.includes("--yes") || argv.includes("-y");
const skipInit = argv.includes("--no-init");

const { ready, skipped } = await ensureProjectsReady(projectTable, {
    autoInit,
    skipInit,
});

try {
    // 1. 清理并创建测试总目录
    if (fs.existsSync(DIST_PREVIEW)) {
        console.log("🧹 正在清理旧的 dist-preview 目录...");
        fs.rmSync(DIST_PREVIEW, { recursive: true, force: true });
    }
    fs.mkdirSync(DIST_PREVIEW, { recursive: true });

    // 2. 构建 VitePress 博客本体
    console.log("📦 正在构建 VitePress 博客...");
    // ✨ 修复：显式指定在 ROOT_DIR 下执行命令，防止找不到 docs 目录
    execSync("pnpm vitepress build docs", { cwd: ROOT_DIR, stdio: "inherit" });

    // 复制博客产物
    const vitepressDist = path.resolve(ROOT_DIR, "docs/.vitepress/dist");
    fs.cpSync(vitepressDist, DIST_PREVIEW, { recursive: true });

    // 3. 动态遍历构建表中的已就绪子项目
    for (const project of ready) {
        console.log(`\n🚀 发现子项目 [${project.name}]，开始构建...`);

        // ✨ 优化：计算出子项目的绝对路径
        const absoluteProjectDir = path.resolve(ROOT_DIR, project.dir);

        // ✨ 使用 projects.json 中声明的 buildCmd，失败时退回默认命令
        const DEFAULT_BUILD_CMD = "pnpm run build";
        const buildCmd = project.buildCmd || DEFAULT_BUILD_CMD;
        try {
            execSync(buildCmd, {
                cwd: absoluteProjectDir,
                stdio: "inherit",
            });
        } catch (err) {
            if (buildCmd !== DEFAULT_BUILD_CMD) {
                console.warn(
                    `⚠ 使用 [${buildCmd}] 构建失败，退回默认命令 [${DEFAULT_BUILD_CMD}]...`,
                );
                execSync(DEFAULT_BUILD_CMD, {
                    cwd: absoluteProjectDir,
                    stdio: "inherit",
                });
            } else {
                throw err;
            }
        }

        // ✨ 关键修复：改用 ROOT_DIR 解析源文件路径，不再误入 scripts 文件夹
        const sourceDir = path.resolve(
            ROOT_DIR,
            project.dir,
            project.outputDir,
        );
        const targetDir = path.resolve(DIST_PREVIEW, project.subPath);

        console.log(
            `🚚 正在将 [${project.name}] 产物合并至 dist-preview/${project.subPath}...`,
        );
        fs.mkdirSync(targetDir, { recursive: true });
        fs.cpSync(sourceDir, targetDir, { recursive: true, force: true });
    }

    console.log(
        "\n✨ 所有项目构建并合并成功！产物位于项目根目录的 /dist-preview",
    );

    // 提示被跳过的未初始化子模块
    if (skipped.length) {
        console.log(
            `ℹ️  已跳过 ${skipped.length} 个未初始化子项目（${skipped
                .map((p) => p.name)
                .join(", ")}），其产物未包含在 dist-preview 中。`,
        );
        console.log(
            "   需要时执行 git submodule update --init，或使用 pnpm run build -- --yes 自动初始化。",
        );
    }
} catch (error) {
    console.error("\n❌ 构建失败:", error);
    process.exit(1);
}
