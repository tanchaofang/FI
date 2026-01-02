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
  const creditTotalEl = document.getElementById("creditTotal"); // 信用（区间）
  const cashTotalEl = document.getElementById("cashTotal"); // 现金（区间）

  const baseCurrencyInput = document.getElementById("baseCurrency");
  const baseCurrencyLabel = document.getElementById("baseCurrencyLabel");
  const baseCurrencyInline = document.getElementById("baseCurrencyInline");
  const manualCurrencyInput = document.getElementById("manualCurrencyInput");
  const manualRateInput = document.getElementById("manualRateInput");
  const addManualRateBtn = document.getElementById("addManualRateBtn");
  const manualRateList = document.getElementById("manualRateList");

  // ✅ 导入/导出（已移动到统计区）
  const exportBtn = document.getElementById("exportBtn");
  const importFile = document.getElementById("importFile");

  // 筛选控件
  const filterCategoryEl = document.getElementById("filterCategory");
  const filterAccountTypeEl = document.getElementById("filterAccountType");
  const filterStartDateEl = document.getElementById("filterStartDate");
  const filterEndDateEl = document.getElementById("filterEndDate");
  const clearFilterBtn = document.getElementById("clearFilterBtn");

  // ================= 工具函数 =================

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

  // 统一设置筛选日期为今天（今天~今天）
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

    parts[0] = Number(parts[0]).toLocaleString("en-US");

    if (parts.length === 1 || Number(parts[1]) === 0) {
      return parts[0];
    }
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
    if (savedBase) baseCurrencyInput.value = savedBase;
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
      if (!isNaN(g) && g > 0) nextGroupId = g;
    } else {
      let maxGroup = 0;
      records.forEach((r) => {
        if (typeof r.groupId === "number" && r.groupId > maxGroup) {
          maxGroup = r.groupId;
        }
      });
      nextGroupId = maxGroup + 1;
    }

    // 统计区间默认：开始=今天，结束=空（若用户已保存过则以保存为准）
    const savedStart = localStorage.getItem(LS_KEY_SUMMARY_START) || "";
    const savedEnd = localStorage.getItem(LS_KEY_SUMMARY_END) || "";

    const startVal = savedStart ? savedStart : todayStr();
    const endVal = savedEnd ? savedEnd : "";

    if (summaryStartDateEl) summaryStartDateEl.value = startVal;
    if (summaryEndDateEl) summaryEndDateEl.value = endVal;

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
    if (typeof groupId === "number") rec.groupId = groupId;
    records.push(rec);
    return rec.id;
  }

  function getSignedAmount(rec) {
    if (rec.accountType === "消费额") return 0;
    const sign = rec.category === "入" ? 1 : -1;
    return sign * rec.amount;
  }

  // 结束为空：代表“无上限”（从开始日起到未来所有时间）
  function inSummaryRange(rec, startDate, endDate) {
    if (!startDate && !endDate) return true;
    const d = rec.occurDate || rec.recordDate;
    if (!d) return false;

    if (startDate && d < startDate) return false;
    if (endDate && d > endDate) return false;
    return true;
  }

  // 兼容 CSV 导入：导入后 source 丢失，因此用 note 兜底识别“信用还款”
  function isCreditRepaymentTransfer(rec) {
    if (!rec) return false;
    if (rec.source === "自动:信用还款") return true;
    const note = rec.note || "";
    return typeof note === "string" && note.includes("信用还款");
  }

  // 总资产（全局累计）：不受统计区间影响
  function computeNetTotalGlobal(base) {
    let netTotalBase = 0;

    records.forEach((rec) => {
      const rate = getRateToBase(rec.currency || base);

      // 消费额不参与总资产
      if (rec.accountType === "消费额") return;

      const signed = getSignedAmount(rec);
      const inBase = signed * rate;

      // 信用还款属于内部转移：不影响总资产
      if (isCreditRepaymentTransfer(rec)) return;

      // 信用：为正不纳入总资产；为负纳入
      if (rec.accountType === "信用") {
        if (inBase < 0) netTotalBase += inBase;
      } else {
        netTotalBase += inBase;
      }
    });

    return netTotalBase;
  }

  function recomputeSummary() {
    let budgetTotalBase = 0; // 区间
    let consumeTotalBase = 0; // 区间
    let creditBase = 0; // 区间
    let cashBase = 0; // 区间

    const base = baseCurrencyInput.value || "JPY";
    const startDate = summaryStartDateEl?.value || "";
    const endDate = summaryEndDateEl?.value || "";

    // 区间统计：受统计区间影响
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

      if (rec.accountType === "预算") budgetTotalBase += inBase;
      if (rec.accountType === "信用") creditBase += inBase;
      if (rec.accountType === "现金") cashBase += inBase;
    });

    // 总资产：全局统计（不受区间影响）
    const netTotalBaseGlobal = computeNetTotalGlobal(base);

    budgetTotalEl.textContent = budgetTotalBase.toFixed(2) + " " + base;
    netTotalEl.textContent = netTotalBaseGlobal.toFixed(2) + " " + base;
    consumeTotalEl.textContent = consumeTotalBase.toFixed(2) + " " + base;

    if (creditTotalEl) creditTotalEl.textContent = creditBase.toFixed(2) + " " + base;
    if (cashTotalEl) cashTotalEl.textContent = cashBase.toFixed(2) + " " + base;

    // ✅ 总资产正负颜色切换（股票绿 / 深红）
    if (netTotalEl) {
      const negClass = "summary-value--net-negative";
      if (netTotalBaseGlobal < 0) netTotalEl.classList.add(negClass);
      else netTotalEl.classList.remove(negClass);
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
      addCell(tr, rec.note || ""); // 备注
      addCell(tr, rec.currency || ""); // 货币
      addCell(tr, rec.recordDate || "");
      addCell(tr, rec.occurDate || "");

      const srcTd = addCell(tr, rec.source || "");
      if (rec.source?.startsWith("自动")) srcTd.classList.add("auto");

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

      const note = (baseRec.note ? baseRec.note + " " : "") + "（信用还款）";

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

  // ================= CSV 处理（稳健版）=================

  function csvEscape(value) {
    const s = value === null || value === undefined ? "" : String(value);
    if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  }

  function toCSV(lines) {
    return lines.map((row) => row.map(csvEscape).join(",")).join("\r\n");
  }

  function parseCSV(text) {
    const rows = [];
    let row = [];
    let cur = "";
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];

      if (inQuotes) {
        if (ch === '"') {
          const next = text[i + 1];
          if (next === '"') {
            cur += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          cur += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === ",") {
          row.push(cur);
          cur = "";
        } else if (ch === "\n") {
          row.push(cur.replace(/\r$/, ""));
          rows.push(row);
          row = [];
          cur = "";
        } else {
          cur += ch;
        }
      }
    }

    // last cell
    row.push(cur);
    // ignore empty trailing line
    if (row.length > 1 || row[0] !== "") rows.push(row);

    return rows;
  }

  // ================= 事件绑定 =================

  // 表单默认今天
  recordDateEl.value = todayStr();
  occurDateEl.value = todayStr();

  // 账单列表筛选默认今天~今天
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

    // ✅ 添加账单前确认
    const msg =
      `确认添加这条账单？\n\n` +
      `分类：${formData.category}\n` +
      `账户：${formData.accountType}\n` +
      `金额：${formData.amount} ${formData.currency}\n` +
      `记账：${formData.recordDate}\n` +
      `发生：${formData.occurDate}\n` +
      `备注：${formData.note || "（无）"}`;

    if (!window.confirm(msg)) return;

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

  // ✅ 导出（现在在统计区）
  exportBtn.addEventListener("click", () => {
    const header = ["category", "recordDate", "occurDate", "amount", "accountType", "note", "currency", "source", "groupId", "id"];
    const lines = [header];

    // 导出所有记录，不受筛选影响
    records.forEach((rec) => {
      lines.push([
        rec.category,
        rec.recordDate || "",
        rec.occurDate || "",
        rec.amount,
        rec.accountType,
        rec.note || "",
        rec.currency || "",
        rec.source || "",
        rec.groupId ?? "",
        rec.id ?? "",
      ]);
    });

    const blob = new Blob([toCSV(lines)], {
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

  // ✅ 导入：覆盖旧记录（现在在统计区）
  importFile.addEventListener("change", () => {
    const file = importFile.files[0];
    if (file && file.name) lastExportName = file.name;
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (evt) {
      const text = evt.target.result;
      if (!text) return;

      const rows = parseCSV(String(text));
      if (!rows || rows.length <= 1) return;

      const header = rows[0];
      const idx = (name) => header.indexOf(name);

      const idxCategory = idx("category");
      const idxRecordDate = idx("recordDate");
      const idxOccurDate = idx("occurDate");
      const idxAmount = idx("amount");
      const idxAccountType = idx("accountType");
      const idxNote = idx("note");
      const idxCurrency = idx("currency");
      const idxSource = idx("source");
      const idxGroupId = idx("groupId");
      const idxId = idx("id");

      // 覆盖导入：清空之前的记录和自增 id
      records = [];
      nextId = 1;
      nextGroupId = 1;

      let maxId = 0;
      let maxGroup = 0;

      for (let i = 1; i < rows.length; i++) {
        const cols = rows[i];
        if (!cols || !cols.length) continue;

        const amount = parseFloat(cols[idxAmount]);
        if (isNaN(amount)) continue;

        const rawId = idxId >= 0 ? parseInt(cols[idxId], 10) : NaN;
        const rawGroup = idxGroupId >= 0 ? parseInt(cols[idxGroupId], 10) : NaN;

        const rec = {
          category: cols[idxCategory] ?? "",
          recordDate: cols[idxRecordDate] ?? "",
          occurDate: cols[idxOccurDate] ?? "",
          amount,
          accountType: cols[idxAccountType] ?? "",
          note: cols[idxNote] ?? "",
          currency: cols[idxCurrency] ?? "",
          source: idxSource >= 0 ? (cols[idxSource] ?? "导入") : "导入",
        };

        // 尽量恢复 id/groupId（如果导出的文件里有）
        if (!isNaN(rawId) && rawId > 0) rec.id = rawId;
        if (!isNaN(rawGroup) && rawGroup > 0) rec.groupId = rawGroup;

        records.push(rec);

        if (rec.id && rec.id > maxId) maxId = rec.id;
        if (typeof rec.groupId === "number" && rec.groupId > maxGroup) maxGroup = rec.groupId;
      }

      // 重新归一化 nextId / nextGroupId
      if (maxId > 0) nextId = maxId + 1;
      else {
        // 没有 id 的话，补齐 id
        let tmpMax = 0;
        records.forEach((r) => {
          if (!r.id) r.id = ++tmpMax;
          else tmpMax = Math.max(tmpMax, r.id);
        });
        nextId = tmpMax + 1;
      }

      if (maxGroup > 0) nextGroupId = maxGroup + 1;
      else {
        let tmpG = 0;
        records.forEach((r) => {
          if (typeof r.groupId !== "number") r.groupId = ++tmpG;
          else tmpG = Math.max(tmpG, r.groupId);
        });
        nextGroupId = tmpG + 1;
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
  if (filterCategoryEl) filterCategoryEl.addEventListener("change", renderTable);
  if (filterAccountTypeEl) filterAccountTypeEl.addEventListener("change", renderTable);
  if (filterStartDateEl) filterStartDateEl.addEventListener("change", renderTable);
  if (filterEndDateEl) filterEndDateEl.addEventListener("change", renderTable);

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
