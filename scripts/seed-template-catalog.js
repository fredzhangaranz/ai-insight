#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const ts = require("typescript");
const vm = require("vm");
const Module = require("module");

// Load local env if present (helpful when running outside docker)
try {
  const dotenvPath = path.join(process.cwd(), ".env.local");
  if (fs.existsSync(dotenvPath)) {
    require("dotenv").config({ path: dotenvPath });
  }
} catch (_) {
  // dotenv not available, continue without it
}

const tsFile = path.join(__dirname, "seed-template-catalog.ts");
const source = fs.readFileSync(tsFile, "utf-8");

const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2019,
    esModuleInterop: true,
    resolveJsonModule: true,
  },
  fileName: tsFile,
});

const script = new vm.Script(transpiled.outputText, { filename: tsFile });
const sandboxModule = { exports: {} };
const sandbox = {
  require: Module.createRequire(tsFile),
  module: sandboxModule,
  exports: sandboxModule.exports,
  __filename: tsFile,
  __dirname: path.dirname(tsFile),
  process,
  console,
  Buffer,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
};

script.runInNewContext(sandbox);

module.exports = sandboxModule.exports;

// If running as main script, execute the CLI function
if (require.main === module) {
  const { seedTemplateCatalog } = sandboxModule.exports;
  if (typeof seedTemplateCatalog === "function") {
    seedTemplateCatalog()
      .then((stats) => {
        console.log(
          `✅ Template catalog seed complete. Inserted templates: ${stats.insertedTemplates}, inserted versions: ${stats.insertedVersions}, skipped templates: ${stats.skippedTemplates}, skipped versions: ${stats.skippedVersions}`
        );
        process.exit(0);
      })
      .catch((error) => {
        console.error(
          "❌ Template catalog seeding failed:",
          error?.message || error
        );
        process.exit(1);
      });
  }
}
