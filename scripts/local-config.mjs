// scripts/local-config.mjs
// 个人本地配置读取工具：用于按个人需求「选择性禁用」部分仓库。
//
// 配置文件为根目录下的 .repos.local.json（已加入 .gitignore，不会进入版本库），
// 只影响本机开发/构建/测试，不改变任何远程或共享配置。
//
// 配置文件格式：
// {
//     "disabled": ["main", "vue-TelemetryInstruments"]
// }
//
//   - "main"                           表示禁用主站（VitePress 主项目）
//   - 其余条目按 projects.json 中子项目的 name 或 dir 匹配
//     （如 "TelemetryInstruments" 或 "vue-TelemetryInstruments" 均可）
//
// 被禁用的仓库在 dev / build / proj:dev / test / check:projects 以及
// fork:sync / fork:pr / submodules:update 等子模块同步命令中一律跳过。
// 交互流程中选择「否」（不初始化子模块 / 不创建子仓库 fork）的项目会被自动追加写入本文件。
// 配置文件不存在或 JSON 格式错误时按「全部启用」处理，不影响任何脚本。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(__dirname, "..");

export const CONFIG_FILENAME = ".repos.local.json";
/** 主站（主项目）在配置文件中的固定标识 */
export const MAIN_REPO_ID = "main";

const CONFIG_PATH = path.join(ROOT_DIR, CONFIG_FILENAME);

let cached = null;

/** 读取 projects.json（解析失败返回空数组） */
function loadProjects() {
    try {
        return JSON.parse(
            fs.readFileSync(path.join(ROOT_DIR, "projects.json"), "utf-8"),
        );
    } catch {
        return [];
    }
}

/** 解析本地配置；文件不存在或格式错误时按空配置处理，结果带缓存 */
export function loadLocalConfig() {
    if (cached !== null) return cached;
    try {
        const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
        const list = Array.isArray(raw?.disabled)
            ? raw.disabled.map((s) => String(s).trim()).filter(Boolean)
            : [];
        cached = { disabled: new Set(list), raw };
    } catch {
        cached = { disabled: new Set(), raw: {} };
    }
    return cached;
}

/** 是否禁用了主站（主项目） */
export function isMainDisabled() {
    return loadLocalConfig().disabled.has(MAIN_REPO_ID);
}

/** 判断某个子项目是否被禁用（按 name 或 dir 匹配） */
export function isProjectDisabled(project) {
    const { disabled } = loadLocalConfig();
    return [project?.name, project?.dir].some(
        (id) => id && disabled.has(String(id)),
    );
}

/** 过滤掉被个人配置禁用的子项目 */
export function filterEnabledProjects(projects) {
    return projects.filter((p) => !isProjectDisabled(p));
}

/**
 * 判断某个子模块目录（projects.json 中的 dir / .gitmodules 的 path）是否被禁用。
 * 目录未注册在 projects.json 时按「启用」处理。
 */
export function isDirDisabled(dir) {
    if (!dir) return false;
    const { disabled } = loadLocalConfig();
    if (disabled.has(String(dir))) return true;
    const project = loadProjects().find((p) => p?.dir === dir);
    return project ? isProjectDisabled(project) : false;
}

/** 过滤掉被个人配置禁用的子模块目录列表 */
export function filterEnabledDirs(dirs) {
    return dirs.filter((d) => !isDirDisabled(d));
}

/**
 * 把仓库标识（建议用子模块目录 / projects.json 的 dir）追加写入个人配置的
 * disabled 列表。用于交互流程中选择「否」时自动禁用对应仓库。
 */
export function addDisabledRepos(ids) {
    const list = ids.map((s) => String(s).trim()).filter(Boolean);
    if (list.length === 0) return;
    const { disabled, raw } = loadLocalConfig();
    const next = new Set(disabled);
    let changed = false;
    for (const id of list) {
        if (!next.has(id)) {
            next.add(id);
            changed = true;
        }
    }
    if (!changed) return;
    const nextRaw = { ...raw, disabled: [...next] };
    try {
        fs.writeFileSync(
            CONFIG_PATH,
            `${JSON.stringify(nextRaw, null, 4)}\n`,
            "utf-8",
        );
        cached = { disabled: next, raw: nextRaw };
        console.log(
            `✔ 已将以下仓库写入个人配置（${CONFIG_FILENAME}）: ${list.join("、")}`,
        );
    } catch (e) {
        console.warn(`⚠ 写入个人配置失败：${e.message}`);
    }
}

/**
 * 打印本次被个人配置禁用的仓库汇总。
 * @param {{ projects: Array, mainDisabled?: boolean }} opts
 */
export function printDisabledNotice({ projects, mainDisabled }) {
    const parts = [];
    if (mainDisabled) parts.push(`主站（${MAIN_REPO_ID}）`);
    for (const p of projects) {
        if (isProjectDisabled(p)) parts.push(`${p.name}（${p.dir}）`);
    }
    if (parts.length) {
        console.log(
            `⏭️  个人配置（${CONFIG_FILENAME}）已禁用以下仓库: ${parts.join("、")}`,
        );
    }
}
