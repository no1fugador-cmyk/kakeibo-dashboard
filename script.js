// --- State Management ---
let state = {
    transactions: [],
    savings: [
        { id: 1, title: 'ハワイ旅行', target: 400000, current: 120000, deadline: '2026-09-01', emoji: '✈️' },
        { id: 2, title: '自転車', target: 50000, current: 15000, deadline: '2026-02-15', emoji: '🚲' }
    ],
    settings: {
        currency: 'JPY',
        lastTab: 'tab-today',
        activeYear: new Date().getFullYear().toString(),
        anthropicApiKey: '',
        aiEngine: 'claude',
        localApiBase: 'http://localhost:1234/v1',
        localModelName: ''
    }
};

let mainChart, innerChart;
let keypadValue = '';
let currentScannedItems = [];

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    loadState();
    initApp();
    initEventListeners();
    updateUI();
});

function loadState() {
    const savedState = localStorage.getItem('budgetApp_state');
    if (savedState) {
        state = JSON.parse(savedState);
    }
}

function saveState() {
    localStorage.setItem('budgetApp_state', JSON.stringify(state));
}

function initApp() {
    const ctxMain = document.getElementById('mainChart').getContext('2d');
    const ctxInner = document.getElementById('innerChart').getContext('2d');

    mainChart = new Chart(ctxMain, getMainChartConfig());
    innerChart = new Chart(ctxInner, getInnerChartConfig());

    // Initialize Year Selector
    const yearSelect = document.getElementById('year-select');
    if (state.settings.activeYear) {
        yearSelect.value = state.settings.activeYear;
    }

    switchTab(state.settings.lastTab || 'tab-today');
}

