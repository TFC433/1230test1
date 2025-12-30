// public/scripts/companies/company-list.js
// 職責：管理「公司總覽列表頁」
// (V-Ultimate: 使用 .onclick 覆蓋機制，徹底根除重複綁定問題)

// ==================== 全域變數 ====================
let allCompaniesData = [];
let companyListFilters = { type: 'all', stage: 'all', rating: 'all' };
let currentSort = { field: 'lastActivity', direction: 'desc' };

// ==================== 核心功能：刪除邏輯 ====================
async function executeDeleteCompany(encodedName) {
    if (!encodedName) return;
    const name = decodeURIComponent(encodedName);
    
    // 檢查確認視窗函式是否存在
    if (typeof showConfirmDialog !== 'function') {
        if (confirm(`(系統提示) 確定要刪除「${name}」嗎？`)) {
             await performDeleteAPI(encodedName);
        }
        return;
    }

    showConfirmDialog(`確定要永久刪除公司「${name}」及其所有關聯資料嗎？`, async () => {
        await performDeleteAPI(encodedName);
    });
}

async function performDeleteAPI(encodedName) {
    showLoading('正在刪除...');
    try {
        const res = await authedFetch(`/api/companies/${encodedName}`, { method: 'DELETE' });
        if (res.success) {
            showNotification('刪除成功', 'success');
            await loadCompaniesListPage();
        } else {
            throw new Error(res.error || '刪除失敗');
        }
    } catch (e) {
        console.error('[Delete Error]', e);
        if (e.message !== 'Unauthorized') showNotification(e.message, 'error');
    } finally {
        hideLoading();
    }
}

// ==================== 主頁面載入 ====================

