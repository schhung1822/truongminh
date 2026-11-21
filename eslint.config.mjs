import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    "generated/**",
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    // Ảnh hiển thị bằng thẻ img thường (ảnh R2 là địa chỉ công khai, ảnh riêng đi qua /api/files có đăng nhập); remotePatterns của next/image vẫn được khai báo trong next.config.ts.
    rules: { "@next/next/no-img-element": "off" },
  },
  {
    // Script triển khai viết bằng CommonJS (.cjs) để chạy được bằng node thuần, nên được dùng require().
    files: ["deploy/**/*.cjs"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  {
    // Component do shadcn sinh ra, giữ nguyên mã gốc.
    files: ["components/ui/**"],
    rules: { "react-hooks/set-state-in-effect": "off" },
  },
]);

export default eslintConfig;
