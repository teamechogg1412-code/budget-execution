const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const files = [
  "js/money.js",
  "js/month.js",
  "js/holidays-kr.js",
  "js/calendar.js",
  "js/format.js",
  "js/data/categories.js",
  "js/data/personal-tax.js",
  "js/data/corporate-tax.js",
  "js/data/insurance-rules.js",
  "js/data/defaults.js",
  "js/engine/revenue.js",
  "js/engine/revenue-fees.js",
  "js/engine/expense.js",
  "js/engine/support.js",
  "js/engine/payroll.js",
  "js/engine/tax-year.js",
  "js/engine/tax.js",
  "js/engine/personal-tax.js",
  "js/engine/vat.js",
  "js/engine/cashflow.js",
  "js/engine/ledger.js",
  "js/engine/index.js",
  "js/engine/scenarios.js",
  "js/engine/revenue-floor.js",
  "js/engine/validation.js",
  "js/supabase-config.js",
  "js/store.js",
  "js/remote-store.js",
  "js/data/sample-from-xlsx.js",
  "js/render.js",
  "js/export-excel.js",
  "test/cases.js"
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
  parseInt,
  isNaN,
  Infinity,
  crypto: { randomUUID: () => "id-" + Math.random().toString(16).slice(2) },
  localStorage: {
    _d: {},
    setItem(k, v) { this._d[k] = v; },
    getItem(k) { return this._d[k] || null; },
    removeItem(k) { delete this._d[k]; }
  }
};
context.window = context;
context.App = {};
context.window.App = context.App;
vm.createContext(context);

files.forEach((f) => {
  const code = fs.readFileSync(path.join(root, f), "utf8");
  vm.runInContext(code, context, { filename: f });
});

const out = context.App.Tests.run();
console.log("PASS " + out.passed + " / FAIL " + out.failed);
out.results.filter((r) => !r.ok).forEach((r) => {
  console.log("FAIL", r.name, r.detail);
});
const sample = context.App.Sample.load();
const sim = context.App.Engine.runSimulation(sample);
console.log("SAMPLE months", sim.months.length, "end", sim.kpis.endClosing, "min", sim.kpis.minClosing);
process.exit(out.failed ? 1 : 0);
