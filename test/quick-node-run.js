const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const files = [
  "js/money.js",
  "js/data/personal-tax.js",
  "js/data/corporate-tax.js",
  "js/engine/tax.js",
  "js/engine/personal-tax.js",
  "landing/js/quick-engine.js",
  "test/quick-cases.js"
];

const context = {
  window: {},
  console,
  Date,
  Math,
  Number,
  String,
  Object,
  Array,
  JSON,
  Infinity
};
context.window = context;
context.App = {};
context.window.App = context.App;
vm.createContext(context);

files.forEach((f) => {
  const code = fs.readFileSync(path.join(root, f), "utf8");
  vm.runInContext(code, context, { filename: f });
});

const out = context.App.QuickTests.run();
console.log("PASS " + out.passed + " / FAIL " + out.failed);
out.results.forEach((r) => {
  console.log((r.ok ? "PASS" : "FAIL") + " " + r.name + (r.detail !== undefined && r.detail !== "" ? " (" + r.detail + ")" : ""));
});
process.exit(out.failed ? 1 : 0);