// --- Event Listeners ---
function initEventListeners() {
    // Year Selector
    document.getElementById('year-select').addEventListener('change', (e) => {
        state.settings.activeYear = e.target.value;
        saveState();
        updateUI();
    });

    // Tab switching
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            const target = item.getAttribute('data-target');
            switchTab(target);
        });
    });

    // Modal
    const modal = document.getElementById('input-modal');
    document.getElementById('open-modal-btn').addEventListener('click', () => {
        openInputModal();
    });

    document.getElementById('close-modal-btn').addEventListener('click', () => {
        modal.classList.add('hidden');
    });

    document.getElementById('modal-overlay').addEventListener('click', () => {
        modal.classList.add('hidden');
    });

    // Deletion
    document.getElementById('delete-transaction-btn').addEventListener('click', () => {
        const id = document.getElementById('editing-id').value;
        if (id && confirm('この収支を削除しますか？')) {
            state.transactions = state.transactions.filter(t => t.id.toString() !== id.toString());
            saveState();
            updateUI();
            modal.classList.add('hidden');
        }
    });

    // Transaction Type Toggle
    const typeButtons = [document.getElementById('type-expense'), document.getElementById('type-income')];
    typeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            typeButtons.forEach(b => {
                b.classList.remove('bg-blue-500');
                b.classList.add('bg-white/10');
            });
            btn.classList.add('bg-blue-500');
            btn.classList.remove('bg-white/10');
            btn.setAttribute('data-active', 'true');
        });
    });

    // Keypad Logic
    document.querySelectorAll('.keypad-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const val = btn.getAttribute('data-val');
            const amountInput = document.getElementById('input-amount');

            if (val === 'back') {
                keypadValue = keypadValue.slice(0, -1);
            } else if (val === 'dot') {
                if (!keypadValue.includes('.')) {
                    keypadValue += '.';
                }
            } else {
                // Prevent multiple zeros at start
                if (keypadValue === '0' && val === '0') return;
                keypadValue += val;
            }

            amountInput.value = keypadValue;
        });
    });

    // --- API Key & Settings ---
    const apiKeyInput = document.getElementById('anthropic-api-key');
    const aiEngineSelect = document.getElementById('ai-engine-select');
    const localApiBaseInput = document.getElementById('local-api-base');
    const localModelNameInput = document.getElementById('local-model-name');
    const claudeSettings = document.getElementById('claude-settings');
    const localSettings = document.getElementById('local-settings');

    function updateSettingsUI() {
        if (aiEngineSelect) {
            aiEngineSelect.value = state.settings.aiEngine || 'claude';
            if (claudeSettings) claudeSettings.classList.toggle('hidden', aiEngineSelect.value !== 'claude');
            if (localSettings) localSettings.classList.toggle('hidden', aiEngineSelect.value !== 'local');
        }
        if (apiKeyInput) apiKeyInput.value = state.settings.anthropicApiKey || '';
        if (localApiBaseInput) localApiBaseInput.value = state.settings.localApiBase || 'http://localhost:1234/v1';
        if (localModelNameInput) localModelNameInput.value = state.settings.localModelName || '';
    }

    if (aiEngineSelect) {
        aiEngineSelect.addEventListener('change', (e) => {
            state.settings.aiEngine = e.target.value;
            updateSettingsUI();
            saveState();
        });
    }

    if (apiKeyInput) {
        apiKeyInput.addEventListener('change', (e) => {
            state.settings.anthropicApiKey = e.target.value;
            saveState();
        });
    }

    if (localApiBaseInput) {
        localApiBaseInput.addEventListener('change', (e) => {
            state.settings.localApiBase = e.target.value;
            saveState();
        });
    }

    if (localModelNameInput) {
        localModelNameInput.addEventListener('change', (e) => {
            state.settings.localModelName = e.target.value;
            saveState();
        });
    }

    updateSettingsUI();

    const RECEIPT_SYSTEM_PROMPT = `あなたはレシート画像から家計簿用の情報を抽出する専門家です。 JSON形式で正確に情報を返してください。
【最重要】total_amountの決定ルール：
✅ 正しい：「お買上金額」「合計金額」「小計」
❌ 間違い：「お預かり」「お釣り」「現金」
【最重要】total_amount の決定方法（この順序で実行）：
1. items リストの price をすべて合計する
2. その合計値を total_amount として使用する
3. レシートに「お買上金額」の表示があっても、items の合計を優先する
4. 「お預かり」「お釣り」は絶対に使用しない
必須項目：
- store_name: 店舗名
- purchase_date: 購入日時（YYYY-MM-DD HH:MM形式、時刻不明なら12:00）
- total_amount: お買上金額（商品の合計金額、必ずitemsの合計と一致）
- tax_amount: 消費税額（不明な場合は0）
- items: 商品リスト（name, quantity, price）
出力形式：
{
  "store_name": "店舗名",
  "purchase_date": "2025-11-22 14:30",
  "total_amount": 1500,
  "tax_amount": 150,
  "payment_method": "現金",
  "items": [ {"name": "商品名", "quantity": 1, "price": 500} ]
}
注意：
- 金額は数値型（カンマや円記号を除く）
- total_amount は必ず items の price の合計と一致させる
- JSONのみを返す（説明不要）`;

    // --- Claude Vision API Logic ---
    async function callClaudeVisionAPI(base64Image) {
        const apiKey = state.settings.anthropicApiKey;
        if (!apiKey) throw new Error('ClaudeのAPIキーが設定されていません。設定画面で入力してください。');

        const base64Data = base64Image.split(',')[1];
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'content-type': 'application/json',
                'dangerously-allow-browser': 'true'
            },
            body: JSON.stringify({
                model: 'claude-3-5-sonnet-20241022',
                max_tokens: 1024,
                system: RECEIPT_SYSTEM_PROMPT,
                messages: [
                    {
                        role: 'user',
                        content: [
                            {
                                type: 'image',
                                source: {
                                    type: 'base64',
                                    media_type: 'image/png',
                                    data: base64Data
                                }
                            },
                            {
                                type: 'text',
                                text: 'このレシートから情報を抽出してJSONで返してください。'
                            }
                        ]
                    }
                ]
            })
        });

        if (!response.ok) {
            const errData = await response.json();
            throw new Error(`Claude API Error: ${errData.error?.message || response.statusText}`);
        }

        const result = await response.json();
        const content = result.content[0].text;
        const jsonStr = content.replace(/```json\n?|\n?```/g, '').trim();
        return JSON.parse(jsonStr);
    }

    // --- Local LLM API (OpenAI Compatible) ---
    async function callLocalLLMAPI(base64Image) {
        const baseUrl = state.settings.localApiBase || 'http://localhost:1234/v1';
        const model = state.settings.localModelName || '';

        const response = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: model,
                messages: [
                    {
                        role: "system",
                        content: RECEIPT_SYSTEM_PROMPT
                    },
                    {
                        role: "user",
                        content: [
                            {
                                type: "text",
                                text: "このレシートから情報を抽出してJSONで返してください。"
                            },
                            {
                                type: "image_url",
                                image_url: {
                                    url: base64Image
                                }
                            }
                        ]
                    }
                ],
                temperature: 0
            })
        });

        if (!response.ok) {
            throw new Error(`Local LLM API Error: ${response.statusText}`);
        }

        const result = await response.json();
        const content = result.choices[0].message.content;
        const jsonStr = content.replace(/```json\n?|\n?```/g, '').trim();
        return JSON.parse(jsonStr);
    }

    // --- Camera & OCR (Tesseract.js) ---
    const cameraContainer = document.getElementById('camera-container');
    const video = document.getElementById('camera-video');
    const captureCanvas = document.getElementById('capture-canvas');
    let stream = null;

    document.getElementById('camera-open-btn').addEventListener('click', async () => {
        try {
            stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
            video.srcObject = stream;
            cameraContainer.classList.remove('hidden');
        } catch (err) {
            alert('カメラにアクセスできません: ' + err.message);
        }
    });

    const closeCamera = () => {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            stream = null;
        }
        cameraContainer.classList.add('hidden');
        document.getElementById('analysis-overlay').classList.add('hidden');
        // Reset scan state
        document.getElementById('analysis-log').innerHTML = '';
        document.getElementById('scan-results-list').innerHTML = '';
        currentScannedItems = [];
    };

    document.getElementById('camera-close-btn').addEventListener('click', closeCamera);

    document.getElementById('capture-btn').addEventListener('click', async () => {
        const overlay = document.getElementById('analysis-overlay');
        const status = document.getElementById('analysis-status');
        const resultContainer = document.getElementById('scan-result-container');
        const log = document.getElementById('analysis-log');
        const list = document.getElementById('scan-results-list');

        overlay.classList.remove('hidden');
        status.classList.remove('hidden');
        resultContainer.classList.add('hidden');
        log.innerHTML = '> 画像をキャプチャ中...<br>';
        list.innerHTML = '';
        currentScannedItems = [];

        // Capture frame
        const ctx = captureCanvas.getContext('2d');
        captureCanvas.width = video.videoWidth;
        captureCanvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, captureCanvas.width, captureCanvas.height);
        const imageData = captureCanvas.toDataURL('image/png');

        const engine = state.settings.aiEngine || 'claude';

        try {
            if (engine === 'claude') {
                log.innerHTML += '> Claude Vision API で解析中 (高精度/有料)...<br>';
                const data = await callClaudeVisionAPI(imageData);
                displayExtractedItems(data);
            } else if (engine === 'local') {
                log.innerHTML += '> ローカルLLM で解析中 (無料)...<br>';
                const data = await callLocalLLMAPI(imageData);
                displayExtractedItems(data);
            } else {
                log.innerHTML += '> Tesseract.js (標準OCR) で解析中...<br>';
                const worker = await Tesseract.createWorker('jpn+eng');
                const { data: { text } } = await worker.recognize(imageData);
                await worker.terminate();

                log.innerHTML += '> 解析完了。項目を抽出しています...<br>';
                const items = parseTesseractResults(text);
                displayExtractedItems({ items });
            }

            status.classList.add('hidden');
            resultContainer.classList.remove('hidden');

        } catch (err) {
            log.innerHTML += `<span class="text-red-400">解析エラー: ${err.message}</span><br>`;
            if (engine === 'local') {
                log.innerHTML += '<p class="text-[10px] mt-2 text-white/50">※ローカルLLMの設定（URL）やサーバーの起動状態を確認してください。CORSエラーが発生する場合は、ブラウザやサーバー側の設定が必要です。</p>';
            } else if (engine === 'claude' && !state.settings.anthropicApiKey) {
                log.innerHTML += '<p class="text-[10px] mt-2 text-white/50">※設定画面で API キーの登録が必要です。</p>';
            }
            status.classList.add('hidden');
            console.error(err);
        }
    });

    function parseTesseractResults(text) {
        const lines = text.split('\n');
        const extracted = [];
        lines.forEach(line => {
            const priceMatch = line.match(/[¥￥\s]?([\d,]{2,10})[円\s]?$/);
            if (priceMatch) {
                const priceStr = priceMatch[1].replace(/,/g, '');
                const price = parseInt(priceStr);
                if (!isNaN(price) && price > 0) {
                    const name = line.replace(priceMatch[0], '').trim() || '不明な項目';
                    extracted.push({ name, price, category: 'food', emoji: '🏷️' });
                }
            }
        });
        if (extracted.length === 0) {
            extracted.push({ name: '', price: 0, category: 'food', emoji: '🏷️' });
        }
        return extracted;
    }

    function displayExtractedItems(data) {
        const log = document.getElementById('analysis-log');
        log.innerHTML += '> 解析完了。項目を表示します...<br>';
        if (data.items && data.items.length > 0) {
            data.items.forEach(item => {
                addItemToList({
                    name: item.name,
                    price: item.price,
                    category: 'food',
                    emoji: '🏷️'
                });
            });
        } else {
            throw new Error('項目が見つかりませんでした。');
        }
    }

    function addItemToList(item) {
        const list = document.getElementById('scan-results-list');
        const itemEl = document.createElement('div');
        itemEl.className = 'scanned-item scanned-item-card p-4 rounded-2xl flex flex-col space-y-2';

        const idx = currentScannedItems.length;
        currentScannedItems.push(item);

        itemEl.innerHTML = `
            <div class="flex items-center space-x-2">
                <input type="text" value="${item.name}" placeholder="商品名" 
                    class="scan-item-name bg-white/10 border-0 rounded-lg px-3 py-2 text-sm font-semibold flex-1 outline-none focus:bg-white/20"
                    data-index="${idx}">
                <button class="remove-scan-item text-white/30 text-xs">✕</button>
            </div>
            <div class="flex items-center justify-between">
                <div class="flex items-center space-x-2 bg-white/5 rounded-lg px-2 py-1">
                   <span class="text-xs text-white/40">¥</span>
                   <input type="number" value="${item.price}" 
                       class="scan-item-price bg-transparent border-0 w-24 text-right font-bold outline-none"
                       data-index="${idx}">
                </div>
                <select class="scan-item-category bg-white/10 border-0 rounded-lg px-2 py-1 text-[10px] outline-none" data-index="${idx}">
                    <option value="food" ${item.category === 'food' ? 'selected' : ''}>🍕食費</option>
                    <option value="transport" ${item.category === 'transport' ? 'selected' : ''}>🚌交通費</option>
                    <option value="shopping" ${item.category === 'shopping' ? 'selected' : ''}>🛍️買い物</option>
                    <option value="hobbies" ${item.category === 'hobbies' ? 'selected' : ''}>🎮趣味</option>
                    <option value="utility" ${item.category === 'utility' ? 'selected' : ''}>💡光熱費</option>
                    <option value="other" ${item.category === 'other' ? 'selected' : ''}>🏷️その他</option>
                </select>
            </div>
        `;
        list.appendChild(itemEl);

        itemEl.querySelector('.scan-item-name').addEventListener('input', (e) => {
            currentScannedItems[idx].name = e.target.value;
        });
        itemEl.querySelector('.scan-item-price').addEventListener('input', (e) => {
            currentScannedItems[idx].price = parseInt(e.target.value) || 0;
        });
        itemEl.querySelector('.scan-item-category').addEventListener('change', (e) => {
            currentScannedItems[idx].category = e.target.value;
        });
        itemEl.querySelector('.remove-scan-item').addEventListener('click', () => {
            itemEl.remove();
            currentScannedItems[idx].price = 0;
        });
    }

    document.getElementById('add-all-scanned-btn').addEventListener('click', () => {
        let count = 0;
        currentScannedItems.forEach(item => {
            if (item.price > 0) {
                state.transactions.push({
                    id: Date.now() + Math.random(),
                    amount: -item.price,
                    category: item.category,
                    date: new Date().toISOString().split('T')[0],
                    type: 'expense'
                });
                count++;
            }
        });

        saveState();
        updateUI();
        closeCamera();
        document.getElementById('input-modal').classList.add('hidden');

        if (count > 0) {
            alert(`${count}件の項目を登録しました。`);
        }
    });

    document.getElementById('re-scan-btn').addEventListener('click', () => {
        document.getElementById('analysis-overlay').classList.add('hidden');
    });

    // Save Transaction
    document.getElementById('save-transaction-btn').addEventListener('click', () => {
        const amount = parseFloat(keypadValue);
        const category = document.getElementById('input-category').value;
        const date = document.getElementById('input-date').value;
        const type = document.querySelector('#type-expense.bg-blue-500') ? 'expense' : 'income';
        const editingId = document.getElementById('editing-id').value;

        if (!keypadValue || isNaN(amount)) return alert('金額を入力してください');

        // Date check: ensure it matches active year
        const selectedYear = new Date(date).getFullYear().toString();
        if (selectedYear !== state.settings.activeYear) {
            if (!confirm(`選択された日付は ${selectedYear} 年です。現在の表示年 (${state.settings.activeYear} 年) と異なりますが保存しますか？`)) {
                return;
            }
        }

        if (editingId) {
            // Update existing
            const index = state.transactions.findIndex(t => t.id.toString() === editingId.toString());
            if (index !== -1) {
                state.transactions[index] = {
                    ...state.transactions[index],
                    amount: type === 'expense' ? -Math.abs(amount) : Math.abs(amount),
                    category,
                    date,
                    type
                };
            }
        } else {
            // Create new
            const transaction = {
                id: Date.now(),
                amount: type === 'expense' ? -Math.abs(amount) : Math.abs(amount),
                category,
                date,
                type
            };
            state.transactions.push(transaction);
        }

        keypadValue = ''; // Reset
        document.getElementById('input-amount').value = '';
        saveState();
        updateUI();
        modal.classList.add('hidden');
    });

    // Clear Data
    document.getElementById('clear-data-btn').addEventListener('click', () => {
        if (confirm('全てのデータを消去しますか？')) {
            localStorage.removeItem('budgetApp_state');
            location.reload();
        }
    });
}

