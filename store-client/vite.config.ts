import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // 현재 파일 위치를 기준으로 정확한 절대 경로를 생성하여 연결
      "@mediapipe/pose": fileURLToPath(
        new URL("./src/mock-mediapipe.js", import.meta.url),
      ),
    },
  },
});
