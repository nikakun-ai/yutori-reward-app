const pdfInput = document.querySelector("#pdfInput");
const sampleButton = document.querySelector("#sampleButton");
const resetButton = document.querySelector("#resetButton");
const uploadStatus = document.querySelector("#uploadStatus");
const failurePanel = document.querySelector("#failurePanel");
const copyFallbackButton = document.querySelector("#copyFallbackButton");
const reviewPanel = document.querySelector("#reviewPanel");
const reviewCount = document.querySelector("#reviewCount");
const periodInput = document.querySelector("#periodInput");
const rowsContainer = document.querySelector("#rowsContainer");
const calculateButton = document.querySelector("#calculateButton");
const ownerEscalationButton = document.querySelector("#ownerEscalationButton");
const resultPanel = document.querySelector("#resultPanel");
const resultStatus = document.querySelector("#resultStatus");
const summaryCards = document.querySelector("#summaryCards");
const alertsContainer = document.querySelector("#alertsContainer");
const distributionTable = document.querySelector("#distributionTable");
const outputPanel = document.querySelector("#outputPanel");
const printTransferButton = document.querySelector("#printTransferButton");
const printDistributionButton = document.querySelector("#printDistributionButton");
const printNoticeButton = document.querySelector("#printNoticeButton");
const csvButton = document.querySelector("#csvButton");
const printPanel = document.querySelector("#printPanel");
const printArea = document.querySelector("#printArea");
const closePrintButton = document.querySelector("#closePrintButton");
const browserPrintButton = document.querySelector("#browserPrintButton");
const copyPrintTextButton = document.querySelector("#copyPrintTextButton");

const PAYEES = {
  yutori: {
    id: "yutori",
    name: "ゆとりBASE",
    invoice: "T0000000000000",
    bank: "ダミー銀行 ダミー支店 普通 0000000",
    note: "テスト用ダミー情報"
  },
  yosuke: {
    id: "yosuke",
    name: "ヨウスケさん",
    invoice: "未確認",
    bank: "ダミー銀行 ダミー支店 普通 1111111",
    note: "テスト用ダミー情報"
  },
  owner: {
    id: "owner",
    name: "オーナー",
    invoice: "未確認",
    bank: "ダミー銀行 ダミー支店 普通 2222222",
    note: "テスト用ダミー情報"
  }
};

const SAMPLE_ROWS = [
  {
    customer: "サンプル店舗A",
    code: "YBY001",
    plan: "ARB ベーシックプラン",
    initialFee: 70000,
    monthlyFee: 0,
    source: "サンプル"
  },
  {
    customer: "サンプル整体院B",
    code: "YBY002",
    plan: "ARB ベーシックプラン",
    initialFee: 70000,
    monthlyFee: 6000,
    source: "サンプル"
  },
  {
    customer: "サンプル美容室C",
    code: "YBY006",
    plan: "ARB アドバンスプラン",
    initialFee: 140000,
    monthlyFee: 6000,
    source: "サンプル"
  }
];

let statementRows = [];
let calculated = null;

const yen = new Intl.NumberFormat("ja-JP", {
  style: "currency",
  currency: "JPY",
  maximumFractionDigits: 0
});

function normalizeText(value) {
  return String(value || "")
    .replace(/[０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xfee0))
    .replace(/[，、]/g, ",")
    .replace(/[￥]/g, "¥")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return 0;
  const numeric = String(value).replace(/[^\d.-]/g, "");
  return numeric ? Number(numeric) : 0;
}

function currentMonthValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function setStatus(message, kind = "info") {
  uploadStatus.textContent = message;
  uploadStatus.style.color = kind === "danger" ? "var(--danger)" : "var(--muted)";
}

function showFailure(message) {
  failurePanel.classList.remove("hidden");
  reviewPanel.classList.add("hidden");
  resultPanel.classList.add("hidden");
  outputPanel.classList.add("hidden");
  setStatus(message || "このPDFは自動読取できません。オーナーへ送ってください。", "danger");
}

function clearFailure() {
  failurePanel.classList.add("hidden");
}

function parsePeriod(text) {
  const normalized = normalizeText(text);
  const match = normalized.match(/(20\d{2})[年\/.-]\s?(\d{1,2})/);
  if (!match) return currentMonthValue();
  return `${match[1]}-${String(Number(match[2])).padStart(2, "0")}`;
}

function extractAmount(block, keyword) {
  const normalized = normalizeText(block);
  const pattern = new RegExp(`${keyword}[^\\d¥円-]*[¥円]?\\s*([\\d,]+)\\s*円?`);
  const match = normalized.match(pattern);
  return match ? toNumber(match[1]) : 0;
}