function openInputModal(transaction = null) {
    const modal = document.getElementById('input-modal');
    const modalTitle = document.getElementById('modal-title');
    const deleteBtn = document.getElementById('delete-transaction-btn');
    const typeButtons = [document.getElementById('type-expense'), document.getElementById('type-income')];

    modal.classList.remove('hidden');

    if (transaction) {
        modalTitle.textContent = '収支を修正';
        deleteBtn.classList.remove('hidden');
        document.getElementById('editing-id').value = transaction.id;
        document.getElementById('input-amount').value = Math.abs(transaction.amount);
        keypadValue = Math.abs(transaction.amount).toString();
        document.getElementById('input-category').value = transaction.category;
        document.getElementById('input-date').value = transaction.date;

        typeButtons.forEach(btn => {
            btn.classList.toggle('bg-blue-500', btn.getAttribute('data-type') === transaction.type);
            btn.classList.toggle('bg-white/10', btn.getAttribute('data-type') !== transaction.type);
        });
    } else {
        modalTitle.textContent = '収支を入力';
        deleteBtn.classList.add('hidden');
        document.getElementById('editing-id').value = '';
        document.getElementById('input-amount').value = '';
        keypadValue = '';
        document.getElementById('input-category').value = 'food';
        document.getElementById('input-date').valueAsDate = new Date();

        typeButtons[0].classList.add('bg-blue-500');
        typeButtons[0].classList.remove('bg-white/10');
        typeButtons[1].classList.remove('bg-blue-500');
        typeButtons[1].classList.add('bg-white/10');
    }
}

