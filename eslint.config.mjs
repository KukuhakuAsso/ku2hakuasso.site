import js from "@eslint/js";

export default [
    {
        ignores: [
            "**/node_modules/**",
            "dist-preview/**",
            "docs/.vitepress/cache/**",
            "docs/.vitepress/dist/**",
            "docs/.vitepress/theme/**",
            "vue-TelemetryInstruments/output/**",
            "tmp_scripts/**",
            "docs/public/**",
        ],
    },
    js.configs.recommended,
    {
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "module",
            globals: {
                console: "readonly",
                process: "readonly",
                Buffer: "readonly",
                window: "readonly",
                document: "readonly",
                localStorage: "readonly",
                indexedDB: "readonly",
                navigator: "readonly",
                location: "readonly",
                fetch: "readonly",
                crypto: "readonly",
                Audio: "readonly",
                AudioContext: "readonly",
                URL: "readonly",
                Blob: "readonly",
                FileReader: "readonly",
                atob: "readonly",
                btoa: "readonly",
                setTimeout: "readonly",
                clearTimeout: "readonly",
                setInterval: "readonly",
                clearInterval: "readonly",
                requestAnimationFrame: "readonly",
            },
        },
        rules: {
            "no-unused-vars": [
                "warn",
                { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
            ],
            "no-undef": "error",
        },
    },
];
