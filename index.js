(function () {
  // ================= 常量 & 全局状态 =================
  let records = [];
  let nextId = 1;
  let nextGroupId = 1;
  let manualRates = {};

  const LS_KEY_RECORDS = "de_records";
  const LS_KEY_NEXT_ID = "de_nextId";
  const LS_KEY_BASE = "de_baseCurrency";
  const LS_KEY_MANUAL = "de_manualRates";
  const LS_KEY_GROUP = "de_nextGroupId";

  const accountTypesForExpenseMirror = ["现金", "共同资产", "存款", "日信", "中信"];

  // ================= DOM 引用 =================
  const entryForm = document.getElementById("entryForm");
  const categoryEl = document.getElementById("category");
  const accountTypeEl = document.getElementById("accountType");
  const amountEl = document.getElementById("amount");
  const currencyEl = document.getElementById("currency");
  const recordDateEl = document.getElementById("recordDate");
  const occurDateEl = document.getElementById("occurDate");
  const noteEl = document.getElementById("note");
  const resetFormBtn = document.getElementById("resetFormBtn");

  const recordsTbody = document.getElementById("recordsTbody");
  const budgetTotalEl = document.getElementById("budgetTotal");
  const netTotalEl = document.getElementById("netTotal");
  const consumeTotalEl = document.getElementById("consumeTotal");
  const summaryMonthEl = document.getElementById("summaryMonth");

  const baseCurrencyInput = document.getElementById("baseCurrency");
  const baseCurrencyLabel = document.getElementById("baseCurrencyLabel");
  const baseCurrencyInline = document.getElementById("baseCurrencyInline");
  const manualCurrencyInput = document.getElementById("manualCurrencyInput");
  const manualRateInput = document.getElementById("manualRateInput");
  const addManualRateBtn = document.getElementById("addManualRateBtn");
  const manualRateList = document.getElementById("manualRateList");

  const exportBtn = document.getElementById("exportBtn");
  const importFile = document.getElementById("importFile");

  // 筛选控件
  const filterCategoryEl = document.getElementById("filterCategory");
  const filterAccountTypeEl = document.getElementById("filterAccountType");
  const filterStartDateEl = document.getElementById("filterStartDate");
  const filterEndDateEl = document.getElementById("filterEndDate");
  const clearFilterBtn = document.getElementById("clearFilterBtn");

  // ================= 工具函数 =================

  function todayStr() {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  }

  // 金额显示格式：千分位，不强制两位小数
  function formatAmount(num) {
    if (num === null || num === undefined || isNaN(num)) return "";

    const str = String(num);
    const parts = str.split(".");

    // 整数部分千分位
    parts[0] = Number(parts[0]).toLocaleString("en-US");

    // 无小数或小数为 0 时，仅显示整数部分
    if (parts.length === 1 || Number(parts[1]) === 0) {
      return parts[0];
    }

    // 有非零小数，保留原始小数长度
    return parts[0] + "." + parts[1];
  }

  function updateBaseCurrencyUI() {
    const base = baseCurrencyInput.value || "JPY";
    baseCurrencyLabel.textContent = base;
    baseCurrencyInline.textContent = base;
  }

  function renderManualRateList() {
    const entries = Object.entries(manualRates || {});
    manualRateList.textContent = entries.length
      ? entries.map(([c, r]) => `${c}:${r}`).join("；")
      : "（无）";
  }

  function saveState() {
    try {
      localStorage.setItem(LS_KEY_RECORDS, JSON.stringify(records));
      localStorage.setItem(LS_KEY_NEXT_ID, String(nextId));
      localStorage.setItem(LS_KEY_BASE, baseCurrencyInput.value || "JPY");
      localStorage.setItem(LS_KEY_MANUAL, JSON.stringify(manualRates || {}));
      localStorage.setItem(LS_KEY_GROUP, String(nextGroupId));
    } catch (e) {
      console.log("保存到 localStorage 失败：", e);
    }
  }

  function loadState() {
    // 记录
    try {
      const recStr = localStorage.getItem(LS_KEY_RECORDS);
      if (recStr) {
        const arr = JSON.parse(recStr);
        if (Array.isArray(arr)) records = arr;
      }
    } catch (e) {
      console.log("读取记录失败：", e);
    }

    // nextId
    const savedNextId = localStorage.getItem(LS_KEY_NEXT_ID);
    if (savedNextId) {
      const n = parseInt(savedNextId, 10);
      if (!isNaN(n) && n > 0) nextId = n;
    } else {
      let maxId = 0;
      records.forEach((r) => {
        if (r.id && r.id > maxId) maxId = r.id;
      });
      nextId = maxId + 1;
    }

    // 基准货币
    const savedBase = localStorage.getItem(LS_KEY_BASE);
    if (savedBase) {
      baseCurrencyInput.value = savedBase;
    }
    updateBaseCurrencyUI();

    // 手动汇率
    try {
      const savedManual = localStorage.getItem(LS_KEY_MANUAL);
      if (savedManual) {
        const obj = JSON.parse(savedManual);
        if (obj && typeof obj === "object") manualRates = obj;
      }
    } catch (e) {
      console.log("读取手动汇率失败：", e);
    }

    // groupId
    const savedGroup = localStorage.getItem(LS_KEY_GROUP);
    if (savedGroup) {
      const g = parseInt(savedGroup, 10);
      if (!isNaN(g) && g > 0) {
        nextGroupId = g;
      }
    } else {
      let maxGroup = 0;
      records.forEach((r) => {
        if (typeof r.groupId === "number" && r.groupId > maxGroup) {
          maxGroup = r.groupId;
        }
      });
      nextGroupId = maxGroup + 1;
    }
  }

  function getRateToBase(currency) {
    const cur = (currency || "").toUpperCase();
    const base = (baseCurrencyInput.value || "JPY").toUpperCase();
    if (cur === base) return 1;
    if (manualRates[cur]) return manualRates[cur];
    return 1;
  }

  function addRecord(rec, groupId) {
    rec.id = nextId++;
    if (typeof groupId === "number") {
      rec.groupId = groupId;
    }
    records.push(rec);
    return rec.id;
  }

  function getSignedAmount(rec) {
    if (rec.accountType === "消费") {
      return 0;
    }
    const sign = rec.category === "入" ? 1 : -1;
    return sign * rec.amount;
  }

  function inSummaryMonth(rec, monthFilter) {
    if (!monthFilter) return true;
    const d = rec.occurDate || rec.recordDate;
    if (!d) return false;
    return d.slice(0, 7) === monthFilter;
  }

  function recomputeSummary() {
    let budgetTotalBase = 0;
    let netTotalBase = 0;
    let consumeTotalBase = 0;
    const base = baseCurrencyInput.value || "JPY";
    const monthFilter = summaryMonthEl?.value || null;

    records.forEach((rec) => {
      if (!inSummaryMonth(rec, monthFilter)) return;

      const rate = getRateToBase(rec.currency || base);

      if (rec.accountType === "消费") {
        consumeTotalBase += rec.amount * rate;
        return;
      }

      const signed = getSignedAmount(rec);
      const inBase = signed * rate;

      if (rec.accountType === "预算") {
        budgetTotalBase += inBase;
      }
      netTotalBase += inBase;
    });

    budgetTotalEl.textContent = budgetTotalBase.toFixed(2) + " " + base;
    netTotalEl.textContent = netTotalBase.toFixed(2) + " " + base;
    consumeTotalEl.textContent = consumeTotalBase.toFixed(2) + " " + base;
    updateBaseCurrencyUI();
  }

  function addCell(tr, text) {
    const td = document.createElement("td");
    td.textContent = text;
    tr.appendChild(td);
    return td;
  }

  // 过滤用的日期优先发生时间
  function getRecordDateForFilter(rec) {
    return rec.occurDate || rec.recordDate || "";
  }

  function getFilteredRecords() {
    let displayList = [...records];

    // 分类筛选
    if (filterCategoryEl?.value) {
      const c = filterCategoryEl.value;
      displayList = displayList.filter((r) => r.category === c);
    }

    // 账户类型筛选
    if (filterAccountTypeEl?.value) {
      const a = filterAccountTypeEl.value;
      displayList = displayList.filter((r) => r.accountType === a);
    }

    // 时间筛选
    if (filterStartDateEl?.value) {
      const start = filterStartDateEl.value;
      displayList = displayList.filter((r) => {
        const d = getRecordDateForFilter(r);
        if (!d) return false;
        return d >= start;
      });
    }

    if (filterEndDateEl?.value) {
      const end = filterEndDateEl.value;
      displayList = displayList.filter((r) => {
        const d = getRecordDateForFilter(r);
        if (!d) return false;
        return d <= end;
      });
    }

    // 按 id 倒序，只显示最近 10 条
    displayList.sort((a, b) => b.id - a.id);
    return displayList.slice(0, 10);
  }

  function renderTable() {
    recordsTbody.innerHTML = "";

    const displayList = getFilteredRecords();

    displayList.forEach((rec) => {
      const tr = document.createElement("tr");

      // 操作列
      const tdOps = document.createElement("td");
      const editBtn = document.createElement("button");
      editBtn.textContent = "编辑";
      editBtn.className = "btn-small";

      const delBtn = document.createElement("button");
      delBtn.textContent = "删除";
      delBtn.className = "btn-small btn-danger";

      const isAuto = rec.source?.startsWith("自动");
      if (isAuto) {
        editBtn.disabled = true;
        editBtn.title = "自动生成记录不可编辑";
      } else {
        editBtn.addEventListener("click", () => editRecord(rec.id));
      }
      delBtn.addEventListener("click", () => deleteRecord(rec.id));

      tdOps.appendChild(editBtn);
      tdOps.appendChild(delBtn);
      tr.appendChild(tdOps);

      // 其他列
      addCell(tr, rec.category);
      addCell(tr, rec.accountType);
      addCell(tr, formatAmount(rec.amount)); // 金额显示：千分位，不强制两位小数
      addCell(tr, rec.currency || "");
      addCell(tr, rec.recordDate || "");
      addCell(tr, rec.occurDate || "");
      addCell(tr, rec.note || "");

      const srcTd = addCell(tr, rec.source || "");
      if (rec.source?.startsWith("自动")) {
        srcTd.classList.add("auto");
      }

      recordsTbody.appendChild(tr);
    });
  }

  function renderAndSave() {
    renderTable();
    recomputeSummary();
    saveState();
  }

  // ================= 业务规则函数 =================

  function addRecordWithRules(fromForm) {
    const groupId = nextGroupId++;
    const baseRec = {
      category: fromForm.category,
      accountType: fromForm.accountType,
      amount: fromForm.amount,
      currency: fromForm.currency,
      recordDate: fromForm.recordDate,
      occurDate: fromForm.occurDate,
      note: fromForm.note,
      source: fromForm.source || "手动",
    };
    addRecord(baseRec, groupId);

    // 自动“消费 入”记录
    if (
      baseRec.category === "出" &&
      accountTypesForExpenseMirror.includes(baseRec.accountType)
    ) {
      const expenseRec = {
        category: "入",
        accountType: "消费",
        amount: baseRec.amount,
        currency: baseRec.currency,
        recordDate: baseRec.recordDate,
        occurDate: baseRec.occurDate,
        note: baseRec.note,
        source: "自动:消费对应",
      };
      addRecord(expenseRec, groupId);
    }

    // 信用卡还款记录：次月27日 出 现金 / 入 日信/中信
    if (
      baseRec.category === "出" &&
      (baseRec.accountType === "日信" || baseRec.accountType === "中信")
    ) {
      const occur = new Date(
        baseRec.occurDate || baseRec.recordDate || todayStr()
      );
      const year = occur.getFullYear();
      const month = occur.getMonth();
      const nextMonth = (month + 1) % 12;
      const nextYear = year + (nextMonth === 0 ? 1 : 0);
      const repaymentDate = new Date(nextYear, nextMonth, 27);
      const dateStr = repaymentDate.toISOString().slice(0, 10);

      const note =
        (baseRec.note ? baseRec.note + " " : "") + "（信用卡还款）";

      const cashOut = {
        category: "出",
        accountType: "现金",
        amount: baseRec.amount,
        currency: baseRec.currency,
        recordDate: dateStr,
        occurDate: dateStr,
        note,
        source: "自动:信用卡还款",
      };
      const cardIn = {
        category: "入",
        accountType: baseRec.accountType,
        amount: baseRec.amount,
        currency: baseRec.currency,
        recordDate: dateStr,
        occurDate: dateStr,
        note,
        source: "自动:信用卡还款",
      };

      addRecord(cashOut, groupId);
      addRecord(cardIn, groupId);
    }
  }

  function syncCategoryForAccountType() {
    const acc = accountTypeEl.value;
    if (acc === "消费") {
      categoryEl.value = "入";
      categoryEl.disabled = true;
    } else if (acc === "日信" || acc === "中信") {
      categoryEl.value = "出";
      categoryEl.disabled = true;
    } else {
      categoryEl.disabled = false;
    }
  }

  function editRecord(id) {
    const rec = records.find((r) => r.id === id);
    if (!rec) return;

    categoryEl.value = rec.category;
    accountTypeEl.value = rec.accountType;
    amountEl.value = rec.amount;
    currencyEl.value = rec.currency;
    recordDateEl.value = rec.recordDate;
    occurDateEl.value = rec.occurDate;
    noteEl.value = rec.note;
    syncCategoryForAccountType();

    // 如果是「手动」且有 groupId，则连同自动生成的一组全部删除
    if (rec.source === "手动" && typeof rec.groupId === "number") {
      records = records.filter((r) => r.groupId !== rec.groupId);
    } else {
      records = records.filter((r) => r.id !== id);
    }

    renderAndSave();
  }

  function deleteRecord(id) {
    const rec = records.find((r) => r.id === id);
    if (!rec) return;

    if (rec.source === "手动" && typeof rec.groupId === "number") {
      records = records.filter((r) => r.groupId !== rec.groupId);
    } else {
      records = records.filter((r) => r.id !== id);
    }

    renderAndSave();
  }

  // ================= 事件绑定 =================

  // 初始化日期
  recordDateEl.value = todayStr();
  occurDateEl.value = todayStr();
  if (summaryMonthEl) {
    summaryMonthEl.value = todayStr().slice(0, 7);
  }

  // 筛选时间默认是“今天”
  (function initFilterDates() {
    const t = todayStr();
    if (filterStartDateEl) filterStartDateEl.value = t;
    if (filterEndDateEl) filterEndDateEl.value = t;
  })();

  accountTypeEl.addEventListener("change", syncCategoryForAccountType);

  entryForm.addEventListener("submit", function (e) {
    e.preventDefault();

    // 信用卡只能“出”
    if (
      (accountTypeEl.value === "日信" || accountTypeEl.value === "中信") &&
      categoryEl.value === "入"
    ) {
      alert("信用卡（日信/中信）手动录入时只能选择“出”。“入”记录请通过自动转记生成。");
      return;
    }

    const amount = parseFloat(amountEl.value);
    if (isNaN(amount) || amount <= 0) return;

    const formData = {
      category: categoryEl.value,
      accountType: accountTypeEl.value,
      amount,
      currency: currencyEl.value || "JPY",
      recordDate: recordDateEl.value || todayStr(),
      occurDate: occurDateEl.value || todayStr(),
      note: noteEl.value || "",
      source: "手动",
    };

    addRecordWithRules(formData);
    renderAndSave();
  });

  resetFormBtn.addEventListener("click", function () {
    entryForm.reset();
    recordDateEl.value = todayStr();
    occurDateEl.value = todayStr();
    currencyEl.value = "JPY";
    syncCategoryForAccountType();
  });

  baseCurrencyInput.addEventListener("input", () => {
    updateBaseCurrencyUI();

    // 切换基准货币后，清空手动汇率，避免误用
    manualRates = {};
    renderManualRateList();

    recomputeSummary();
    saveState();
  });

  addManualRateBtn.addEventListener("click", () => {
    const cur = (manualCurrencyInput.value || "").trim();
    const rate = parseFloat(manualRateInput.value);
    if (!cur || isNaN(rate) || rate <= 0) return;

    if (cur.toUpperCase() === (baseCurrencyInput.value || "JPY").toUpperCase()) {
      alert("基准货币本身的汇率固定为 1，无需手动设置。");
      return;
    }

    manualRates[cur.toUpperCase()] = rate;
    manualCurrencyInput.value = "";
    manualRateInput.value = "";
    renderManualRateList();
    recomputeSummary();
    saveState();
  });

  exportBtn.addEventListener("click", () => {
    const header = [
      "category",
      "recordDate",
      "occurDate",
      "amount",
      "accountType",
      "note",
      "currency",
    ];
    const lines = [header.join(",")];

    // 导出所有记录，不受筛选与“只显示10条”影响
    records.forEach((rec) => {
      const row = [
        rec.category,
        rec.recordDate || "",
        rec.occurDate || "",
        rec.amount,
        rec.accountType,
        rec.note || "",
        rec.currency || "",
      ];
      lines.push(row.join(","));
    });

    const blob = new Blob([lines.join("\r\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "records.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  // ⭐⭐ 导入：每次覆盖旧记录，避免重复 ⭐⭐
  importFile.addEventListener("change", () => {
    const file = importFile.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (evt) {
      const text = evt.target.result;
      if (!text) return;
      const lines = text.split(/\r?\n/).filter(Boolean);
      if (lines.length <= 1) return;

      // 覆盖导入：清空之前的记录和自增 id
      records = [];
      nextId = 1;
      nextGroupId = 1;

      const header = lines[0].split(",");
      const idx = (name) => header.indexOf(name);

      const idxCategory = idx("category");
      const idxRecordDate = idx("recordDate");
      const idxOccurDate = idx("occurDate");
      const idxAmount = idx("amount");
      const idxAccountType = idx("accountType");
      const idxNote = idx("note");
      const idxCurrency = idx("currency");

      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(",");
        if (!cols.length) continue;
        const amount = parseFloat(cols[idxAmount]);
        if (isNaN(amount)) continue;

        const rec = {
          category: cols[idxCategory],
          recordDate: cols[idxRecordDate],
          occurDate: cols[idxOccurDate],
          amount,
          accountType: cols[idxAccountType],
          note: cols[idxNote],
          currency: cols[idxCurrency],
          source: "导入",
        };
        addRecord(rec);
      }

      renderAndSave();
      importFile.value = "";
    };
    reader.readAsText(file, "utf-8");
  });

  if (summaryMonthEl) {
    summaryMonthEl.addEventListener("input", () => {
      recomputeSummary();
      saveState();
    });
  }

  // 筛选事件绑定
  if (filterCategoryEl) {
    filterCategoryEl.addEventListener("change", renderTable);
  }
  if (filterAccountTypeEl) {
    filterAccountTypeEl.addEventListener("change", renderTable);
  }
  if (filterStartDateEl) {
    filterStartDateEl.addEventListener("change", renderTable);
  }
  if (filterEndDateEl) {
    filterEndDateEl.addEventListener("change", renderTable);
  }
  if (clearFilterBtn) {
    clearFilterBtn.addEventListener("click", () => {
      if (filterCategoryEl) filterCategoryEl.value = "";
      if (filterAccountTypeEl) filterAccountTypeEl.value = "";

      const t = todayStr();
      if (filterStartDateEl) filterStartDateEl.value = t;
      if (filterEndDateEl) filterEndDateEl.value = t;

      renderTable();
    });
  }

  // ================= 初始化 =================

  syncCategoryForAccountType();
  loadState();
  renderManualRateList();
  renderTable();
  recomputeSummary();
})();