function getTransactionsByYear() {
    return state.transactions.filter(t => {
        const year = new Date(t.date).getFullYear().toString();
        return year === state.settings.activeYear;
    });
}

// --- UI Updates ---
function updateUI() {
    const yearTransactions = getTransactionsByYear();
    const balance = yearTransactions.reduce((acc, t) => acc + t.amount, 0);
    document.getElementById('total-balance').textContent = formatCurrency(balance);

    // Daily budget calculation
    const today = new Date();
    const activeYearStr = state.settings.activeYear;
    const isCurrentYear = today.getFullYear().toString() === activeYearStr;

    let remainingDays = 0;
    if (isCurrentYear) {
        const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
        remainingDays = lastDayOfMonth - today.getDate() + 1;
    } else {
        // Simple logic for non-current years: show 0 or hypothetical
        remainingDays = 30;
    }

    const dailyBudget = (balance > 0 && isCurrentYear) ? balance / remainingDays : 0;
    document.getElementById('daily-budget').textContent = formatCurrency(dailyBudget);

    // Update Chart overlay
    document.getElementById('chart-overlay').textContent = isCurrentYear ? `今日 ${formatCurrency(balance)}` : `${activeYearStr}年計 ${formatCurrency(balance)}`;

    updateCharts();
    renderHistory();
    renderSavings();
    updateBreakdown();
}

