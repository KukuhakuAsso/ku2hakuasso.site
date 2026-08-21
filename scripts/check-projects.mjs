// scripts/check-projects.mjs
// 读取 projects.json，做“代理分析 + 冲突检测”，供 CI 使用。
// 检测项：
//   1. 必填字段缺失 / 目录不存在
//   2. devPort 重复（含与主站 5173 冲突）
//   3. subPath 重复 / 非法
//   4. proxyApi 前缀重复（跨子项目）
//   5. proxyApi 前缀与任意子项目 subPath 冲突
//   6. proxyApi 前缀相互覆盖（一个前缀是另一个的前缀）
// 硬冲突（2/3/4/5）→ 退出码 1；前缀覆盖（6）→ 仅告警。
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { filterEnabledProjects } from "./local-config.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");
const MAIN_SITE_PORT = 5173; // docs/.vitepress/config.mjs 中 vite.server.port

const projects = JSON.parse(
    fs.readFileSync(path.resolve(ROOT_DIR, "projects.json"), "utf-8"),
);

// ===== 个人本地配置：跳过被禁用的子项目 =====
// 被禁用的子项目不参与冲突检查（见 scripts/local-config.mjs）。
// 配置文件未提交，CI 中不存在时不影响任何检查。
const enabledProjects = filterEnabledProjects(projects);
const disabledProjects = projects.filter((p) => !enabledProjects.includes(p));
if (disabledProjects.length) {
    console.log(
        `⏭️  以下子项目已在个人配置（.repos.local.json）中禁用，跳过检查: ${disabledProjects
            .map((p) => p.name)
            .join(", ")}`,
    );
}

const errors = [];
const warnings = [];
const seenPort = new Map();
const seenSubPath = new Map();
const seenPrefix = new Map(); // prefix -> project name

const REQUIRED = ["name", "dir", "subPath", "outputDir", "devPort"];

for (const p of enabledProjects) {
    const label = p.name || p.dir || "(未命名)";

    // 1. 必填字段
    for (const field of REQUIRED) {
        if (p[field] === undefined || p[field] === null || p[field] === "") {
            errors.push(`[${label}] 缺少必填字段 "${field}"`);
        }
    }

    // 目录存在性
    if (p.dir) {
        const dirPath = path.resolve(ROOT_DIR, p.dir);
        if (!fs.existsSync(dirPath)) {
            errors.push(`[${label}] 目录不存在: ${p.dir}`);
        } else {
            const pkgPath = path.join(dirPath, "package.json");
            if (!fs.existsSync(pkgPath)) {
                errors.push(`[${label}] 缺少 package.json: ${p.dir}/package.json`);
            }
        }
    }

    // 2. devPort 重复
    if (p.devPort !== undefined && p.devPort !== null) {
        if (seenPort.has(p.devPort)) {
            errors.push(
                `[${label}] devPort ${p.devPort} 与 [${seenPort.get(p.devPort)}] 冲突`,
            );
        } else {
            seenPort.set(p.devPort, label);
        }
        if (p.devPort === MAIN_SITE_PORT) {
            warnings.push(
                `[${label}] devPort ${p.devPort} 与主站端口 ${MAIN_SITE_PORT} 相同`,
            );
        }
    }

    // 3. subPath 重复 / 非法
    if (p.subPath) {
        const sp = String(p.subPath);
        if (seenSubPath.has(sp)) {
            errors.push(
                `[${label}] subPath "${sp}" 与 [${seenSubPath.get(sp)}] 冲突`,
            );
        } else {
            seenSubPath.set(sp, label);
        }
        // subPath 允许嵌套（如 mistarg/2anns），只禁止首字符非字母数字
        if (!/^[A-Za-z0-9][A-Za-z0-9_/-]*$/.test(sp)) {
            warnings.push(
                `[${label}] subPath "${sp}" 含特殊字符，建议仅用字母/数字/-/_/ 并以字母或数字开头`,
            );
        }
    }

    // 4/5/6. proxyApi 前缀
    if (Array.isArray(p.proxyApi)) {
        for (const raw of p.proxyApi) {
            const prefix = String(raw);
            if (!prefix.startsWith("/")) {
                errors.push(`[${label}] proxyApi 前缀必须以 "/" 开头: ${prefix}`);
                continue;
            }
            if (seenPrefix.has(prefix)) {
                errors.push(
                    `[${label}] proxyApi "${prefix}" 与 [${seenPrefix.get(prefix)}] 冲突`,
                );
            } else {
                seenPrefix.set(prefix, label);
            }
        }
    }
}

// 5. proxyApi 前缀 与 子项目 subPath 冲突（主站 proxy 表中同键覆盖）
for (const [prefix, name] of seenPrefix) {
    const normalized = prefix.replace(/^\/|\/$/g, "");
    if (normalized && seenSubPath.has(normalized)) {
        errors.push(
            `proxyApi "${prefix}"（[${name}]）与 subPath "${normalized}"（[${seenSubPath.get(normalized)}]）在代理表中冲突`,
        );
    }
}

// 6. 前缀相互覆盖（一个前缀是另一个的前缀，如 /api 与 /api-scf）
const prefixes = [...seenPrefix.keys()];
for (let i = 0; i < prefixes.length; i++) {
    for (let j = i + 1; j < prefixes.length; j++) {
        const a = prefixes[i];
        const b = prefixes[j];
        if (a.startsWith(b) || b.startsWith(a)) {
            warnings.push(
                `proxyApi 前缀 "${a}"（[${seenPrefix.get(a)}]）与 "${b}"（[${seenPrefix.get(b)}]）存在前缀包含关系，可能互相遮蔽`,
            );
        }
    }
}

// 汇总输出
if (enabledProjects.length === 0) {
    warnings.push("projects.json 为空，没有任何子项目注册");
}

const summary = [];
for (const p of enabledProjects) {
    summary.push(
        `  - ${p.name}: dir=${p.dir} port=${p.devPort} subPath=${p.subPath} proxy=[${(p.proxyApi || []).join(", ")}]`,
    );
}
console.log("📋 projects.json 解析结果:");
console.log(summary.join("\n"));

if (warnings.length) {
    console.log(`\n⚠️  告警 (${warnings.length}):`);
    for (const w of warnings) console.log("  " + w);
}
if (errors.length) {
    console.error(`\n❌ 检测到 ${errors.length} 个冲突/错误:`);
    for (const e of errors) console.error("  " + e);
    process.exit(1);
}

console.log("\n✅ 代理与子项目配置无冲突");
