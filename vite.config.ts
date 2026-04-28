import { defineConfig } from "vite";
import { miaodaDevPlugin } from "miaoda-sc-plugin";
import react from "@vitejs/plugin-react";
import svgr from "vite-plugin-svgr";
import path from "path";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    miaodaDevPlugin(),
    svgr({
      svgrOptions: {
        icon: true,
        exportType: "named",
        namedExport: "ReactComponent",
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // 在浏览器环境下用空模块替代 canvas 原生依赖
      "canvas": path.resolve(__dirname, "src/lib/canvas-stub.ts"),
    },
  },
  optimizeDeps: {
    // 让 Vite 预构建 fabric，避免 canvas 原生模块问题
    include: ["fabric"],
    exclude: ["canvas"],
  },
});
