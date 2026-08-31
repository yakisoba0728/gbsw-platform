import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const standaloneRoot = path.join(projectRoot, ".next", "standalone");

// `npm run build`가 public과 정적 청크까지 합친 뒤 검증한다. 실행 시 산출물을
// 다시 쓰지 않아 브라우저 테스트와 Docker가 검증된 바이트를 그대로 사용한다.
await import(pathToFileURL(path.join(standaloneRoot, "server.js")).href);
