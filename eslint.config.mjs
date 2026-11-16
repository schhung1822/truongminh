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
    // Ảnh nằm trong kho riêng, cần đăng nhập mới xem được nên không dùng next/image.
    rules: { "@next/next/no-img-element": "off" },
  },
  {
    // Component do shadcn sinh ra, giữ nguyên mã gốc.
    files: ["components/ui/**"],
    rules: { "react-hooks/set-state-in-effect": "off" },
  },
]);

export default eslintConfig;
