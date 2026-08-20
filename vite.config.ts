import { defineConfig } from "vite-plus";

const toolingIgnorePatterns = [
  ".agent/**",
  ".agents/**",
  ".claude/**",
  ".codex/**",
  ".continue/**",
  ".cursor/**",
  ".gemini/**",
  ".opencode/**",
  ".pi/**",
  ".roo/**",
  ".windsurf/**",
  "tools/oxlint/anti-slop/**",
];

export default defineConfig({
  test: {
    projects: ["apps/api/vitest.config.ts"],
  },
  staged: {
    "*": "vp check --fix",
  },
  fmt: {
    ignorePatterns: ["apps/desktop/src/routeTree.gen.ts", ...toolingIgnorePatterns],
  },
  lint: {
    jsPlugins: [
      { name: "vite-plus", specifier: "vite-plus/oxlint-plugin" },
      { name: "anti-slop", specifier: "./tools/oxlint/anti-slop/index.ts" },
      {
        name: "react-you-might-not-need-an-effect",
        specifier: "eslint-plugin-react-you-might-not-need-an-effect",
      },
    ],
    rules: {
      "anti-slop/no-chained-type-assertions": "error",
      "anti-slop/no-conditional-empty-object-spread": "error",
      "anti-slop/no-known-value-widening": "error",
      "anti-slop/no-module-mocking": "error",
      "anti-slop/no-object-parameters": "error",
      "anti-slop/no-reflect-apply": "error",
      "anti-slop/no-reflect-get": "error",
      "anti-slop/no-runtime-typeof": "error",
      "anti-slop/no-shape-in-symbol-names": "error",
      "anti-slop/no-unknown-parameters": "error",
      "anti-slop/no-unknown-returns": "error",
      "anti-slop/no-unknown-type-aliases": "error",
      "anti-slop/no-unsafe-dictionary-type": "error",
      "anti-slop/no-widen-then-assert": "error",
      "anti-slop/require-safety-comment-for-type-assertion": "error",
      "react-you-might-not-need-an-effect/no-adjust-state-on-prop-change": "error",
      "react-you-might-not-need-an-effect/no-chain-state-updates": "error",
      "react-you-might-not-need-an-effect/no-derived-state": "error",
      "react-you-might-not-need-an-effect/no-event-handler": "error",
      "react-you-might-not-need-an-effect/no-external-store-subscription": "error",
      "react-you-might-not-need-an-effect/no-initialize-state": "error",
      "react-you-might-not-need-an-effect/no-pass-data-to-parent": "error",
      "react-you-might-not-need-an-effect/no-pass-live-state-to-parent": "error",
      "react-you-might-not-need-an-effect/no-reset-all-state-on-prop-change": "error",
      "vite-plus/prefer-vite-plus-imports": "error",
    },
    options: { typeAware: true, typeCheck: true },
    ignorePatterns: ["apps/desktop/src/routeTree.gen.ts", ...toolingIgnorePatterns],
  },
});
