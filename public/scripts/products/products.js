// public/scripts/products/products.js
// 職責：管理「市場商品資料」的列表顯示、機敏資料互動與批次編輯

window.ProductManager = {
    allProducts: [],
    revealedIds: new Set(),
    isEditMode: false, // ★ 編輯模式狀態
    
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

        // 2. 注入工具列按鈕 (如果模板沒寫，我們動態加)
        this.injectToolbarControls();

        // 3. 綁定事件
        this.bindEvents();

        // 4. 載入資料
        await this.loadData();
    },

    // ★ 動態注入編輯控制項
    injectToolbarControls() {
        const headerAction = document.querySelector('#page-products .header-actions');
        if (headerAction) {
            // 清空舊按鈕 (避免重複 init)
            headerAction.innerHTML = '';

            // 建立按鈕群組
            const btnGroup = document.createElement('div');
            btnGroup.className = 'btn-group';
            btnGroup.style.display = 'flex';
            btnGroup.style.gap = '10px';

            btnGroup.innerHTML = `
                <button id="btn-add-row" class="action-btn secondary" style="display: none;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                    新增商品
                </button>
                <button id="btn-toggle-edit" class="action-btn secondary">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                    編輯模式
                </button>
                <button id="btn-save-batch" class="action-btn primary" style="display: none; background-color: #28a745;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
                    儲存變更
                </button>
                <button id="btn-refresh-products" class="action-btn secondary">
                     <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6"></path><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
                     同步資料
                </button>
            `;
            headerAction.appendChild(btnGroup);
        }
    },

    bindEvents() {
        // 搜尋
        const searchInput = document.getElementById('product-search-input');
        let debounceTimer;
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => this.renderTable(e.target.value), 300);
            });
        }

        // 按鈕事件委派
        document.addEventListener('click', (e) => {
            const target = e.target.closest('button');
            if (!target) return;

            if (target.id === 'btn-refresh-products') this.forceRefresh();
            if (target.id === 'btn-toggle-edit') this.toggleEditMode();
            if (target.id === 'btn-save-batch') this.saveAll();
            if (target.id === 'btn-add-row') this.addNewRow();
        });
    },

    async loadData() {
        const listContainer = document.getElementById('product-list-container');
        if (!listContainer) return;
        
        // 只有第一次載入顯示 Loading，避免編輯模式切換時閃爍
        if (this.allProducts.length === 0) {
            listContainer.innerHTML = `<div class="loading show"><div class="spinner"></div><p>載入商品成本資料...</p></div>`;
        }

        try {
            const res = await authedFetch('/api/products');
            if (!res.success) throw new Error(res.error || '權限不足');
            this.allProducts = res.data || [];
            this.renderTable();
        } catch (error) {
            console.error('[Products] 載入失敗:', error);
            listContainer.innerHTML = `<div class="alert alert-error">${error.message}</div>`;
        }
    },

    // ★ 切換編輯模式
    toggleEditMode() {
        this.isEditMode = !this.isEditMode;
        
        const btnEdit = document.getElementById('btn-toggle-edit');
        const btnSave = document.getElementById('btn-save-batch');
        const btnAdd = document.getElementById('btn-add-row');
        const searchInput = document.getElementById('product-search-input');

        if (this.isEditMode) {
            // 進入編輯模式
            btnEdit.innerHTML = `❌ 取消編輯`;
            btnEdit.classList.add('danger');
            btnSave.style.display = 'inline-flex';
            btnAdd.style.display = 'inline-flex';
            if (searchInput) searchInput.disabled = true; // 編輯時鎖定搜尋以免資料錯亂
        } else {
            // 離開編輯模式 (不儲存)
            // 重新載入資料以還原修改
            this.loadData(); 
            
            btnEdit.innerHTML = `✏️ 編輯模式`;
            btnEdit.classList.remove('danger');
            btnSave.style.display = 'none';
            btnAdd.style.display = 'none';
            if (searchInput) searchInput.disabled = false;
        }

        // 重新渲染表格以切換顯示/輸入框
        this.renderTable(searchInput ? searchInput.value : '');
    },

    // ★ 新增一列空白資料
    addNewRow() {
        const newRow = {
            id: '', // 空 ID，讓使用者輸入
            name: '',
            spec: '',
            supplier: '',
            cost: '',
            priceMtu: '',
            status: '上架',
            _isNew: true // 標記為新列
        };
        // 插入到最前面
        this.allProducts.unshift(newRow);
        this.renderTable();
    },

    renderTable(query = '') {
        const container = document.getElementById('product-list-container');
        if (!container) return;

        let data = this.allProducts;
        if (query && !this.isEditMode) {
            const q = query.toLowerCase();
            data = data.filter(p => 
                (p.name && p.name.toLowerCase().includes(q)) ||
                (p.id && p.id.toLowerCase().includes(q))
            );
        }

        let html = `
            <div class="table-responsive">
                <table class="data-table product-edit-table">
                    <thead>
                        <tr>
                            <th width="12%">ID ${this.isEditMode ? '<span style="color:red">*</span>' : ''}</th>
                            <th width="20%">品名</th>
                            <th width="15%">規格</th>
                            <th width="12%">供應商</th>
                            <th width="10%">成本</th>
                            <th width="10%">售價 (MTU)</th>
                            <th width="10%">狀態</th>
                            ${!this.isEditMode ? '<th width="11%">更新</th>' : ''}
                        </tr>
                    </thead>
                    <tbody>
        `;

        data.forEach((item, index) => {
            if (this.isEditMode) {
                // === 編輯模式 (Input) ===
                const isNew = item._isNew;
                const idAttr = isNew ? '' : 'disabled title="既有商品 ID 不可修改" style="background:#eee; cursor:not-allowed;"';
                
                html += `
                    <tr class="edit-row" data-index="${index}">
                        <td><input type="text" name="id" class="form-control dense" value="${item.id}" placeholder="請輸入ID" ${idAttr}></td>
                        <td><input type="text" name="name" class="form-control dense" value="${item.name}"></td>
                        <td><input type="text" name="spec" class="form-control dense" value="${item.spec || ''}"></td>
                        <td><input type="text" name="supplier" class="form-control dense" value="${item.supplier || ''}"></td>
                        
                        <td><input type="number" name="cost" class="form-control dense" value="${item.cost || ''}" placeholder="成本"></td>
                        <td><input type="number" name="priceMtu" class="form-control dense" value="${item.priceMtu || ''}" placeholder="售價"></td>
                        
                        <td>
                            <select name="status" class="form-control dense">
                                <option value="上架" ${item.status === '上架' ? 'selected' : ''}>上架</option>
                                <option value="停售" ${item.status === '停售' ? 'selected' : ''}>停售</option>
                            </select>
                        </td>
                    </tr>
                `;
            } else {
                // === 檢視模式 (Text) ===
                const costHtml = this.renderSensitiveCell(item.id, 'cost', item.cost);
                const priceHtml = this.renderSensitiveCell(item.id, 'price', item.priceMtu);
                const statusClass = item.status === '上架' ? 'active' : 'inactive';

                html += `
                    <tr>
                        <td class="font-mono text-muted">${item.id}</td>
                        <td style="font-weight:600">${item.name}</td>
                        <td>${item.spec || '-'}</td>
                        <td>${item.supplier || '-'}</td>
                        <td>${costHtml}</td>
                        <td>${priceHtml}</td>
                        <td><span class="status-badge ${statusClass}">${item.status}</span></td>
                        <td style="font-size:0.8rem; color:#999;">${item.lastUpdateTime ? item.lastUpdateTime.split('T')[0] : '-'}</td>
                    </tr>
                `;
            }
        });

        html += `</tbody></table></div>`;
        container.innerHTML = html;
    },

    // ★ 批次儲存邏輯
    async saveAll() {
        // 1. 收集資料
        const rows = document.querySelectorAll('.product-edit-table tbody tr');
        const payload = [];
        let hasError = false;

        rows.forEach(row => {
            const inputs = row.querySelectorAll('input, select');
            const obj = {};
            inputs.forEach(input => {
                obj[input.name] = input.value.trim();
            });

            // 基本驗證
            if (!obj.id) {
                row.style.backgroundColor = '#ffebee'; // 標示錯誤列
                hasError = true;
            } else {
                row.style.backgroundColor = '';
                // 這裡可以補上原有的欄位 (如 category, unit) 如果沒開放編輯，需從 allProducts merge 回來
                // 簡單起見，我們假設這裡就是全量更新，或者後端會 Handle
                // 為了避免資料遺失，我們應該把原始物件的其他欄位也帶上
                const originalIndex = row.dataset.index;
                const originalObj = this.allProducts[originalIndex] || {};
                
                // 合併物件：原始資料 + 修改後的資料
                payload.push({ ...originalObj, ...obj });
            }
        });

        if (hasError) {
            showNotification('請填寫所有必填欄位 (ID)', 'error');
            return;
        }

        if (payload.length === 0) {
            showNotification('沒有資料可儲存', 'info');
            return;
        }

        if (!confirm(`確定要儲存 ${payload.length} 筆資料嗎？\n既有資料將被更新，新 ID 將被新增。`)) return;

        // 2. 發送請求
        const btnSave = document.getElementById('btn-save-batch');
        btnSave.disabled = true;
        btnSave.innerHTML = '<div class="spinner small"></div> 儲存中...';

        try {
            const res = await authedFetch('/api/products/batch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ products: payload })
            });

            if (res.success) {
                showNotification('儲存成功！', 'success');
                this.isEditMode = false; // 退出編輯模式
                this.loadData(); // 重新讀取 (會重繪按鈕狀態)
            } else {
                throw new Error(res.error || '儲存失敗');
            }
        } catch (error) {
            console.error(error);
            showNotification(error.message, 'error');
            btnSave.disabled = false;
            btnSave.innerHTML = '儲存變更';
        }
    },

    renderSensitiveCell(itemId, fieldType, value) {
        if (!value) return '<span class="text-muted">-</span>';
        const key = `${itemId}_${fieldType}`;
        const isRevealed = this.revealedIds.has(key);
        const displayVal = isNaN(value) ? value : Number(value).toLocaleString();

        if (isRevealed) {
            return `<span class="sensitive-value revealed" onclick="ProductManager.toggleSensitive('${key}')">${displayVal}</span>`;
        } else {
            return `<span class="sensitive-value masked" onclick="ProductManager.toggleSensitive('${key}')">NT$ ****</span>`;
        }
    },

    toggleSensitive(key) {
        if (this.revealedIds.has(key)) this.revealedIds.delete(key);
        else this.revealedIds.add(key);
        // 只更新 DOM 避免重繪 input 導致焦點跑掉 (如果是 view mode 沒差)
        if (!this.isEditMode) this.renderTable();
    },
    
    forceRefresh: async function() { /* 同前一個版本 */ }
};

if (window.CRM_APP) {
    window.CRM_APP.pageModules['products'] = () => ProductManager.init();
}