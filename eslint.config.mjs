import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "next-env.d.ts",
    // 브라우저 도구가 남기는 스크린샷·조사 스크립트. gitignore에도 있다 —
    // 저장소 코드가 아니므로 lint 대상이 아니고, 여기 없으면 그 스크립트의
    // 문법 오류 하나가 `npm run verify`를 통째로 멈춰 세운다.
    ".playwright-mcp/**",
    // 각자 기계에만 있는 개발용 파일(테스트 계정·창 띄우는 스크립트). gitignore에도
    // 있다 — 저장소 코드가 아니므로 같은 이유로 lint 대상이 아니다.
    "dev-local/**",
  ]),
]);

export default eslintConfig;
