// 공개용 상세 계산(/simulator/index.html)이 실제 클라이언트 시드 없이도 정상 동작하는지 확인.
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
  "js/engine/payout-fit.js",
  "js/engine/revenue-floor.js",
  "js/engine/validation.js",
  "js/data/public-seed.js"
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
  crypto: { randomUUID: () => "id-" + Math.random().toString(16).slice(2) }
};
context.window = context;
context.App = {};
context.window.App = context.App;
vm.createContext(context);

files.forEach((f) => {
  const code = fs.readFileSync(path.join(root, f), "utf8");
  vm.runInContext(code, context, { filename: f });
});

const seed = context.App.PublicSample.load();
const sim = context.App.Engine.runSimulation(seed);

const badMonth = sim.months.find((row) => !Number.isFinite(row.closing) || !Number.isFinite(row.pnlExpense));
if (badMonth) {
  console.log("FAIL public-seed: NaN/Infinity in month", badMonth.month);
  process.exit(1);
}
console.log("PASS public-seed months=" + sim.months.length + " end=" + sim.kpis.endClosing + " min=" + sim.kpis.minClosing);

// 실제 클라이언트 값·회사명 수수료가 섞여 들어오지 않았는지 확인.
const json = JSON.stringify(seed);
if (json.indexOf("메리디안") >= 0 || json.indexOf("써니스") >= 0 || seed.profile.initialCash === 120000000) {
  console.log("FAIL public-seed: 실제 클라이언트 시드 값 또는 회사명 수수료가 섞여 있습니다");
  process.exit(1);
}
const feeNames = (seed.revenueFees || []).map(function (f) { return f.name; });
if (feeNames.indexOf("작품·광고 영업 수수료(예시)") < 0 || feeNames.indexOf("재무 아웃소싱 수수료(예시)") < 0) {
  console.log("FAIL public-seed: 예시 수수료 명칭이 없습니다", feeNames);
  process.exit(1);
}
console.log("PASS public-seed: 실제 클라이언트 값 없음 · 예시 수수료 명칭 확인");
