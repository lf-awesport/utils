// install-chromium.js
const { execSync } = require("child_process");
console.log("🔧 Forcing Puppeteer Chromium install...");

execSync("node node_modules/puppeteer-core/install.js", {
  stdio: "inherit"
});