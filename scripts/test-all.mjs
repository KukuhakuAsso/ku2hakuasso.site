// scripts/test-all.mjs
// 遍历 projects.json，运行每个子项目各自的 test 脚本。
// 优先使用 projects.json 中声明的 testCmd，否则读取子项目 package.json 的 scripts.test。
// 无 test 脚本的子项目跳过并告警；任一子项目测试失败则整体退出码非 0。
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { filterEnabledProjects } from "./local-config.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");

const projects = JSON.parse(
    fs.readFileSync(path.resolve(ROOT_DIR, "projects.json"), "utf-8"),
);

// ===== 个人本地配置：跳过被禁用的子项目 =====
// 被禁用的子项目不运行测试（见 scripts/local-config.mjs）。
const enabledProjects = filterEnabledProjects(projects);
const disabledProjects = projects.filter((p) => !enabledProjects.includes(p));
if (disabledProjects.length) {
    console.log(
        `⏭️  以下子项目已在个人配置（.repos.local.json）中禁用，跳过测试: ${disabledProjects
            .map((p) => p.name)
            .join(", ")}`,
    );
}

const results = [];

for (const project of enabledProjects) {
    const label = project.name || project.dir;
    const projectDir = path.resolve(ROOT_DIR, project.dir);
    const pkgPath = path.join(projectDir, "package.json");

    let testCmd = project.testCmd;
    if (!testCmd && fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
        if (pkg.scripts && pkg.scripts.test) {
            testCmd = "pnpm run test";
        }
    }

    if (!testCmd) {
        console.log(`⏭️  [${label}] 未配置测试命令，跳过`);
        results.push({ label, ok: true, skipped: true });
        continue;
    }

    console.log(`\n🧪 [${label}] 运行测试: ${testCmd}`);
    try {
        execSync(testCmd, { cwd: projectDir, stdio: "inherit" });
        results.push({ label, ok: true });
        console.log(`✅ [${label}] 测试通过`);
    } catch {
        results.push({ label, ok: false });
        console.error(`❌ [${label}] 测试失败`);
    }
}

const failed = results.filter((r) => !r.ok);
if (failed.length) {
    console.error(`\n❌ 共 ${failed.length} 个子项目测试失败`);
    process.exit(1);
}
console.log("\n✨ 所有子项目测试通过");
