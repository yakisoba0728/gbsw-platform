import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const standaloneRoot = path.join(projectRoot, ".next", "standalone");

if (!process.env.HOSTNAME?.trim()) process.env.HOSTNAME = "127.0.0.1";

await import(pathToFileURL(path.join(standaloneRoot, "server.js")).href);
