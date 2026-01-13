// --- State Management ---
let state = {
    transactions: [],
    savings: [
        { id: 1, title: 'ハワイ旅行', target: 400000, current: 120000, deadline: '2026-09-01', emoji: '✈️' },
        { id: 2, title: '自転車', target: 50000, current: 15000, deadline: '2026-02-15', emoji: '🚲' }
    ],
    settings: {
        currency: 'JPY',
        lastTab: 'tab-today'
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

    switchTab(state.settings.lastTab || 'tab-today');
}

// --- Event Listeners ---
function initEventListeners() {
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
        modal.classList.remove('hidden');
        // Reset modal state
        document.getElementById('input-amount').value = '';
        document.getElementById('input-date').valueAsDate = new Date();
    });

    document.getElementById('close-modal-btn').addEventListener('click', () => {
        modal.classList.add('hidden');
    });

    document.getElementById('modal-overlay').addEventListener('click', () => {
        modal.classList.add('hidden');
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

    // --- Camera & OCR Simulation ---
    const cameraContainer = document.getElementById('camera-container');
    const video = document.getElementById('camera-video');
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

    document.getElementById('capture-btn').addEventListener('click', () => {
        const overlay = document.getElementById('analysis-overlay');
        const status = document.getElementById('analysis-status');
        const resultContainer = document.getElementById('scan-result-container');
        const log = document.getElementById('analysis-log');
        const list = document.getElementById('scan-results-list');

        overlay.classList.remove('hidden');
        status.classList.remove('hidden');
        resultContainer.classList.add('hidden');
        log.innerHTML = '';
        list.innerHTML = '';
        currentScannedItems = [];

        // Simulate "AI Analysis" with itemized extraction
        const analysisSteps = [
            'レシート画像を解析中...',
            '文字領域を特定...',
            '商品名を認識: 卵, 牛乳, 食パン...',
            '各項目の金額を紐付け...',
            '解析が完了しました。'
        ];

        const mockItems = [
            { name: '卵 (10個入)', price: 298, category: 'food', emoji: '🥚' },
            { name: '成分無調整牛乳', price: 238, category: 'food', emoji: '🥛' },
            { name: '高級食パン', price: 450, category: 'food', emoji: '🍞' },
            { name: 'ゴミ袋 (45L)', price: 198, category: 'other', emoji: '🗑️' }
        ];

        let stepIndex = 0;
        const interval = setInterval(() => {
            if (stepIndex < analysisSteps.length) {
                log.innerHTML += `> ${analysisSteps[stepIndex]}<br>`;
                stepIndex++;
            } else {
                clearInterval(interval);

                // Show items one by one
                status.classList.add('hidden');
                resultContainer.classList.remove('hidden');

                mockItems.forEach((item, i) => {
                    currentScannedItems.push(item);
                    setTimeout(() => {
                        const itemEl = document.createElement('div');
                        itemEl.className = 'scanned-item scanned-item-card p-4 rounded-2xl flex justify-between items-center';
                        itemEl.innerHTML = `
                            <div class="flex items-center space-x-3">
                                <span class="text-xl">${item.emoji}</span>
                                <span class="text-sm font-semibold">${item.name}</span>
                            </div>
                            <span class="font-bold">¥${item.price.toLocaleString()}</span>
                        `;
                        list.appendChild(itemEl);
                        document.getElementById('scanned-count').textContent = currentScannedItems.length;
                    }, i * 300);
                });
            }
        }, 500);
    });

    document.getElementById('add-all-scanned-btn').addEventListener('click', () => {
        currentScannedItems.forEach(item => {
            state.transactions.push({
                id: Date.now() + Math.random(), // Unique ID
                amount: -item.price,
                category: item.category,
                date: new Date().toISOString().split('T')[0],
                type: 'expense'
            });
        });

        saveState();
        updateUI();
        closeCamera();
        document.getElementById('input-modal').classList.add('hidden');

        // Visual feedback
        alert(`${currentScannedItems.length}件の項目を登録しました。`);
    });

    document.getElementById('re-scan-btn').addEventListener('click', () => {
        document.getElementById('analysis-overlay').classList.add('hidden');
    });

    // Save Transaction
    document.getElementById('save-transaction-btn').addEventListener('click', () => {
        const amount = parseFloat(keypadValue);
        const category = document.getElementById('input-category').value;
        const date = document.getElementById('input-date').value;
        const type = document.querySelector('[data-active="true"]')?.getAttribute('data-type') || 'expense';

        if (!keypadValue || isNaN(amount)) return alert('金額を入力してください');

        const transaction = {
            id: Date.now(),
            amount: type === 'expense' ? -Math.abs(amount) : Math.abs(amount),
            category,
            date,
            type
        };

        state.transactions.push(transaction);
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

// --- UI Updates ---
function updateUI() {
    const balance = state.transactions.reduce((acc, t) => acc + t.amount, 0);
    document.getElementById('total-balance').textContent = formatCurrency(balance);

    // Daily budget calculation
    const today = new Date();
    const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const remainingDays = lastDayOfMonth - today.getDate() + 1;
    const dailyBudget = balance > 0 ? balance / remainingDays : 0;
    document.getElementById('daily-budget').textContent = formatCurrency(dailyBudget);

    // Update Chart overlay
    document.getElementById('chart-overlay').textContent = `今日 ${formatCurrency(balance)}`;

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
    if (state.transactions.length === 0) {
        list.innerHTML = '<div class="text-center text-white/50 py-10">履歴がまだありません</div>';
        return;
    }

    list.innerHTML = state.transactions
        .slice()
        .reverse()
        .map(t => `
            <div class="bg-white/10 backdrop-blur-xl rounded-2xl p-4 flex justify-between items-center border border-white/5">
                <div class="flex items-center space-x-3">
                    <div class="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center">
                        ${getCategoryEmoji(t.category)}
                    </div>
                    <div>
                        <p class="font-bold capitalize">${getCategoryName(t.category)}</p>
                        <p class="text-[10px] text-white/40">${t.date}</p>
                    </div>
                </div>
                <div class="${t.amount < 0 ? 'text-white' : 'text-blue-400'} font-bold">
                    ${t.amount < 0 ? '-' : '+'}${formatCurrency(Math.abs(t.amount))}
                </div>
            </div>
        `).join('');
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
    // Generate simple data points from transactions
    const last7Days = Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (6 - i));
        return d.toISOString().split('T')[0];
    });

    let runningBalance = 0;
    const chartData = last7Days.map(date => {
        const dayTotal = state.transactions
            .filter(t => t.date <= date)
            .reduce((acc, t) => acc + t.amount, 0);
        return dayTotal;
    });

    mainChart.data.labels = last7Days;
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