function extractPlan(block) {
  if (/アルティマ|ULTIMA/i.test(block)) return "ARB アルティマプラン";
  if (/アドバンス|ADVANCE|ADVANCED/i.test(block)) return "ARB アドバンスプラン";
  if (/ベーシック|BASIC/i.test(block)) return "ARB ベーシックプラン";
  return "";
}

function extractCustomer(line, code) {
  const cleaned = normalizeText(line)
    .replace(code, "")
    .replace(/代理店コード[:：]?\s*/g, "")
    .replace(/Agency\s*Code[:：]?\s*/gi, "")
    .replace(/顧客名[:：]?\s*/g, "")
    .replace(/Customer[:：]?\s*/gi, "")
    .replace(/契約先[:：]?\s*/g, "")
    .replace(/プラン[:：]?.*/g, "")
    .replace(/Plan[:：]?.*/gi, "")
    .replace(/初期.*$/g, "")
    .replace(/月額.*$/g, "")
    .replace(/Initial.*$/gi, "")
    .replace(/Monthly.*$/gi, "")
    .trim();
  return cleaned || "顧客名未読取";
}

function extractCustomerFromBlock(block, code) {
  const normalized = normalizeText(block);
  const patterns = [
    /Customer[:：]?\s*(.+?)(?:Agency\s*Code|YBY\d{3}|Plan|Initial|Monthly|$)/i,
    /顧客名[:：]?\s*(.+?)(?:代理店コード|YBY\d{3}|プラン|初期|月額|$)/i,
    /契約先[:：]?\s*(.+?)(?:代理店コード|YBY\d{3}|プラン|初期|月額|$)/i
  ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match && normalizeText(match[1])) {
      return normalizeText(match[1]).replace(code, "").trim();
    }
  }
  return extractCustomer(normalized, code);
}

function parseStatementText(text) {
  const normalized = normalizeText(text);
  const lines = normalized.split(/\r?\n/).map((line) => normalizeText(line)).filter(Boolean);
  const rows = [];
  const codeLineIndexes = lines
    .map((line, index) => (line.match(/YBY\d{3}/i) ? index : -1))
    .filter((index) => index >= 0);
  const customerLineIndexes = lines
    .map((line, index) => (/(Customer|顧客名|契約先)/i.test(line) ? index : -1))
    .filter((index) => index >= 0);
  const recordStartIndexes = customerLineIndexes.length ? customerLineIndexes : codeLineIndexes;

  recordStartIndexes.forEach((index, recordIndex) => {
    const nextRecordIndex = recordStartIndexes[recordIndex + 1];
    const searchEnd = nextRecordIndex || Math.min(lines.length, index + 12);
    const searchStart = customerLineIndexes.length ? index : Math.max(0, index - 6);
    const block = lines.slice(searchStart, searchEnd).join(" ");
    const codeMatch = block.match(/YBY\d{3}/i);
    if (!codeMatch) return;

    const code = codeMatch[0].toUpperCase();
    let initialFee = extractAmount(block, "初期(?:手数料)?");
    let monthlyFee = extractAmount(block, "月額(?:手数料)?");
    initialFee ||= extractAmount(block, "Initial(?:\\s*Fee)?");
    monthlyFee ||= extractAmount(block, "Monthly(?:\\s*Fee)?");

    if (!initialFee && !monthlyFee) {
      const amounts = [...block.matchAll(/[¥円]?\s*([\d,]{4,})\s*円?/g)].map((match) => toNumber(match[1]));
      initialFee = amounts[0] || 0;
      monthlyFee = amounts[1] || 0;
    }

    rows.push({
      customer: extractCustomerFromBlock(block, code),
      code,
      plan: extractPlan(block),
      initialFee,
      monthlyFee,
      source: block
    });
  });

  const uniqueRows = [];
  const seen = new Set();
  rows.forEach((row) => {
    const key = `${row.customer}-${row.code}-${row.initialFee}-${row.monthlyFee}`;
    if (!seen.has(key)) {
      uniqueRows.push(row);
      seen.add(key);
    }
  });

  return {
    period: parsePeriod(normalized),
    rows: uniqueRows
  };
}

async function extractPdfText(file) {
  if (!window.pdfjsLib) {
    throw new Error("PDF読取ライブラリを読み込めませんでした。通信状態を確認してください。");
  }
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  const bytes = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: bytes }).promise;
  const pageTexts = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const pageText = content.items.map((item) => item.str).join("\n");
    pageTexts.push(pageText);
  }

  return pageTexts.join("\n");
}