function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.add('hidden'));
    document.getElementById(tabId).classList.remove('hidden');

    document.querySelectorAll('.nav-item').forEach(nav => {
        nav.classList.remove('active');
        if (nav.getAttribute('data-target') === tabId) {
            nav.classList.add('active');
        }
    });

    state.settings.lastTab = tabId;
    saveState();
}

function renderHistory() {
    const list = document.getElementById('history-list');
    const yearTransactions = getTransactionsByYear();

    if (yearTransactions.length === 0) {
        list.innerHTML = '<div class="text-center text-white/50 py-10">履歴がまだありません</div>';
        return;
    }

    list.innerHTML = yearTransactions
        .slice()
        .reverse()
        .map(t => `
            <div class="bg-white/10 backdrop-blur-xl rounded-2xl p-4 flex justify-between items-center border border-white/5 group">
                <div class="flex items-center space-x-3">
                    <div class="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center">
                        ${getCategoryEmoji(t.category)}
                    </div>
                    <div>
                        <p class="font-bold capitalize text-sm">${getCategoryName(t.category)}</p>
                        <p class="text-[10px] text-white/40">${t.date}</p>
                    </div>
                </div>
                <div class="flex items-center space-x-4">
                    <div class="${t.amount < 0 ? 'text-white' : 'text-blue-400'} font-bold">
                        ${t.amount < 0 ? '-' : '+'}${formatCurrency(Math.abs(t.amount))}
                    </div>
                    <button class="edit-btn text-white/30 hover:text-white transition-colors" data-id="${t.id}">✏️</button>
                </div>
            </div>
        `).join('');

    // Add event listeners to edit buttons
    list.querySelectorAll('.edit-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-id');
            const transaction = state.transactions.find(t => t.id.toString() === id.toString());
            if (transaction) {
                openInputModal(transaction);
            }
        });
    });
}

