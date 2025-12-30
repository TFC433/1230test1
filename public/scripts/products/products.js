// public/scripts/products/products.js
// 職責：管理「市場商品資料」的列表顯示與機敏資料互動

window.ProductManager = {
    allProducts: [],
    revealedIds: new Set(), // 記錄目前被點開(解鎖)的商品ID
    
    async init() {
        const container = document.getElementById('page-products');
        if (!container) return;

        // 1. 載入 HTML 模板
        try {
            const html = await fetch('/views/product-list.html').then(res => res.text());
            container.innerHTML = html;
        } catch (err) {
            console.error('[Products] 載入模板失敗:', err);
            container.innerHTML = '<div class="alert alert-error">載入介面失敗</div>';
            return;
        }

        // 2. 綁定事件
        this.bindEvents();

        // 3. 載入資料
        await this.loadData();
    },

    bindEvents() {
        const searchInput = document.getElementById('product-search-input');
        const refreshBtn = document.getElementById('btn-refresh-products');

        if (searchInput) {
            // 防抖動搜尋
            let debounceTimer;
            searchInput.addEventListener('input', (e) => {
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => {
                    this.renderTable(e.target.value);
                }, 300);
            });
        }

        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.forceRefresh());
        }
    },

    async loadData() {
        const listContainer = document.getElementById('product-list-container');
        if (!listContainer) return;

        listContainer.innerHTML = `
            <div class="loading show">
                <div class="spinner"></div>
                <p>正在建立安全連線讀取成本資料...</p>
            </div>
        `;

        try {
            const res = await authedFetch('/api/products');
            
            if (!res.success) {
                // 處理權限不足 (403)
                if (res.error && res.error.includes('權限')) {
                    listContainer.innerHTML = `
                        <div class="alert alert-error" style="text-align: center; padding: 2rem;">
                            <div style="font-size: 3rem; margin-bottom: 1rem;">🚫</div>
                            <h3>存取被拒絕</h3>
                            <p>${res.error}</p>
                            <p style="font-size: 0.9rem; color: #666; margin-top: 0.5rem;">您的帳號不具備查閱成本結構的權限。</p>
                        </div>
                    `;
                    return;
                }
                throw new Error(res.error || '載入失敗');
            }

            this.allProducts = res.data || [];
            this.renderTable();

        } catch (error) {
            console.error('[Products] 載入失敗:', error);
            listContainer.innerHTML = `<div class="alert alert-error">讀取資料錯誤: ${error.message}</div>`;
        }
    },

    async forceRefresh() {
        if (!confirm('確定要從 Google Sheet 重新同步最新資料嗎？\n(這可能需要幾秒鐘的時間)')) return;
        
        const btn = document.getElementById('btn-refresh-products');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<div class="spinner small"></div> 同步中...';
        }

        try {
            await authedFetch('/api/products/refresh', { method: 'POST' });
            showNotification('同步成功！資料已更新', 'success');
            await this.loadData();
        } catch (error) {
            showNotification('同步失敗: ' + error.message, 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = `
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M23 4v6h-6"></path><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                    </svg> 同步資料
                `;
            }
        }
    },

    renderTable(query = '') {
        const container = document.getElementById('product-list-container');
        if (!container) return;

        let data = this.allProducts;

        // 前端搜尋過濾 (如果資料量不大，前端做體驗較好)
        if (query) {
            const q = query.toLowerCase();
            data = data.filter(p => 
                (p.name && p.name.toLowerCase().includes(q)) ||
                (p.id && p.id.toLowerCase().includes(q)) ||
                (p.spec && p.spec.toLowerCase().includes(q)) ||
                (p.supplier && p.supplier.toLowerCase().includes(q))
            );
        }

        if (data.length === 0) {
            container.innerHTML = '<div class="alert alert-info">沒有找到符合的商品資料</div>';
            return;
        }

        // 建構表格 HTML
        let html = `
            <div class="table-responsive">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th width="10%">商品ID</th>
                            <th width="20%">品名</th>
                            <th width="15%">規格</th>
                            <th width="10%">供應商</th>
                            <th width="10%">成本 (未稅)</th>
                            <th width="10%">MTU售價</th>
                            <th width="10%">狀態</th>
                            <th width="15%">最後更新</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        data.forEach(item => {
            // 處理狀態標籤
            const statusClass = item.status === '上架' ? 'active' : 'inactive';
            const statusBadge = `<span class="status-badge ${statusClass}">${item.status}</span>`;

            // 處理日期
            const dateStr = item.lastUpdateTime ? item.lastUpdateTime.split('T')[0] : '-';

            // ★★★ 機敏欄位處理 ★★★
            const costHtml = this.renderSensitiveCell(item.id, 'cost', item.cost);
            const priceHtml = this.renderSensitiveCell(item.id, 'price', item.priceMtu);

            html += `
                <tr>
                    <td class="font-mono text-muted">${item.id}</td>
                    <td>
                        <div style="font-weight: 600; color: var(--text-primary);">${item.name}</div>
                        <div style="font-size: 0.85rem; color: var(--text-muted);">${item.category || ''}</div>
                    </td>
                    <td style="font-size: 0.9rem;">${item.spec || '-'}</td>
                    <td>${item.supplier || '-'}</td>
                    <td>${costHtml}</td>
                    <td>${priceHtml}</td>
                    <td>${statusBadge}</td>
                    <td style="font-size: 0.85rem; color: var(--text-muted);">
                        ${dateStr}<br>
                        <span style="font-size: 0.75rem;">by ${item.lastModifier || 'System'}</span>
                    </td>
                </tr>
            `;
        });

        html += `</tbody></table></div>`;
        
        // 加上筆數統計
        html += `<div style="margin-top: 1rem; text-align: right; color: var(--text-muted); font-size: 0.9rem;">共 ${data.length} 筆資料 (機密)</div>`;

        container.innerHTML = html;
    },

    /**
     * 渲染機敏資料單元格 (支援點擊解鎖)
     */
    renderSensitiveCell(itemId, fieldType, value) {
        if (!value) return '<span class="text-muted">-</span>';

        // 產生唯一的 key，例如 "P001_cost"
        const key = `${itemId}_${fieldType}`;
        const isRevealed = this.revealedIds.has(key);

        if (isRevealed) {
            // 已解鎖：顯示數值 (加上紅色強調)
            // 這裡簡單加上千分位，假設 value 是純數字字串
            const displayVal = isNaN(value) ? value : Number(value).toLocaleString();
            return `<span class="sensitive-value revealed" onclick="ProductManager.toggleSensitive('${key}')">${displayVal}</span>`;
        } else {
            // 未解鎖：顯示遮罩
            return `<span class="sensitive-value masked" onclick="ProductManager.toggleSensitive('${key}')">NT$ ****</span>`;
        }
    },

    /**
     * 切換遮罩狀態
     */
    toggleSensitive(key) {
        if (this.revealedIds.has(key)) {
            this.revealedIds.delete(key);
        } else {
            this.revealedIds.add(key);
        }
        // 重新渲染表格 (雖然全表重繪有點重，但實作最簡單且不易出錯)
        // 若有效能問題，可改為只更新該 DOM
        const searchInput = document.getElementById('product-search-input');
        this.renderTable(searchInput ? searchInput.value : '');
    }
};

// 註冊模組
if (window.CRM_APP) {
    window.CRM_APP.pageModules['products'] = () => ProductManager.init();
}