function renderRows() {
  rowsContainer.innerHTML = "";
  reviewCount.textContent = `${statementRows.length}件`;
  statementRows.forEach((row, index) => {
    const card = document.createElement("article");
    const invalid = !isRowReady(row);
    card.className = `row-card${invalid ? " invalid" : ""}`;
    card.innerHTML = `
      <h3>明細 ${index + 1}${invalid ? " - 要確認" : ""}</h3>
      <div class="form-grid">
        <label class="field">
          <span>顧客名</span>
          <input data-field="customer" data-index="${index}" value="${escapeHtml(row.customer)}">
        </label>
        <label class="field">
          <span>代理店コード</span>
          <input data-field="code" data-index="${index}" value="${escapeHtml(row.code)}">
        </label>
        <label class="field">
          <span>プラン</span>
          <input data-field="plan" data-index="${index}" value="${escapeHtml(row.plan)}">
        </label>
        <label class="field">
          <span>初期手数料</span>
          <input data-field="initialFee" data-index="${index}" inputmode="numeric" value="${row.initialFee || ""}">
        </label>
        <label class="field">
          <span>月額手数料</span>
          <input data-field="monthlyFee" data-index="${index}" inputmode="numeric" value="${row.monthlyFee || ""}">
        </label>
      </div>
    `;
    rowsContainer.appendChild(card);
  });
}

