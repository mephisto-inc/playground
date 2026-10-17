import { defineConfig } from "vite";

/*
Build/deploy config. `base: './'` makes every URL the build emits relative
(`./assets/index-*.js`), so the built game works from any folder — repository root, a
nested path like /game/3d-game/, or a GitHub Pages project site — without rebuilding per
location. Runtime asset URLs written in src go through assetUrl() (core/Assets.js), which
applies the same base, so they always stay in sync with this setting.
*/

export default defineConfig({
  base: "./",
});
