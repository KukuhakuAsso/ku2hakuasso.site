// https://vitepress.dev/guide/custom-theme
import { h } from "vue";
import DefaultTheme from "vitepress/theme";
import "./style.css";
import "./styles/home-entrance-motion.css";
import "./styles/wiki-content.css";
import HiddenText from "./components/HiddenText.vue";
import PostList from "./layouts/PostList.vue";
import Tags from "./components/Tags.vue";
import Author from "./components/Author.vue";
import HeaderBrandIcon from "./components/HeaderBrandIcon.vue";
import CursorRevealedBackground from "./components/CursorRevealedBackground.vue";
import WikiTable from "./components/WikiTable.vue";
import ColumnList from "./components/ColumnList.vue";
import Cb from "./components/Cb.vue";
import AfdianSupporters from "./components/AfdianSupporters.vue";

/** @type {import('vitepress').Theme} */
export default {
  extends: DefaultTheme,
  Layout: () => {
    return h(DefaultTheme.Layout, null, {
      "layout-top": () => h(CursorRevealedBackground),
      "nav-bar-title-before": () => h(HeaderBrandIcon),
      "doc-before": () => h(Author),
      "doc-footer-before": () => h(Tags),

      // https://vitepress.dev/guide/extending-default-theme#layout-slots
    });
  },
  enhanceApp({ app, router, siteData }) {
    app.component("HiddenText", HiddenText);
    app.component("PostList", PostList);
    app.component("WikiTable", WikiTable);
    app.component("ColumnList", ColumnList);
    app.component("cb", Cb);
    app.component("AfdianSupporters", AfdianSupporters);
    // —— 跨域名数据迁移：从旧域名通过 URL 参数 _migrate 携带数据迁移到新域名 ——
    // 确保只在客户端执行 (Vitepress 构建时也会跑这里，没有 window 对象会报错)
    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      const migrateDataString = urlParams.get("_migrate");

      if (migrateDataString) {
        try {
          const migrateData = JSON.parse(decodeURIComponent(migrateDataString));
          Object.keys(migrateData).forEach((key) => {
            localStorage.setItem(key, migrateData[key]);
          });

          urlParams.delete("_migrate");
          const newSearch = urlParams.toString()
            ? "?" + urlParams.toString()
            : "";
          // 归一化路径：防止双斜杠（如 //vue-telemetry/）被 replaceState 误解析为跨域 URL
          const cleanPath = window.location.pathname.replace(/\/+/g, "/");
          const cleanUrl = cleanPath + newSearch + window.location.hash;
          window.history.replaceState({}, "", cleanUrl);
        } catch (e) {
          console.error("Vitepress 同步数据失败", e);
        }
      }
    }
  },
};