function isRowReady(row) {
  return Boolean(row.customer && /^YBY\d{3}$/i.test(row.code) && row.plan && (toNumber(row.initialFee) > 0 || toNumber(row.monthlyFee) > 0));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getRules(code, type) {
  const normalizedCode = String(code || "").toUpperCase();
  if (normalizedCode === "YBY001") {
    return { yutori: 0.5, yosuke: 0.5, owner: 0 };
  }
  if (/^YBY00[2-5]$/.test(normalizedCode)) {
    if (type === "initial") {
      return { yutori: 0.3, yosuke: 0.3, owner: 0.4 };
    }
    return { yutori: 1 / 3, yosuke: 1 / 3, owner: 1 / 3 };
  }
  return null;
}

function splitAmount(amount, rule) {
  const yutori = Math.floor(amount * rule.yutori);
  const yosuke = Math.floor(amount * rule.yosuke);
  const owner = Math.floor(amount * rule.owner);
  const subtotal = yutori + yosuke + owner;
  const adjustment = amount - subtotal;
  return {
    yutori: yutori + adjustment,
    yosuke,
    owner,
    adjustment
  };
}

function calculateDistribution() {
  const rows = collectRowsFromForm();
  const items = [];
  const alerts = [];

  rows.forEach((row, index) => {
    if (!isRowReady(row)) {
      alerts.push({ type: "danger", text: `明細${index + 1}: 読取不足があります。オーナー確認へ回してください。` });
      return;
    }
    [
      { type: "initial", label: "初期", amount: toNumber(row.initialFee) },
      { type: "monthly", label: "月額", amount: toNumber(row.monthlyFee) }
    ].forEach((entry) => {
      if (!entry.amount) return;
      const rule = getRules(row.code, entry.type);
      if (!rule) {
        alerts.push({ type: "danger", text: `${row.code}: MVP未対応コードです。オーナー確認へ回してください。` });
        return;
      }
      const split = splitAmount(entry.amount, rule);
      const total = split.yutori + split.yosuke + split.owner;
      if (total !== entry.amount) {
        alerts.push({ type: "danger", text: `${row.customer}: 配分合計に差異があります。` });
      }
      items.push({ ...row, feeType: entry.label, amount: entry.amount, split });
    });
  });

  calculated = {
    period: periodInput.value || currentMonthValue(),
    items,
    alerts
  };

  renderResults();
}

function collectRowsFromForm() {
  rowsContainer.querySelectorAll("input[data-field]").forEach((input) => {
    const index = Number(input.dataset.index);
    const field = input.dataset.field;
    const value = field === "initialFee" || field === "monthlyFee" ? toNumber(input.value) : normalizeText(input.value);
    statementRows[index][field] = field === "code" ? String(value).toUpperCase() : value;
  });
  return statementRows;
}

function renderResults() {
  if (!calculated) return;
  resultPanel.classList.remove("hidden");
  const totals = sumByPayee(calculated.items);
  const hasBlockingAlert = calculated.alerts.some((alert) => alert.type === "danger");
  resultStatus.textContent = hasBlockingAlert ? "要確認" : "OK";
  outputPanel.classList.toggle("hidden", hasBlockingAlert || calculated.items.length === 0);

  summaryCards.innerHTML = Object.values(PAYEES).map((payee) => `
    <div class="summary-card">
      <span>${escapeHtml(payee.name)}</span>
      <strong>${yen.format(totals[payee.id] || 0)}</strong>
    </div>
  `).join("");

  alertsContainer.innerHTML = calculated.alerts.map((alert) => `
    <div class="alert ${alert.type === "danger" ? "danger-alert" : ""}">${escapeHtml(alert.text)}</div>
  `).join("");

  distributionTable.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>顧客</th>
          <th>コード</th>
          <th>区分</th>
          <th class="amount">原資</th>
          <th class="amount">ゆとりBASE</th>
          <th class="amount">ヨウスケさん</th>
          <th class="amount">オーナー</th>
        </tr>
      </thead>
      <tbody>
        ${calculated.items.map((item) => `
          <tr>
            <td>${escapeHtml(item.customer)}<br><small>${escapeHtml(item.plan)}</small></td>
            <td>${escapeHtml(item.code)}</td>
            <td>${escapeHtml(item.feeType)}</td>
            <td class="amount">${yen.format(item.amount)}</td>
            <td class="amount">${yen.format(item.split.yutori)}</td>
            <td class="amount">${yen.format(item.split.yosuke)}</td>
            <td class="amount">${yen.format(item.split.owner)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function sumByPayee(items) {
  return items.reduce((totals, item) => {
    totals.yutori = (totals.yutori || 0) + item.split.yutori;
    totals.yosuke = (totals.yosuke || 0) + item.split.yosuke;
    totals.owner = (totals.owner || 0) + item.split.owner;
    return totals;
  }, {});
}

function buildTransferHtml() {
  const totals = sumByPayee(calculated.items);
  return reportContent("振込明細", `
    <p class="warning">テスト用ダミー情報。実運用前に銀行情報を差し替えてください。</p>
    <table>
      <thead><tr><th>支払先</th><th>銀行情報</th><th>振込額</th><th>備考</th></tr></thead>
      <tbody>
        ${Object.values(PAYEES).map((payee) => `
          <tr>
            <td>${escapeHtml(payee.name)}</td>
            <td>${escapeHtml(payee.bank)}</td>
            <td class="right">${yen.format(totals[payee.id] || 0)}</td>
            <td>${escapeHtml(payee.note)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `);
}

function buildDistributionHtml() {
  return reportContent("報酬配分明細", `
    <p class="warning">テスト用ダミー情報。LK明細、配分率、税務処理は実運用前に確認してください。</p>
    <table>
      <thead>
        <tr><th>顧客</th><th>コード</th><th>プラン</th><th>区分</th><th>原資</th><th>ゆとりBASE</th><th>ヨウスケさん</th><th>オーナー</th></tr>
      </thead>
      <tbody>
        ${calculated.items.map((item) => `
          <tr>
            <td>${escapeHtml(item.customer)}</td>
            <td>${escapeHtml(item.code)}</td>
            <td>${escapeHtml(item.plan)}</td>
            <td>${escapeHtml(item.feeType)}</td>
            <td class="right">${yen.format(item.amount)}</td>
            <td class="right">${yen.format(item.split.yutori)}</td>
            <td class="right">${yen.format(item.split.yosuke)}</td>
            <td class="right">${yen.format(item.split.owner)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `);
}

function buildNoticeHtml() {
  const grouped = Object.values(PAYEES).map((payee) => {
    const rows = calculated.items
      .map((item) => ({ item, amount: item.split[payee.id] || 0 }))
      .filter((entry) => entry.amount > 0);
    return { payee, rows };
  });

  return reportContent("支払通知書", grouped.map(({ payee, rows }) => `
    <section class="notice">
      <h2>${escapeHtml(payee.name)} 御中</h2>
      <p>対象月: ${escapeHtml(calculated.period)} / インボイス番号: ${escapeHtml(payee.invoice)}</p>
      <table>
        <thead><tr><th>顧客</th><th>コード</th><th>区分</th><th>支払額</th></tr></thead>
        <tbody>
          ${rows.map(({ item, amount }) => `
            <tr>
              <td>${escapeHtml(item.customer)}</td>
              <td>${escapeHtml(item.code)}</td>
              <td>${escapeHtml(item.feeType)}</td>
              <td class="right">${yen.format(amount)}</td>
            </tr>
          `).join("")}
          <tr class="total"><td colspan="3">合計</td><td class="right">${yen.format(rows.reduce((sum, row) => sum + row.amount, 0))}</td></tr>
        </tbody>
      </table>
    </section>
  `).join(""));
}

function reportContent(title, body) {
  return `
    <article class="print-document">
      <h1>${escapeHtml(title)}</h1>
      <div class="meta">対象月: ${escapeHtml(calculated.period)} / 作成日: ${new Date().toLocaleDateString("ja-JP")}</div>
      ${body}
    </article>`;
}

function openReport(type) {
  if (!calculated || calculated.items.length === 0) return;
  const html = type === "transfer" ? buildTransferHtml() : type === "distribution" ? buildDistributionHtml() : buildNoticeHtml();
  printArea.innerHTML = html;
  printArea.classList.add("is-visible");
  printPanel.classList.remove("hidden");
  printPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function exportCsv() {
  if (!calculated) return;
  const header = ["対象月", "顧客", "代理店コード", "プラン", "区分", "原資", "ゆとりBASE", "ヨウスケさん", "オーナー"];
  const rows = calculated.items.map((item) => [
    calculated.period,
    item.customer,
    item.code,
    item.plan,
    item.feeType,
    item.amount,
    item.split.yutori,
    item.split.yosuke,
    item.split.owner
  ]);
  const csv = [header, ...rows].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `arb_distribution_${calculated.period}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function loadRows(rows, period = currentMonthValue()) {
  clearFailure();
  statementRows = rows.map((row) => ({ ...row, code: String(row.code || "").toUpperCase() }));
  periodInput.value = period;
  reviewPanel.classList.remove("hidden");
  resultPanel.classList.add("hidden");
  outputPanel.classList.add("hidden");
  calculated = null;
  renderRows();
}

async function handlePdfUpload(file) {
  clearFailure();
  setStatus("PDFを読取中です...");
  try {
    const text = await extractPdfText(file);
    if (normalizeText(text).length < 30) {
      showFailure("PDF内の文字を読めませんでした。画像PDFの可能性があります。");
      return;
    }
    const parsed = parseStatementText(text);
    if (!parsed.rows.length) {
      showFailure("代理店コードや金額を読取できませんでした。");
      return;
    }
    loadRows(parsed.rows, parsed.period);
    setStatus(`${parsed.rows.length}件の候補を読取しました。内容を確認してください。`);
  } catch (error) {
    showFailure(error.message);
  }
}

function resetAll() {
  statementRows = [];
  calculated = null;
  pdfInput.value = "";
  clearFailure();
  reviewPanel.classList.add("hidden");
  resultPanel.classList.add("hidden");
  outputPanel.classList.add("hidden");
  setStatus("PDFはスマホ内のブラウザで処理されます。外部APIへ送信しません。");
}

async function copyFallbackText() {
  const text = "LK支払明細PDFがアプリで自動読取できませんでした。オーナー確認へ回します。PDFを送りますので、振込明細と支払通知の作成をお願いします。";
  try {
    await navigator.clipboard.writeText(text);
    setStatus("LINE用メッセージをコピーしました。");
  } catch {
    alert(text);
  }
}

pdfInput.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  handlePdfUpload(file);
});

sampleButton.addEventListener("click", () => {
  loadRows(SAMPLE_ROWS, currentMonthValue());
  setStatus("サンプル明細を読み込みました。YBY006は要確認の動作確認用です。");
});

resetButton.addEventListener("click", resetAll);
copyFallbackButton.addEventListener("click", copyFallbackText);
ownerEscalationButton.addEventListener("click", () => showFailure("オーナー確認へ回す操作を選択しました。"));
calculateButton.addEventListener("click", calculateDistribution);
printTransferButton.addEventListener("click", () => openReport("transfer"));
printDistributionButton.addEventListener("click", () => openReport("distribution"));
printNoticeButton.addEventListener("click", () => openReport("notice"));
csvButton.addEventListener("click", exportCsv);
closePrintButton.addEventListener("click", () => {
  printPanel.classList.add("hidden");
  printArea.classList.remove("is-visible");
  printArea.innerHTML = "";
});
browserPrintButton.addEventListener("click", () => window.print());
copyPrintTextButton.addEventListener("click", async () => {
  const text = printArea.innerText || "";
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    setStatus("印刷用内容をコピーしました。");
  } catch {
    alert(text);
  }
});

rowsContainer.addEventListener("input", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  const index = Number(target.dataset.index);
  const field = target.dataset.field;
  if (!field || Number.isNaN(index)) return;
  statementRows[index][field] = field === "initialFee" || field === "monthlyFee"
    ? toNumber(target.value)
    : normalizeText(target.value);
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  });
}

periodInput.value = currentMonthValue();
