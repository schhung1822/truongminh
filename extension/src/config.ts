/** Địa chỉ webapp và phiên bản, gắn cứng lúc build (xem extension/build.mjs: biến APP_ORIGIN và version trong manifest). */
declare const __APP_ORIGIN__: string | undefined;
declare const __EXT_VERSION__: string | undefined;

// Khi chạy test (không qua esbuild) hai hằng chưa được định nghĩa: dùng giá trị tạm
export const APP_ORIGIN: string = typeof __APP_ORIGIN__ === "string" ? __APP_ORIGIN__ : "http://localhost:3000";
export const EXT_VERSION: string = typeof __EXT_VERSION__ === "string" ? __EXT_VERSION__ : "dev";
export const EXT_NAME = "Data Lead Facebook";
