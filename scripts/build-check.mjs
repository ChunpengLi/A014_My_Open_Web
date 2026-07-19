import { access, readFile } from "node:fs/promises";

const requiredFiles = [
  "public/index.html",
  "public/assets/hero.png",
  "public/assets/styles.css",
  "public/assets/app.js",
  "public/_headers",
];

await Promise.all(requiredFiles.map((file) => access(file)));

const html = await readFile("public/index.html", "utf8");

if (!html.includes("<main") || !html.includes("</html>")) {
  throw new Error("public/index.html does not look like a complete HTML page.");
}

console.log("Static site check passed.");