async function loadCompaniesListPage() {
    const container = document.getElementById('page-companies');
    if (!container) return;

    // 【終極修正】
    // 使用 .onclick 屬性直接指定函式。
    // 如果檔案重新執行，這裡會直接「覆蓋」掉上一次的函式，絕對不會殘留舊的。
    container.onclick = handleCompanyListClick;
    container.onkeydown = handleCompanyListKeydown;

    // 渲染 UI
    container.innerHTML = `
        <div id="company-list-root">
            <div id="companies-dashboard-container" class="dashboard-grid-flexible" style="margin-bottom: 24px;">
                <div class="loading show" style="grid-column: span 12;"><div class="spinner"></div><p>載入分析圖表中...</p></div>
            </div>
            <div class="dashboard-widget">
                <div class="widget-header">
                    <div style="display: flex; align-items: baseline; gap: 15px;">
                        <h2 class="widget-title">公司總覽</h2>
                        <span style="font-size: 0.9rem; color: var(--text-muted);">共 <span id="companies-count-display">0</span> 筆</span>
                    </div>
                </div>
                
                <div class="search-pagination" style="padding: 0 1.5rem 1rem; display: flex; flex-wrap: wrap; gap: 1rem; align-items: center; position: relative;">
                    <input type="text" class="search-box" id="company-list-search" placeholder="搜尋公司名稱..." style="flex-grow: 1;">
                    
                    <button class="action-btn small primary" data-action="toggle-quick-create" data-show="true" id="btn-toggle-create" style="flex-shrink: 0; display: flex; align-items: center; gap: 4px;">
                        <span style="font-size: 1.2em; line-height: 1;">+</span> 快速新增
                    </button>

                    <div id="company-list-filters" style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                        <select id="company-type-filter" class="form-select-sm" data-filter="type"><option value="all">所有類型</option></select>
                        <select id="company-stage-filter" class="form-select-sm" data-filter="stage"><option value="all">所有階段</option></select>
                        <select id="company-rating-filter" class="form-select-sm" data-filter="rating"><option value="all">所有評級</option></select>
                    </div>
                </div>

                <div id="company-quick-create-card" style="display: none; margin: 0 1.5rem 1.5rem; padding: 1.25rem; background-color: var(--secondary-bg); border: 2px solid var(--accent-blue); border-radius: var(--rounded-lg); box-shadow: 0 4px 12px rgba(0,0,0,0.1); animation: slideDown 0.3s ease-out;">
                    <div style="display: flex; align-items: center; gap: 1rem; flex-wrap: wrap;">
                        <div style="font-weight: 700; color: var(--accent-blue); display: flex; align-items: center; gap: 0.5rem; white-space: nowrap;">
                            <span style="font-size: 1.2rem;">🏢</span> 新增公司
                        </div>
                        <input type="text" id="quick-create-name-input" class="form-input" placeholder="請輸入完整公司名稱" style="flex-grow: 1; min-width: 250px; background: var(--primary-bg);">
                        <div style="display: flex; gap: 0.5rem;">
                            <button class="action-btn secondary small" data-action="toggle-quick-create" data-show="false">取消</button>
                            <button class="action-btn primary small" data-action="submit-quick-create">🚀 建立並前往</button>
                        </div>
                    </div>
                </div>

                <div id="companies-list-content" class="widget-content" style="padding: 0;">
                    <div class="loading show"><div class="spinner"></div><p>載入公司列表中...</p></div>
                </div>
            </div>
        </div>
    `;

    try {
        const [dashboardResult, listResult, oppsResult, systemConfigResult] = await Promise.all([
            authedFetch(`/api/companies/dashboard`),
            authedFetch(`/api/companies`), 
            authedFetch(`/api/opportunities?page=0`), 
            authedFetch(`/api/config`) 
        ]);

        if (systemConfigResult) {
            window.CRM_APP.systemConfig = systemConfigResult;
            populateFilterOptions('company-type-filter', systemConfigResult['公司類型'], '所有類型');
            populateFilterOptions('company-stage-filter', systemConfigResult['客戶階段'], '所有階段');
            populateFilterOptions('company-rating-filter', systemConfigResult['互動評級'], '所有評級');
            // 下拉選單維持 addEventListener，因為它們每次都是新生成的元素，不會有重複問題
            document.querySelectorAll('#company-list-filters select').forEach(select => {
                select.addEventListener('change', handleCompanyFilterChange);
            });
        }

        if (dashboardResult.success && dashboardResult.data.chartData) {
            renderCompaniesDashboardCharts(dashboardResult.data.chartData);
        }

        if (listResult.success) {
            const companies = listResult.data || [];
            const allOpps = oppsResult || [];
            const oppCountMap = new Map();
            allOpps.forEach(opp => {
                const companyName = opp.customerCompany;
                if (companyName) oppCountMap.set(companyName, (oppCountMap.get(companyName) || 0) + 1);
            });

            allCompaniesData = companies.map(c => ({ ...c, opportunityCount: oppCountMap.get(c.companyName) || 0 }));
            filterAndRenderCompanyList();

            const searchInput = document.getElementById('company-list-search');
            if (searchInput) searchInput.addEventListener('keyup', handleCompanyListSearch);
        } else {
             throw new Error(listResult.error || '無法獲取公司列表');
        }

    } catch (error) {
        if (error.message !== 'Unauthorized') {
            const contentDiv = document.getElementById('companies-list-content');
            if (contentDiv) contentDiv.innerHTML = `<div class="alert alert-error">載入公司列表失敗: ${error.message}</div>`;
        }
    }
}

// ==================== 事件處理中心 (Event Handler) ====================

function handleCompanyListClick(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;

    const action = btn.dataset.action;
    const payload = btn.dataset;

    // 防止事件冒泡造成的副作用 (保險起見)
    e.stopPropagation();

    switch (action) {
        case 'sort':
            handleCompanySort(payload.field);
            break;
        case 'toggle-quick-create':
            toggleQuickCreateCard(payload.show === 'true');
            break;
        case 'submit-quick-create':
            submitQuickCreateCompany();
            break;
        
        case 'delete-company':
            executeDeleteCompany(payload.name).catch(err => {
                console.error('刪除流程錯誤:', err);
                showNotification('刪除操作發生錯誤', 'error');
            });
            break;

        case 'navigate':
            e.preventDefault();
            const page = payload.page;
            let params = {};
            if (payload.params) {
                try { params = JSON.parse(payload.params); } 
                catch (err) { console.error('Params parse error', err); }
            }
            CRM_APP.navigateTo(page, params);
            break;
    }
}

function handleCompanyListKeydown(e) {
    if (e.target.id === 'quick-create-name-input' && e.key === 'Enter') {
        submitQuickCreateCompany();
    }
}

// ==================== 渲染與輔助函式 ====================