function renderSavings() {
    const list = document.getElementById('savings-list');
    list.innerHTML = state.savings.map(s => {
        const remainingMonths = calculateMonthsRemaining(s.deadline);
        return `
            <div class="flex items-center justify-between group">
                <div class="flex items-center space-x-3">
                    <div class="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">${s.emoji}</div>
                    <div>
                        <p class="text-sm font-semibold">${s.title}</p>
                    </div>
                </div>
                <div class="text-right">
                    <p class="text-sm font-bold">${formatCurrency(s.target)}</p>
                    <p class="text-[10px] text-white/50">${remainingMonths > 0 ? remainingMonths + 'か月後' : '来月'}</p>
                </div>
            </div>
        `;
    }).join('');
}

function updateBreakdown() {
    const totalSaved = state.savings.reduce((acc, s) => acc + s.current, 0);
    const totalTarget = state.savings.reduce((acc, s) => acc + s.target, 0);
    const percent = totalTarget > 0 ? Math.round((totalSaved / totalTarget) * 100) : 0;

    document.getElementById('breakdown-percent').textContent = `${percent}%`;
    document.getElementById('breakdown-title').textContent = 'いざという時の備え';
    document.getElementById('breakdown-desc').textContent = `${formatCurrency(totalTarget)}のうち ${formatCurrency(totalSaved)} 貯めた`;

    innerChart.data.datasets[0].data = [percent, 100 - percent];
    innerChart.update();
}

