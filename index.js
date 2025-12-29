    (function () {
      let records = [];
      let nextId = 1;
      let nextGroupId = 1;

      const LS_KEY_RECORDS = "de_records";
      const LS_KEY_NEXT_ID = "de_nextId";
      const LS_KEY_BASE = "de_baseCurrency";
      const LS_KEY_MANUAL = "de_manualRates";
      const LS_KEY_GROUP = "de_nextGroupId";

      const accountTypesForExpenseMirror = ["现金", "共同资产", "存款", "日信", "中信"];

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

      /* 新增：筛选控件引用 */
      const filterCategoryEl = document.getElementById("filterCategory");
      const filterAccountTypeEl = document.getElementById("filterAccountType");
      const filterStartDateEl = document.getElementById("filterStartDate");
      const filterEndDateEl = document.getElementById("filterEndDate");
      const clearFilterBtn = document.getElementById("clearFilterBtn");

      let manualRates = {};

      function todayStr() {
        const d = new Date();
        return d.toISOString().slice(0, 10);
      }

      recordDateEl.value = todayStr();
      occurDateEl.value = todayStr();
      if (summaryMonthEl) {
        summaryMonthEl.value = todayStr().slice(0, 7);
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
      accountTypeEl.addEventListener("change", syncCategoryForAccountType);

      function renderManualRateList() {
        const entries = Object.entries(manualRates || {});
        if (!entries.length) {
          manualRateList.textContent = "（无）";
          return;
        }
        manualRateList.textContent = entries.map(([c, r]) => `${c}:${r}`).join("；");
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
        try {
          const recStr = localStorage.getItem(LS_KEY_RECORDS);
          if (recStr) {
            const arr = JSON.parse(recStr);
            if (Array.isArray(arr)) records = arr;
          }
        } catch (e) { console.log("读取记录失败：", e); }

        const savedNextId = localStorage.getItem(LS_KEY_NEXT_ID);
        if (savedNextId) {
          const n = parseInt(savedNextId, 10);
          if (!isNaN(n) && n > 0) nextId = n;
        } else {
          let maxId = 0;
          records.forEach(r => { if (r.id && r.id > maxId) maxId = r.id; });
          nextId = maxId + 1;
        }

        const savedBase = localStorage.getItem(LS_KEY_BASE);
        if (savedBase) {
          baseCurrencyInput.value = savedBase;
          baseCurrencyLabel.textContent = savedBase;
          baseCurrencyInline.textContent = savedBase;
        }

        try {
          const savedManual = localStorage.getItem(LS_KEY_MANUAL);
          if (savedManual) {
            const obj = JSON.parse(savedManual);
            if (obj && typeof obj === "object") manualRates = obj;
          }
        } catch (e) { console.log("读取手动汇率失败：", e); }

        const savedGroup = localStorage.getItem(LS_KEY_GROUP);
        if (savedGroup) {
          const g = parseInt(savedGroup, 10);
          if (!isNaN(g) && g > 0) {
            nextGroupId = g;
          }
        } else {
          let maxGroup = 0;
          records.forEach(r => {
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
          source: fromForm.source || "手动"
        };
        addRecord(baseRec, groupId);

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
            source: "自动:消费对应"
          };
          addRecord(expenseRec, groupId);
        }

        if (
          baseRec.category === "出" &&
          (baseRec.accountType === "日信" || baseRec.accountType === "中信")
        ) {
          const occur = new Date(baseRec.occurDate || baseRec.recordDate || todayStr());
          const year = occur.getFullYear();
          const month = occur.getMonth();
          const nextMonth = (month + 1) % 12;
          const nextYear = year + (nextMonth === 0 ? 1 : 0);
          const repaymentDate = new Date(nextYear, nextMonth, 27);
          const dateStr = repaymentDate.toISOString().slice(0, 10);

          const cashOut = {
            category: "出",
            accountType: "现金",
            amount: baseRec.amount,
            currency: baseRec.currency,
            recordDate: dateStr,
            occurDate: dateStr,
            note: baseRec.note + "（信用卡还款）",
            source: "自动:信用卡还款"
          };
          const cardIn = {
            category: "入",
            accountType: baseRec.accountType,
            amount: baseRec.amount,
            currency: baseRec.currency,
            recordDate: dateStr,
            occurDate: dateStr,
            note: baseRec.note + "（信用卡还款）",
            source: "自动:信用卡还款"
          };

          addRecord(cashOut, groupId);
          addRecord(cardIn, groupId);
        }
      }

      function getSignedAmount(rec) {
        if (rec.accountType === "消费") {
          return 0;
        }
        const sign = (rec.category === "入") ? 1 : -1;
        return sign * rec.amount;
      }

      function recomputeSummary() {
        let budgetTotalBase = 0;
        let netTotalBase = 0;
        let consumeTotalBase = 0;
        const base = baseCurrencyInput.value || "JPY";
        const monthFilter = summaryMonthEl && summaryMonthEl.value ? summaryMonthEl.value : null;

        function inMonth(rec) {
          if (!monthFilter) return true;
          const d = rec.occurDate || rec.recordDate;
          if (!d) return false;
          return d.slice(0, 7) === monthFilter;
        }

        records.forEach(rec => {
          if (!inMonth(rec)) return;

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
        baseCurrencyLabel.textContent = base;
        baseCurrencyInline.textContent = base;
      }

      function addCell(tr, text) {
        const td = document.createElement("td");
        td.textContent = text;
        tr.appendChild(td);
        return td;
      }

      function getRecordDateForFilter(rec) {
        // 过滤时间优先使用发生时间，其次记账时间
        return rec.occurDate || rec.recordDate || "";
      }

      function renderTable() {
        recordsTbody.innerHTML = "";

        // 基于原始 records 先做筛选
        let displayList = [...records];

        if (filterCategoryEl && filterCategoryEl.value) {
          const c = filterCategoryEl.value;
          displayList = displayList.filter(r => r.category === c);
        }

        if (filterAccountTypeEl && filterAccountTypeEl.value) {
          const a = filterAccountTypeEl.value;
          displayList = displayList.filter(r => r.accountType === a);
        }

        if (filterStartDateEl && filterStartDateEl.value) {
          const start = filterStartDateEl.value;
          displayList = displayList.filter(r => {
            const d = getRecordDateForFilter(r);
            if (!d) return false;
            return d >= start; // YYYY-MM-DD 字符串可直接比较
          });
        }

        if (filterEndDateEl && filterEndDateEl.value) {
          const end = filterEndDateEl.value;
          displayList = displayList.filter(r => {
            const d = getRecordDateForFilter(r);
            if (!d) return false;
            return d <= end;
          });
        }

        // 按 id 倒序（最新在前）
        displayList.sort((a, b) => b.id - a.id);

        // 只显示前 10 条记录
        displayList = displayList.slice(0, 10);

        displayList.forEach(rec => {
          const tr = document.createElement("tr");

          const tdOps = document.createElement("td");
          const editBtn = document.createElement("button");
          editBtn.textContent = "编辑";
          editBtn.className = "small";

          const delBtn = document.createElement("button");
          delBtn.textContent = "删除";
          delBtn.className = "small btn-danger";

          const isAuto = rec.source && rec.source.startsWith("自动");
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

          const displayAmount = rec.amount;

          addCell(tr, rec.category);
          addCell(tr, rec.accountType);
          addCell(tr, displayAmount.toFixed(2));
          addCell(tr, rec.currency || "");
          addCell(tr, rec.recordDate || "");
          addCell(tr, rec.occurDate || "");
          addCell(tr, rec.note || "");
          const srcTd = addCell(tr, rec.source || "");
          if (rec.source && rec.source.startsWith("自动")) {
            srcTd.classList.add("auto");
          }

          recordsTbody.appendChild(tr);
        });
      }

      function editRecord(id) {
        const rec = records.find(r => r.id === id);
        if (!rec) return;

        categoryEl.value = rec.category;
        accountTypeEl.value = rec.accountType;
        amountEl.value = rec.amount;
        currencyEl.value = rec.currency;
        recordDateEl.value = rec.recordDate;
        occurDateEl.value = rec.occurDate;
        noteEl.value = rec.note;
        syncCategoryForAccountType();

        if (rec.source === "手动" && typeof rec.groupId === "number") {
          records = records.filter(r => r.groupId !== rec.groupId);
        } else {
          records = records.filter(r => r.id !== id);
        }

        renderTable();
        recomputeSummary();
        saveState();
      }

      function deleteRecord(id) {
        const rec = records.find(r => r.id === id);
        if (!rec) return;

        if (rec.source === "手动" && typeof rec.groupId === "number") {
          records = records.filter(r => r.groupId !== rec.groupId);
        } else {
          records = records.filter(r => r.id !== id);
        }

        renderTable();
        recomputeSummary();
        saveState();
      }

      entryForm.addEventListener("submit", function (e) {
        e.preventDefault();

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
          amount: amount,
          currency: currencyEl.value || "JPY",
          recordDate: recordDateEl.value || todayStr(),
          occurDate: occurDateEl.value || todayStr(),
          note: noteEl.value || "",
          source: "手动"
        };
        addRecordWithRules(formData);
        renderTable();
        recomputeSummary();
        saveState();
      });

      resetFormBtn.addEventListener("click", function () {
        entryForm.reset();
        recordDateEl.value = todayStr();
        occurDateEl.value = todayStr();
        currencyEl.value = "JPY";
        syncCategoryForAccountType();
      });

      baseCurrencyInput.addEventListener("input", () => {
        const v = baseCurrencyInput.value || "JPY";
        baseCurrencyLabel.textContent = v;
        baseCurrencyInline.textContent = v;

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
        const header = ["category", "recordDate", "occurDate", "amount", "accountType", "note", "currency"];
        const lines = [header.join(",")];

        // 导出仍然导出所有记录，不受“只显示 10 条”和筛选影响
        records.forEach(rec => {
          const row = [
            rec.category,
            rec.recordDate || "",
            rec.occurDate || "",
            rec.amount,
            rec.accountType,
            rec.note || "",
            rec.currency || ""
          ];
          lines.push(row.join(","));
        });

        const blob = new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "records.csv";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      });

      importFile.addEventListener("change", () => {
        const file = importFile.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function (evt) {
          const text = evt.target.result;
          if (!text) return;
          const lines = text.split(/\r?\n/).filter(Boolean);
          if (lines.length <= 1) return;

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
              amount: amount,
              accountType: cols[idxAccountType],
              note: cols[idxNote],
              currency: cols[idxCurrency],
              source: "导入"
            };
            addRecord(rec);
          }

          renderTable();
          recomputeSummary();
          saveState();
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

      /* 新增：筛选事件绑定 */
      if (filterCategoryEl) {
        filterCategoryEl.addEventListener("change", () => renderTable());
      }
      if (filterAccountTypeEl) {
        filterAccountTypeEl.addEventListener("change", () => renderTable());
      }
      if (filterStartDateEl) {
        filterStartDateEl.addEventListener("change", () => renderTable());
      }
      if (filterEndDateEl) {
        filterEndDateEl.addEventListener("change", () => renderTable());
      }
      if (clearFilterBtn) {
        clearFilterBtn.addEventListener("click", () => {
          if (filterCategoryEl) filterCategoryEl.value = "";
          if (filterAccountTypeEl) filterAccountTypeEl.value = "";
          if (filterStartDateEl) filterStartDateEl.value = "";
          if (filterEndDateEl) filterEndDateEl.value = "";
          renderTable();
        });
      }

      syncCategoryForAccountType();
      loadState();
      renderManualRateList();
      renderTable();
      recomputeSummary();
    })();