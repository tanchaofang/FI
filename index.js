(function () {
  // ================= 常量 & 全局状态 =================
  let records = [];
  let nextId = 1;
  let nextGroupId = 1;
  let manualRates = {};
  let lastExportName = "";

  const LS_KEY_RECORDS = "de_records";
  const LS_KEY_NEXT_ID = "de_nextId";
  const LS_KEY_BASE = "de_baseCurrency";
  const LS_KEY_MANUAL = "de_manualRates";
  const LS_KEY_GROUP = "de_nextGroupId";
  const LS_KEY_SUMMARY_START = "de_summaryStartDate";
  const LS_KEY_SUMMARY_END = "de_summaryEndDate";
  const LS_KEY_EXPORT_NAME = "de_lastExportName";

  const accountTypesForExpenseMirror = ["现金", "信用"];

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
  const summaryStartDateEl = document.getElementById("summaryStartDate");
  const summaryEndDateEl = document.getElementById("summaryEndDate");

  // 专项汇总 DOM
  const creditTotalEl = document.getElementById("creditTotal");         // 信用
  const creditHintEl = document.getElementById("creditHint");          // 信用提示
  const cashTotalEl = document.getElementById("cashTotal");             // 现金

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

  // 默认时区：跟随用户当前设备/网络所在地(浏览器时区)
  function getLocalTimeZone() {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch (e) {
      return "UTC";
    }
  }

  // 本地日期字符串：YYYY-MM-DD（避免 toISOString() 的 UTC 偏移）
  function todayStr() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  // 解析 YYYY-MM-DD 为“本地时区”的 Date（避免 new Date('YYYY-MM-DD') 的 UTC 解析差异）
  function parseLocalYMD(ymd) {
    return new Date(`${ymd}T00:00:00`);
  }

  // 统一设置筛选日期为今天（优化重复代码）
  function setFilterDatesToToday() {
    const t = todayStr();
    if (filterStartDateEl) filterStartDateEl.value = t;
    if (filterEndDateEl) filterEndDateEl.value = t;
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
      localStorage.setItem(LS_KEY_SUMMARY_START, summaryStartDateEl?.value || "");
      localStorage.setItem(LS_KEY_SUMMARY_END, summaryEndDateEl?.value || "");
      localStorage.setItem(LS_KEY_EXPORT_NAME, lastExportName || "");
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

    // 统计区间
    const savedStart = localStorage.getItem(LS_KEY_SUMMARY_START) || "";
    const savedEnd = localStorage.getItem(LS_KEY_SUMMARY_END) || "";
    if (summaryStartDateEl) summaryStartDateEl.value = savedStart;
    if (summaryEndDateEl) summaryEndDateEl.value = savedEnd;

    // 上次导入的导出文件名
    lastExportName = localStorage.getItem(LS_KEY_EXPORT_NAME) || "";
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
    if (rec.accountType === "消费额") {
      return 0;
    }
    const sign = rec.category === "入" ? 1 : -1;
    return sign * rec.amount;
  }

  function inSummaryRange(rec, startDate, endDate) {
    // startDate / endDate are "YYYY-MM-DD" or empty
    if (!startDate && !endDate) return true;
    const d = rec.occurDate || rec.recordDate;
    if (!d) return false;

    if (startDate && d < startDate) return false;
    if (endDate && d > endDate) return false;
    return true;
  }

  function recomputeSummary() {
    let budgetTotalBase = 0;
    let netTotalBase = 0;
    let consumeTotalBase = 0;

    let creditBase = 0; // 信用
    let cashBase = 0;   // 现金

    const base = baseCurrencyInput.value || "JPY";
    const startDate = summaryStartDateEl?.value || "";
    const endDate = summaryEndDateEl?.value || "";

    records.forEach((rec) => {
      if (!inSummaryRange(rec, startDate, endDate)) return;

      const rate = getRateToBase(rec.currency || base);

      // 消费额统计（正值累加）
      if (rec.accountType === "消费额") {
        consumeTotalBase += rec.amount * rate;
        return;
      }

      const signed = getSignedAmount(rec);
      const inBase = signed * rate;

      // 预算
      if (rec.accountType === "预算") {
        budgetTotalBase += inBase;
      }

      // 信用
      if (rec.accountType === "信用") {
        creditBase += inBase;
      }

      // 现金
      if (rec.accountType === "现金") {
        cashBase += inBase;
      }

      // 总资产：默认包含除“消费额”外全部账户
      // 但“信用”为正时不计入总资产；仅当“信用”为负时计入
      if (rec.accountType === "信用") {
        if (inBase < 0) {
          netTotalBase += inBase;
        }
      } else {
        netTotalBase += inBase;
      }
    });

    budgetTotalEl.textContent = budgetTotalBase.toFixed(2) + " " + base;
    netTotalEl.textContent = netTotalBase.toFixed(2) + " " + base;
    consumeTotalEl.textContent = consumeTotalBase.toFixed(2) + " " + base;

    if (creditTotalEl) {
      creditTotalEl.textContent = creditBase.toFixed(2) + " " + base;
    }
    if (cashTotalEl) {
      cashTotalEl.textContent = cashBase.toFixed(2) + " " + base;
    }

    if (creditHintEl) {
      creditHintEl.textContent =
        creditBase > 0 ? "未纳入总资产" : "";
    }

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

    // 按 id 倒序，显示所有符合条件的记录
    displayList.sort((a, b) => b.id - a.id);
    return displayList;
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

      // 其他列（顺序：分类 / 账户类型 / 金额 / 备注 / 货币 / 记账时间 / 发生时间 / 来源）
      addCell(tr, rec.category);
      addCell(tr, rec.accountType);
      addCell(tr, formatAmount(rec.amount)); // 金额（第 4 列）
      addCell(tr, rec.note || "");          // 备注
      addCell(tr, rec.currency || "");      // 货币
      addCell(tr, rec.recordDate || "");
      addCell(tr, rec.occurDate || "");

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

    // 自动“消费额 入”记录
    if (
      baseRec.category === "出" &&
      accountTypesForExpenseMirror.includes(baseRec.accountType)
    ) {
      const expenseRec = {
        category: "入",
        accountType: "消费额",
        amount: baseRec.amount,
        currency: baseRec.currency,
        recordDate: baseRec.recordDate,
        occurDate: baseRec.occurDate,
        note: baseRec.note,
        source: "自动:消费对应",
      };
      addRecord(expenseRec, groupId);
    }

    // 信用还款记录：次月27日 出 现金 / 入 信用
    if (baseRec.category === "出" && baseRec.accountType === "信用") {
      const occurStr = baseRec.occurDate || baseRec.recordDate || todayStr();
      const occur = parseLocalYMD(occurStr);

      const year = occur.getFullYear();
      const month = occur.getMonth();
      const nextMonth = (month + 1) % 12;
      const nextYear = year + (nextMonth === 0 ? 1 : 0);
      const repaymentDate = new Date(nextYear, nextMonth, 27);

      // 生成本地 YYYY-MM-DD（避免 toISOString()）
      const dateStr = (() => {
        const y = repaymentDate.getFullYear();
        const m = String(repaymentDate.getMonth() + 1).padStart(2, "0");
        const d = String(repaymentDate.getDate()).padStart(2, "0");
        return `${y}-${m}-${d}`;
      })();

      const note =
        (baseRec.note ? baseRec.note + " " : "") + "（信用还款）";

      const cashOut = {
        category: "出",
        accountType: "现金",
        amount: baseRec.amount,
        currency: baseRec.currency,
        recordDate: dateStr,
        occurDate: dateStr,
        note,
        source: "自动:信用还款",
      };
      const creditIn = {
        category: "入",
        accountType: "信用",
        amount: baseRec.amount,
        currency: baseRec.currency,
        recordDate: dateStr,
        occurDate: dateStr,
        note,
        source: "自动:信用还款",
      };

      addRecord(cashOut, groupId);
      addRecord(creditIn, groupId);
    }
  }

  function syncCategoryForAccountType() {
    const acc = accountTypeEl.value;
    if (acc === "消费额") {
      categoryEl.value = "入";
      categoryEl.disabled = true;
    } else if (acc === "信用") {
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

  // 初始化日期（表单默认今天；统计区间默认空）
  recordDateEl.value = todayStr();
  occurDateEl.value = todayStr();

  // 筛选时间默认是“今天”
  setFilterDatesToToday();

  accountTypeEl.addEventListener("change", syncCategoryForAccountType);

  entryForm.addEventListener("submit", function (e) {
    e.preventDefault();

    // 信用只能“出”
    if (accountTypeEl.value === "信用" && categoryEl.value === "入") {
      alert("信用手动录入时只能选择“出”。“入”记录请通过自动转记生成。");
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

    // 导出所有记录，不受筛选影响
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

    const name = (lastExportName || "Fi-all.csv").trim() || "Fi-all.csv";
    a.download = name.toLowerCase().endsWith(".csv") ? name : name + ".csv";

    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  // 导入：覆盖旧记录
  importFile.addEventListener("change", () => {
    const file = importFile.files[0];
    if (file && file.name) {
      lastExportName = file.name;
    }
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

  // 统计区间事件绑定
  if (summaryStartDateEl) {
    summaryStartDateEl.addEventListener("change", () => {
      recomputeSummary();
      saveState();
    });
  }
  if (summaryEndDateEl) {
    summaryEndDateEl.addEventListener("change", () => {
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
      setFilterDatesToToday();
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