function filterAndRenderCompanyList() {
    const query = document.getElementById('company-list-search')?.value.toLowerCase() || '';
    const { type, stage, rating } = companyListFilters;
    const countDisplay = document.getElementById('companies-count-display');

    let filtered = allCompaniesData.filter(c => {
        const nameMatch = query ? (c.companyName || '').toLowerCase().includes(query) : true;
        const typeMatch = type === 'all' ? true : c.companyType === type;
        const stageMatch = stage === 'all' ? true : c.customerStage === stage;
        const ratingMatch = rating === 'all' ? true : c.engagementRating === rating;
        return nameMatch && typeMatch && stageMatch && ratingMatch;
    });

    filtered.sort((a, b) => {
        let valA = a[currentSort.field];
        let valB = b[currentSort.field];
        if (valA === undefined || valA === null) valA = '';
        if (valB === undefined || valB === null) valB = '';
        if (typeof valA === 'number' && typeof valB === 'number') {
            return currentSort.direction === 'asc' ? valA - valB : valB - valA;
        }
        return currentSort.direction === 'asc' 
            ? String(valA).localeCompare(String(valB), 'zh-Hant') 
            : String(valB).localeCompare(String(valA), 'zh-Hant');
    });

    if (countDisplay) countDisplay.textContent = filtered.length;
    const listContent = document.getElementById('companies-list-content');
    if (listContent) listContent.innerHTML = renderCompaniesTable(filtered);
}

function renderCompaniesTable(companies) {
    const styleId = 'company-list-upgraded-styles';
    if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.innerHTML = `
            .comp-list-container { width: 100%; overflow-x: auto; background: #fff; }
            .comp-list-table { width: 100%; border-collapse: collapse; min-width: 900px; }
            .comp-list-table th { padding: 12px 16px; text-align: left; background: var(--glass-bg); color: var(--text-secondary); font-weight: 600; font-size: 0.9rem; border-bottom: 1px solid var(--border-color); white-space: nowrap; }
            .comp-list-table td { padding: 12px 16px; border-bottom: 1px solid var(--border-color); vertical-align: middle; font-size: 0.95rem; color: var(--text-main); }
            .comp-list-table tr:hover { background-color: rgba(0,0,0,0.02); }
            .comp-type-chip { display: inline-block; padding: 3px 10px; border-radius: 4px; font-size: 0.8rem; color: white; white-space: nowrap; font-weight: 500; }
            .comp-status-badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 0.8rem; font-weight: 600; color: white; white-space: nowrap; }
            .comp-opp-count { display: inline-block; padding: 2px 8px; border-radius: 6px; background: #f3f4f6; color: #1f2937; font-weight: 700; font-size: 0.85rem; }
            .comp-list-table th.sortable { cursor: pointer; }
            .comp-list-table th.sortable:hover { color: var(--accent-blue); }
            .col-idx { width: 60px; text-align: center !important; color: var(--text-muted); }
            .col-actions { width: 80px; text-align: center !important; }
            .btn-mini-delete { background: none; border: none; color: #9ca3af; cursor: pointer; padding: 6px; border-radius: 4px; transition: all 0.2s; }
            .btn-mini-delete:hover { color: #ef4444; background: #fee2e2; }
        `;
        document.head.appendChild(style);
    }

    if (!companies.length) return '<div class="alert alert-info" style="margin:2rem; text-align:center;">找不到符合條件的公司資料</div>';

    const systemConfig = window.CRM_APP?.systemConfig || {};
    const typeColors = new Map((systemConfig['公司類型'] || []).map(t => [t.value, t.color]));
    const stageColors = new Map((systemConfig['客戶階段'] || []).map(t => [t.value, t.color]));
    const ratingColors = new Map((systemConfig['互動評級'] || []).map(t => [t.value, t.color]));

    const renderSortHeader = (field, label) => {
        let icon = '↕';
        if (currentSort.field === field) icon = currentSort.direction === 'asc' ? '↑' : '↓';
        return `<th class="sortable" data-action="sort" data-field="${field}">${label} <span>${icon}</span></th>`;
    };

    let html = `<div class="comp-list-container"><table class="comp-list-table"><thead><tr>
                    <th class="col-idx">項次</th>
                    ${renderSortHeader('lastActivity', '最後活動')}
                    <th>公司類型</th>
                    ${renderSortHeader('companyName', '公司名稱')}
                    ${renderSortHeader('opportunityCount', '機會數')}
                    <th>客戶階段</th>
                    <th>互動評級</th>
                    <th class="col-actions">操作</th>
                </tr></thead><tbody>`;

    companies.forEach((c, i) => {
        const typeColor = typeColors.get(c.companyType) || '#9ca3af';
        const stageColor = stageColors.get(c.customerStage) || '#6b7280';
        const ratingColor = ratingColors.get(c.engagementRating) || '#6b7280';
        const encodedName = encodeURIComponent(c.companyName || '');
        const navParams = JSON.stringify({ companyName: c.companyName || '' }).replace(/'/g, "&apos;").replace(/"/g, '&quot;');

        html += `
            <tr>
                <td class="col-idx">${i + 1}</td>
                <td style="white-space:nowrap;">${formatDateTime(c.lastActivity)}</td>
                <td><span class="comp-type-chip" style="background:${typeColor}">${c.companyType || '未分類'}</span></td>
                <td>
                    <a href="#" class="text-link" 
                       data-action="navigate" 
                       data-page="company-details" 
                       data-params="${navParams}">
                        <strong>${c.companyName || '-'}</strong>
                    </a>
                </td>
                <td style="text-align:center;"><span class="comp-opp-count">${c.opportunityCount}</span></td>
                <td><span class="comp-status-badge" style="background:${stageColor}">${c.customerStage || '-'}</span></td>
                <td><span class="comp-status-badge" style="background:${ratingColor}">${c.engagementRating || '-'}</span></td>
                <td class="col-actions">
                    <button class="btn-mini-delete" title="刪除公司" 
                            data-action="delete-company" 
                            data-name="${encodedName}">
                        <svg style="width:18px;height:18px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    </button>
                </td>
            </tr>`;
    });

    return html + '</tbody></table></div>';
}

