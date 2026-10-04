import { defineConfig } from "vitepress";
import { RssPlugin } from "vitepress-plugin-rss";
import fs from "fs";
import path from "path";

const ROOT = path.resolve(import.meta.dirname, "../..");
const projects = JSON.parse(
    fs.readFileSync(path.join(ROOT, "projects.json"), "utf-8"),
);

const proxy = {};
projects.forEach((project) => {
    if (project.subPath && project.devPort) {
        proxy[`/${project.subPath}`] = `http://localhost:${project.devPort}`;
    }
    if (Array.isArray(project.proxyApi)) {
        project.proxyApi.forEach((apiPrefix) => {
            // 避免覆盖已存在的相同前缀
            if (!proxy[apiPrefix]) {
                proxy[apiPrefix] = {
                    target: `http://localhost:${project.devPort}`,
                    changeOrigin: true,
                };
            } else {
                console.warn(`代理前缀 "${apiPrefix}" 已被占用，跳过重复添加`);
            }
        });
    }
});

// 1. 从 package.json 中动态读取 name 或 description
const pkg = JSON.parse(fs.readFileSync("./package.json", "utf-8"));

// 2. 或者从系统环境变量中读取（比如多环境部署时很有用）
const dynamicTitle = process.env.RSS_TITLE || pkg.RSS_TITLE || "默认博客";
const dynamicDescription =
    process.env.RSS_DESCRIPTION || pkg.RSS_DESCRIPTION || "默认博客描述";

const hostname = "https://kukuhakuasso.github.io/";

export default defineConfig({
    title: dynamicTitle,
    description: dynamicDescription,
    head: [
        ["link", { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" }],
        ["link", { rel: "icon", type: "image/x-icon", href: "/favicon.ico" }],
    ],
    themeConfig: {
        // https://vitepress.dev/reference/default-theme-config
        nav: [
            { text: "首页", link: "/" },
            // 下拉菜单格式：把所有的谜题或工具聚合在一起
            {
                text: "神秘学研究",
                items: [
                    { text: "公告", link: "/announcement/" },
                    { text: "ARG 谜题档案", link: "/puzzles/" },
                    { text: "神秘学论文", link: "/lore/" },
                    { text: "解谜常用工具", link: "/tools/" },
                ],
            },
            { text: "关于空白", link: "/about" },
        ],

        darkModeSwitchLabel: "夜间模式",
        lightModeSwitchTitle: "切换到浅色模式",
        darkModeSwitchTitle: "切换到深色模式",

        socialLinks: [
            {
                icon: "bilibili",
                link: "https://space.bilibili.com/3706992621258932",
            },
            {
                icon: "github",
                link: "https://github.com/KukuhakuAsso/KukuhakuAsso.github.io",
            },
        ],
    },
    vite: {
        plugins: [
            RssPlugin({
                title: dynamicTitle,
                baseUrl: pkg.baseUrl || hostname,
                description: dynamicDescription || "自动生成的描述",
                filename: "feed.xml",
                filter: (page) => {
                    // 仅当页面路由以 /posts/ 且没有显式设置 rss: false 开头时才包含在 RSS 中
                    return (
                        page.url.startsWith("/posts/") &&
                        page.frontmatter.rss !== false
                    );
                },
            }),
            // dev 模式：子项目 Vite 会改写 /favicon.svg → /子路径/favicon.svg
            // 直接返回主项目 favicon 并禁用缓存
            {
                name: "favicon-rewrite",
                configureServer(server) {
                    const publicDir = path.resolve(import.meta.dirname, "public");
                    server.middlewares.stack.unshift({
                        route: "",
                        handle: (req, res, next) => {
                            const url = req.url || "";
                            for (const p of projects) {
                                if (
                                    p.subPath &&
                                    url.startsWith(`/${p.subPath}/favicon`)
                                ) {
                                    const filename = path.basename(url);
                                    const filePath = path.join(
                                        publicDir,
                                        filename,
                                    );
                                    if (fs.existsSync(filePath)) {
                                        const ext = path.extname(filePath);
                                        res.setHeader(
                                            "Content-Type",
                                            ext === ".svg"
                                                ? "image/svg+xml"
                                                : "image/x-icon",
                                        );
                                        res.setHeader(
                                            "Cache-Control",
                                            "no-cache, no-store, must-revalidate",
                                        );
                                        res.end(fs.readFileSync(filePath));
                                        return;
                                    }
                                }
                            }
                            next();
                        },
                    });
                },
            },
        ],
        // 别名重定向，如果需要更改请同步更改根目录下jsconfig.json以便在IDE中检查路径
        resolve: {
            alias: {
                "@": path.resolve(import.meta.dirname, "."), // 将 @ 映射到 .vitepress 目录
                "@public": path.resolve(import.meta.dirname, "../public"), // vitepress静态资源
                "@components": path.resolve(import.meta.dirname, "./theme/components"), // vitepress组件
                "@layouts": path.resolve(import.meta.dirname, "./theme/layouts"), // vitepress layout
                "@scripts": path.resolve(import.meta.dirname, "./theme/scripts"), // vitepress脚本
                "@styles": path.resolve(import.meta.dirname, "./theme/styles"), // vitepress样式
            },
        },
        server: {
            port: 5173,
            proxy,
        },
    },
});
