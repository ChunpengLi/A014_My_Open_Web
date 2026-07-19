import { access, readFile } from "node:fs/promises";

const requiredFiles = [
  "public/index.html",
  "public/styles.css",
  "public/app.js",
  "public/seed/firmware.json",
  "public/seed/options.json",
  "public/_headers",
  "src/worker.js",
  "wrangler.jsonc",
];

await Promise.all(requiredFiles.map((file) => access(file)));

const html = await readFile("public/index.html", "utf8");

if (!html.includes("<main") || !html.includes("</html>")) {
  throw new Error("public/index.html does not look like a complete HTML page.");
}

if (!html.includes("authGate") || !html.includes("固件与软件包管理系统")) {
  throw new Error("public/index.html is missing the firmware app shell or auth gate.");
}

console.log("Static site check passed.");