function toggleQuickCreateCard(show) {
    const card = document.getElementById('company-quick-create-card');
    const input = document.getElementById('quick-create-name-input');
    const btn = document.getElementById('btn-toggle-create');
    if (!card) return;
    if (show) {
        card.style.display = 'block';
        if(btn) btn.style.display = 'none';
        if (input) { input.value = ''; setTimeout(() => input.focus(), 100); }
    } else {
        card.style.display = 'none';
        if(btn) btn.style.display = 'flex';
    }
}

async function submitQuickCreateCompany() {
    const input = document.getElementById('quick-create-name-input');
    const name = input?.value.trim();
    if (!name) { showNotification('請輸入公司名稱', 'warning'); input.focus(); return; }
    showLoading('正在建立...');
    try {
        const res = await authedFetch('/api/companies', { method: 'POST', body: JSON.stringify({ companyName: name }) });
        hideLoading();
        if (res.success) {
            showNotification('建立成功！', 'success');
            toggleQuickCreateCard(false);
            CRM_APP.navigateTo('company-details', { companyName: encodeURIComponent(res.data.companyName || res.data.name) });
        } else if (res.reason === 'EXISTS') {
            showConfirmDialog(`公司「${name}」已存在，是否直接前往查看？`, () => {
                CRM_APP.navigateTo('company-details', { companyName: encodeURIComponent(res.data.companyName || res.data.name) });
            });
        } else { showNotification(res.error || '建立失敗', 'error'); }
    } catch (e) { hideLoading(); if (e.message !== 'Unauthorized') showNotification('建立失敗: ' + e.message, 'error'); }
}

function populateFilterOptions(selectId, options, defaultText) {
    const el = document.getElementById(selectId);
    if (!el) return;
    el.innerHTML = `<option value="all">${defaultText}</option>` + (options || []).map(opt => `<option value="${opt.value}">${opt.note || opt.value}</option>`).join('');
}

