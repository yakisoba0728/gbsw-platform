import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const standaloneRoot = path.join(projectRoot, ".next", "standalone");

// standalone 진입점은 HOSTNAME이 비어 있으면 0.0.0.0에 묶는다. 도커는
// Dockerfile이, Playwright는 webServer.env가 값을 명시하지만 호스트에서
// 이 스크립트를 직접 부르는 갈래에는 주는 사람이 없어, 리버스 프록시 없이
// 전 인터페이스에 평문 HTTP로 열린다. 루프백을 기본으로 두고 명시적으로
// 준 값만 이기게 한다 — 빈 문자열은 준 것으로 치지 않는다.
if (!process.env.HOSTNAME?.trim()) process.env.HOSTNAME = "127.0.0.1";

// `npm run build`가 public과 정적 청크까지 합친 뒤 검증한다. 실행 시 산출물을
// 다시 쓰지 않아 브라우저 테스트와 Docker가 검증된 바이트를 그대로 사용한다.
await import(pathToFileURL(path.join(standaloneRoot, "server.js")).href);