// --- Chart Configurations ---
function updateCharts() {
    const activeYearStr = state.settings.activeYear;
    const today = new Date();
    const isCurrentYear = today.getFullYear().toString() === activeYearStr;

    // Generate date labels
    let labels = [];
    if (isCurrentYear) {
        // Last 7 days
        labels = Array.from({ length: 7 }, (_, i) => {
            const d = new Date();
            d.setDate(d.getDate() - (6 - i));
            return d.toISOString().split('T')[0];
        });
    } else {
        // Just some sample points for non-current years (e.g., month ends)
        labels = Array.from({ length: 6 }, (_, i) => `${activeYearStr}-${String((i + 1) * 2).padStart(2, '0')}-01`);
    }

    const chartData = labels.map(date => {
        return state.transactions
            .filter(t => t.date <= date)
            .reduce((acc, t) => acc + t.amount, 0);
    });

    mainChart.data.labels = labels;
    mainChart.data.datasets[0].data = chartData;
    mainChart.update();
}

function getMainChartConfig() {
    return {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Balance',
                data: [],
                borderColor: 'white',
                borderWidth: 3,
                fill: true,
                backgroundColor: (context) => {
                    const ctx = context.chart.ctx;
                    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
                    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.3)');
                    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
                    return gradient;
                },
                tension: 0.4,
                pointRadius: 4,
                pointBackgroundColor: 'white'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { enabled: true } },
            scales: {
                x: { grid: { display: false }, ticks: { color: 'rgba(255, 255, 255, 0.5)', maxRotation: 0 } },
                y: { display: false }
            }
        }
    };
}

function getInnerChartConfig() {
    return {
        type: 'doughnut',
        data: {
            datasets: [{
                data: [0, 100],
                backgroundColor: ['#8b5cf6', 'rgba(255, 255, 255, 0.1)'],
                borderWidth: 0,
                cutout: '80%'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { enabled: false } }
        }
    };
}

// --- Helpers ---
function formatCurrency(amount) {
    return '¥' + Math.floor(amount).toLocaleString();
}

function getCategoryEmoji(cat) {
    const emojis = { food: '🍕', transport: '🚌', shopping: '🛍️', hobbies: '🎮', utility: '💡', other: '🏷️' };
    return emojis[cat] || '🏷️';
}

function getCategoryName(cat) {
    const names = { food: '食費', transport: '交通費', shopping: '買い物', hobbies: '趣味', utility: '光熱費', other: 'その他' };
    return names[cat] || 'その他';
}

function calculateMonthsRemaining(deadline) {
    const now = new Date();
    const target = new Date(deadline);
    return (target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth());
}