function handleCompanyFilterChange(e) { companyListFilters[e.target.dataset.filter] = e.target.value; filterAndRenderCompanyList(); }
function handleCompanyListSearch() { handleSearch(() => filterAndRenderCompanyList()); }
function handleCompanySort(f) { if (currentSort.field === f) { currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc'; } else { currentSort.field = f; currentSort.direction = 'desc'; } filterAndRenderCompanyList(); }

// --- 圖表渲染 ---
function renderCompaniesDashboardCharts(chartData) {
    const container = document.getElementById('companies-dashboard-container');
    if (!container) return;
    container.innerHTML = `<div class="dashboard-widget grid-col-3"><div class="widget-header"><h2 class="widget-title">公司新增趨勢</h2></div><div id="company-trend-chart" class="widget-content" style="height: 250px;"></div></div><div class="dashboard-widget grid-col-3"><div class="widget-header"><h2 class="widget-title">公司類型分佈</h2></div><div id="company-type-chart" class="widget-content" style="height: 250px;"></div></div><div class="dashboard-widget grid-col-3"><div class="widget-header"><h2 class="widget-title">客戶階段分佈</h2></div><div id="customer-stage-chart" class="widget-content" style="height: 250px;"></div></div><div class="dashboard-widget grid-col-3"><div class="widget-header"><h2 class="widget-title">互動評級</h2></div><div id="engagement-rating-chart" class="widget-content" style="height: 250px;"></div></div>`;
    const cfg = window.CRM_APP?.systemConfig;
    const typeMap = new Map((cfg?.['公司類型'] || []).map(i => [i.value, i.note]));
    const stageMap = new Map((cfg?.['客戶階段'] || []).map(i => [i.value, i.note]));
    const ratingMap = new Map((cfg?.['互動評級'] || []).map(i => [i.value, i.note]));
    setTimeout(() => {
        if (typeof Highcharts !== 'undefined' && chartData) {
            renderCompanyTrendChart(chartData.trend);
            createThemedChart('company-type-chart', getCompanyPieChartOptions('類型', chartData.type, 'companyType', typeMap));
            createThemedChart('customer-stage-chart', getCompanyPieChartOptions('階段', chartData.stage, 'customerStage', stageMap));
            createThemedChart('engagement-rating-chart', getCompanyBarChartOptions('評級', chartData.rating, 'engagementRating', ratingMap));
        }
    }, 0);
}

function renderCompanyTrendChart(data) { createThemedChart('company-trend-chart', { chart: { type: 'line' }, title: { text: '' }, xAxis: { categories: (data || []).map(d => d[0]?.substring(5) || '') }, yAxis: { title: { text: '數量' }, allowDecimals: false }, legend: { enabled: false }, series: [{ name: '新增公司數', data: (data || []).map(d => d[1] || 0) }] }); }
function getCompanyPieChartOptions(n, d, k, m) { return { chart: { type: 'pie' }, title: { text: '' }, tooltip: { pointFormat: '{series.name}: <b>{point.percentage:.1f}%</b> ({point.y} 家)' }, plotOptions: { pie: { allowPointSelect: true, cursor: 'pointer', dataLabels: { enabled: true, format: '<b>{point.name}</b>: {point.percentage:.1f} %', distance: 20 }, point: { events: { click: function() { handleCompanyChartClick(this, k); } } } } }, series: [{ name: '家數', data: (d || []).map(item => ({ name: m.get(item.name) || item.name || '未分類', y: item.y || 0, internalValue: item.name })) }] }; }
function getCompanyBarChartOptions(n, d, k, m) { const chartD = (d || []).map(item => ({ name: m.get(item.name) || item.name || '未分類', y: item.y || 0, internalValue: item.name })); return { chart: { type: 'bar' }, title: { text: '' }, xAxis: { categories: chartD.map(item => item.name), title: { text: null } }, yAxis: { min: 0, title: { text: '公司數量', align: 'high' }, allowDecimals: false }, legend: { enabled: false }, series: [{ name: '數量', data: chartD }], plotOptions: { bar: { cursor: 'pointer', point: { events: { click: function() { handleCompanyChartClick(this, k, true); } } } } } }; }
function handleCompanyChartClick(p, k, b=false) { const val = b ? p.options.internalValue : p.internalValue; const sel = document.getElementById(`company-${k.replace('company', '').toLowerCase()}-filter`); if (!sel) return; if (p.selected) { companyListFilters[k] = 'all'; sel.value = 'all'; p.select(false, true); } else { companyListFilters[k] = val; sel.value = val; p.select(true, true); } filterAndRenderCompanyList(); }

if (window.CRM_APP) {
    if (!window.CRM_APP.pageModules) window.CRM_APP.pageModules = {};
    window.CRM_APP.pageModules.companies = loadCompaniesListPage;
}