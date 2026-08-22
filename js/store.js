(function () {
  window.App = window.App || {};

  var LEGACY_KEY = "solo-agency-budget:v2";
  var INDEX_KEY = "solo-agency-budget:index:v1";
  var ITEM_PREFIX = "solo-agency-budget:item:";

  function itemKey(id) {
    return ITEM_PREFIX + id;
  }

  function readRaw(key) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (err) {
      return null;
    }
  }

  function writeRaw(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (err) {
      return false;
    }
  }

  function readIndex() {
    var idx = readRaw(INDEX_KEY);
    if (!idx || typeof idx !== "object" || !Array.isArray(idx.items)) return null;
    return idx;
  }

  function writeIndex(index) {
    return writeRaw(INDEX_KEY, index);
  }

  function readItemState(id) {
    var raw = readRaw(itemKey(id));
    if (!raw || typeof raw !== "object") return null;
    return raw;
  }

  function summaryFromState(state) {
    var p = (state && state.profile) || {};
    var meta = (state && state.meta) || {};
    return {
      actorName: p.actorName || "",
      companyName: p.companyName || "",
      startMonth: p.startMonth || "",
      endMonth: p.endMonth || "",
      title: (App.Defaults && App.Defaults.budgetDisplayTitle)
        ? App.Defaults.budgetDisplayTitle(state)
        : (meta.title || p.companyName || "배우")
    };
  }

  function indexEntryFromState(id, state) {
    var meta = (state && state.meta) || {};
    var sum = summaryFromState(state);
    return {
      id: id,
      name: sum.title,
      actorName: sum.actorName,
      companyName: sum.companyName,
      startMonth: sum.startMonth,
      endMonth: sum.endMonth,
      createdAt: meta.createdAt || new Date().toISOString(),
      updatedAt: meta.updatedAt || meta.createdAt || new Date().toISOString()
    };
  }

  function buildBlankBudget() {
    var state = (App.Defaults.seedState || App.Sample.load || App.Defaults.emptyState)();
    return App.Defaults.ensureState(state);
  }

  function migrateLegacy() {
    var legacy = readRaw(LEGACY_KEY);
    var state;
    if (legacy && typeof legacy === "object") {
      if (!legacy.version) legacy.version = 1;
      state = App.Defaults.ensureState(legacy);
    } else {
      state = buildBlankBudget();
    }
    var id = state.meta.budgetId;
    writeRaw(itemKey(id), state);
    var index = { activeBudgetId: id, items: [indexEntryFromState(id, state)] };
    writeIndex(index);
    return index;
  }

  function ensureIndex() {
    var index = readIndex();
    if (index) return index;
    return migrateLegacy();
  }

  function readIndexOrEmpty() {
    return readIndex() || { activeBudgetId: null, items: [] };
  }

  function sortedItems(index) {
    return (index.items || []).slice().sort(function (a, b) {
      return (b.updatedAt || "").localeCompare(a.updatedAt || "");
    });
  }

  function load() {
    try {
      var index = ensureIndex();
      var id = index.activeBudgetId;
      var state = id ? readItemState(id) : null;
      if (!state) {
        var blank = buildBlankBudget();
        id = blank.meta.budgetId;
        writeRaw(itemKey(id), blank);
        index.activeBudgetId = id;
        index.items = (index.items || []).concat([indexEntryFromState(id, blank)]);
        writeIndex(index);
        return blank;
      }
      return App.Defaults.ensureState(state);
    } catch (err) {
      return { error: true };
    }
  }

  function save(state) {
    try {
      App.Defaults.ensureState(state);
      state.meta.storageMode = state.meta.storageMode || "local";
      state.meta.updatedAt = new Date().toISOString();
      var id = state.meta.budgetId;
      if (!writeRaw(itemKey(id), state)) return false;

      var index = readIndexOrEmpty();
      var entry = (index.items || []).filter(function (it) { return it.id === id; })[0];
      var fresh = indexEntryFromState(id, state);
      if (entry) {
        if (!entry.name || entry.name === "이종원") entry.name = fresh.name;
        entry.actorName = fresh.actorName;
        entry.companyName = fresh.companyName;
        entry.startMonth = fresh.startMonth;
        entry.endMonth = fresh.endMonth;
        entry.updatedAt = fresh.updatedAt;
      } else {
        index.items = (index.items || []).concat([fresh]);
      }
      index.activeBudgetId = id;
      return writeIndex(index);
    } catch (err) {
      return false;
    }
  }

  function listBudgets() {
    var index = ensureIndex();
    return sortedItems(index);
  }

  function getActiveBudgetId() {
    return ensureIndex().activeBudgetId;
  }

  function createBudget(name, opts) {
    opts = opts || {};
    var state = opts.fromState
      ? App.Defaults.ensureState(JSON.parse(JSON.stringify(opts.fromState)))
      : buildBlankBudget();
    var now = new Date().toISOString();
    state.meta.budgetId = App.uid();
    state.meta.title = name || state.meta.title || "새 예산안";
    state.meta.createdAt = now;
    state.meta.updatedAt = now;
    var id = state.meta.budgetId;
    if (!writeRaw(itemKey(id), state)) return null;
    var index = ensureIndex();
    index.items = (index.items || []).concat([indexEntryFromState(id, state)]);
    if (!writeIndex(index)) {
      try { localStorage.removeItem(itemKey(id)); } catch (err) {}
      return null;
    }
    return id;
  }

  function duplicateBudget(id, newName) {
    var source = readItemState(id);
    if (!source) return null;
    return createBudget(newName || ((source.meta && source.meta.title) || "예산안") + " 복사본", { fromState: source });
  }

  function renameBudget(id, name) {
    var index = ensureIndex();
    var entry = (index.items || []).filter(function (it) { return it.id === id; })[0];
    if (!entry) return false;
    var prevName = entry.name;
    var nextName = name || entry.name;
    entry.name = nextName;
    if (!writeIndex(index)) {
      entry.name = prevName;
      return false;
    }
    var state = readItemState(id);
    if (state) {
      state.meta = state.meta || {};
      state.meta.title = nextName;
      if (!writeRaw(itemKey(id), state)) {
        entry.name = prevName;
        writeIndex(index);
        return false;
      }
    }
    return true;
  }

  function deleteBudget(id) {
    var index = ensureIndex();
    var items = index.items || [];
    if (items.length <= 1) return false;
    var remaining = items.filter(function (it) { return it.id !== id; });
    if (remaining.length === items.length) return false;
    var prevItems = index.items;
    var prevActive = index.activeBudgetId;
    index.items = remaining;
    if (index.activeBudgetId === id) {
      index.activeBudgetId = sortedItems(index)[0].id;
    }
    if (!writeIndex(index)) {
      index.items = prevItems;
      index.activeBudgetId = prevActive;
      return false;
    }
    try { localStorage.removeItem(itemKey(id)); } catch (err) {}
    return true;
  }

  function switchActiveBudget(id) {
    var state = readItemState(id);
    if (!state) return null;
    state = App.Defaults.ensureState(state);
    var index = ensureIndex();
    var prevActive = index.activeBudgetId;
    index.activeBudgetId = id;
    if (!writeIndex(index)) {
      index.activeBudgetId = prevActive;
      return null;
    }
    return state;
  }

  function exportJson(state) {
    App.Defaults.ensureState(state);
    return JSON.stringify(state, null, 2);
  }

  function parseImport(text) {
    var parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object") throw new Error("형식이 올바르지 않습니다.");
    if (!parsed.profile || !parsed.settings) throw new Error("필수 키가 없는 파일입니다.");
    if (!parsed.version) parsed.version = 1;
    return App.Defaults.ensureState(parsed);
  }

  function download(state) {
    var name = (state.profile.companyName || ((App.Defaults && App.Defaults.actorDisplayName) ? App.Defaults.actorDisplayName() : "배우"))
      .replace(/[\\/:*?"<>|]/g, "") + "_예산안_" + (state.profile.startMonth || "") + ".json";
    var blob = new Blob([exportJson(state)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  App.Store = {
    KEY: LEGACY_KEY,
    INDEX_KEY: INDEX_KEY,
    save: save,
    load: load,
    exportJson: exportJson,
    parseImport: parseImport,
    download: download,
    listBudgets: listBudgets,
    getActiveBudgetId: getActiveBudgetId,
    createBudget: createBudget,
    duplicateBudget: duplicateBudget,
    renameBudget: renameBudget,
    deleteBudget: deleteBudget,
    switchActiveBudget: switchActiveBudget
  };
})();
