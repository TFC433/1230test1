// public/scripts/products/products.js
// 職責：市場商品管理、Chip Wall (全系統排序)、批次編輯 (隱藏 ID / 自動生成 ID)

window.ProductManager = {
    allProducts: [],
    revealedIds: new Set(),
    isEditMode: false,
    categoryOrder: [], // 用於快取全系統的分類排序

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

        // 2. 先從後端讀取「全系統」排序設定
        await this.loadCategoryOrder();

        // 3. 注入工具列按鈕
        this.injectToolbarControls();

        // 4. 綁定事件
        this.bindEvents();

        // 5. 載入資料
        await this.loadData();
    },

    // ★ 從後端 API 讀取排序設定
    async loadCategoryOrder() {
        try {
            const res = await authedFetch('/api/products/category-order');
            if (res.success && Array.isArray(res.order)) {
                this.categoryOrder = res.order;
            }
        } catch (e) {
            console.warn('讀取全系統排序設定失敗', e);
        }
    },

    // ★ 儲存排序設定到後端 API
    async saveCategoryOrder(newOrder) {
        // UI 顯示儲存中
        const statusEl = document.getElementById('order-save-status');
        if(statusEl) statusEl.textContent = '⟳ 儲存排序中...';

        try {
            const res = await authedFetch('/api/products/category-order', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ order: newOrder })
            });

            if (res.success) {
                this.categoryOrder = newOrder;
                if(statusEl) statusEl.textContent = '✓ 排序已更新 (全系統生效)';
                // 成功後刷新頁面以應用新順序
                setTimeout(() => window.location.reload(), 500); 
            } else {
                throw new Error(res.error);
            }
        } catch (e) {
            console.error(e);
            if(statusEl) statusEl.textContent = '✕ 儲存失敗';
            showNotification('儲存排序失敗: ' + e.message, 'error');
        }
    },

    injectToolbarControls() {
        const actionContainer = document.querySelector('#page-products .widget-actions');
        
        if (actionContainer && !actionContainer.querySelector('.product-edit-tools')) {
            const btnGroup = document.createElement('div');
            btnGroup.className = 'btn-group product-edit-tools';
            
            // 強制單行排列樣式
            btnGroup.style.display = 'flex';
            btnGroup.style.alignItems = 'center';
            btnGroup.style.gap = '8px';          
            btnGroup.style.flexWrap = 'nowrap';  
            btnGroup.style.whiteSpace = 'nowrap';

            btnGroup.innerHTML = `
                <button id="btn-add-row" class="action-btn secondary" style="display: none; white-space: nowrap;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                    新增
                </button>
                <button id="btn-toggle-edit" class="action-btn secondary" style="white-space: nowrap;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                    編輯模式
                </button>
                <button id="btn-save-batch" class="action-btn primary" style="display: none; background-color: #28a745; white-space: nowrap;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
                    儲存
                </button>
            `;

            const refreshBtn = actionContainer.querySelector('#btn-refresh-products');
            if (refreshBtn) {
                btnGroup.appendChild(refreshBtn);
            }
            actionContainer.appendChild(btnGroup);
        }
    },

    bindEvents() {
        const searchInput = document.getElementById('product-search-input');
        let debounceTimer;
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => this.renderTable(e.target.value), 300);
            });
        }

        document.addEventListener('click', (e) => {
            const target = e.target.closest('button');
            if (!target) return;
            if (!document.getElementById('page-products').contains(target)) return;

            if (target.id === 'btn-refresh-products') this.forceRefresh();
            if (target.id === 'btn-toggle-edit') this.toggleEditMode();
            if (target.id === 'btn-save-batch') this.saveAll();
            if (target.id === 'btn-add-row') this.addNewRow();
        });
    },

    async loadData() {
        const container = document.getElementById('product-groups-container');
        if (!container) return;
        
        if (this.allProducts.length === 0) {
            container.innerHTML = `<div class="loading show"><div class="spinner"></div><p>載入商品成本資料...</p></div>`;
        }

        try {
            const res = await authedFetch('/api/products');
            if (!res.success) throw new Error(res.error || '權限不足');
            this.allProducts = res.data || [];
            this.renderTable();
        } catch (error) {
            console.error('[Products] 載入失敗:', error);
            container.innerHTML = `<div class="alert alert-error">${error.message}</div>`;
        }
    },

    toggleEditMode() {
        this.isEditMode = !this.isEditMode;
        
        const btnEdit = document.getElementById('btn-toggle-edit');
        const btnSave = document.getElementById('btn-save-batch');
        const btnAdd = document.getElementById('btn-add-row');
        const searchInput = document.getElementById('product-search-input');

        if (this.isEditMode) {
            // === 進入編輯模式 ===
            btnEdit.innerHTML = `❌ 取消`;
            btnEdit.classList.add('danger');
            if(btnSave) btnSave.style.display = 'inline-flex';
            if(btnAdd) btnAdd.style.display = 'inline-flex';
            
            if (searchInput) {
                searchInput.value = ''; 
                searchInput.disabled = true;
                searchInput.placeholder = '編輯模式下不可搜尋';
            }
        } else {
            // === 離開編輯模式 ===
            this.loadData(); // 重新載入以還原
            
            btnEdit.innerHTML = `✏️ 編輯模式`;
            btnEdit.classList.remove('danger');
            if(btnSave) btnSave.style.display = 'none';
            if(btnAdd) btnAdd.style.display = 'none';
            
            if (searchInput) {
                searchInput.disabled = false;
                searchInput.placeholder = '搜尋名稱、種類、規格...';
            }
        }
        this.renderTable();
    },

    addNewRow() {
        // 自動產生 ID
        const autoId = 'AUTO-' + Date.now().toString().slice(-6);
        
        const newRow = {
            id: autoId, 
            name: '',
            category: '未分類', 
            spec: '',
            interface: '', // 新增欄位
            property: '',  // 新增欄位
            cost: '',
            priceMtb: '',
            priceSi: '',
            priceMtu: '',
            _isNew: true 
        };
        // 插入到最前面
        this.allProducts.unshift(newRow);
        this.renderTable();
        
        showNotification('已新增一筆資料 (ID 自動生成)', 'info');
    },

    // ★ 初始化 Chip Wall (拖曳排序核心)
    initChipWall(categories, groups) {
        const wallArea = document.getElementById('chip-wall-area');
        const listContainer = document.getElementById('category-chip-list');
        if (!wallArea || !listContainer) return;

        wallArea.style.display = 'block';
        listContainer.innerHTML = '';

        categories.forEach(cat => {
            const count = groups[cat] ? groups[cat].length : 0;
            const chip = document.createElement('div');
            chip.className = 'chip-item';
            chip.draggable = true; // 啟用拖曳
            chip.dataset.category = cat;
            chip.innerHTML = `
                <span>${cat}</span>
                <span class="chip-count">${count}</span>
            `;

            // 點擊事件：捲動到對應區塊
            chip.addEventListener('click', () => {
                const target = document.getElementById(`group-${cat}`);
                if (target) {
                    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    // 稍微閃爍一下目標區塊
                    target.style.transition = 'background 0.3s';
                    target.style.backgroundColor = '#f0f9ff';
                    setTimeout(() => target.style.backgroundColor = 'white', 800);
                }
            });

            // --- Drag & Drop Events ---
            chip.addEventListener('dragstart', (e) => {
                chip.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
            });

            chip.addEventListener('dragend', () => {
                chip.classList.remove('dragging');
                // 檢查是否順序有變，若有則儲存並重整
                this.checkAndSaveOrder();
            });

            listContainer.appendChild(chip);
        });

        // 容器的 Drag Over 事件 (實現交換邏輯)
        listContainer.addEventListener('dragover', (e) => {
            e.preventDefault();
            const afterElement = this.getDragAfterElement(listContainer, e.clientX, e.clientY);
            const draggable = document.querySelector('.dragging');
            if (draggable) {
                if (afterElement == null) {
                    listContainer.appendChild(draggable);
                } else {
                    listContainer.insertBefore(draggable, afterElement);
                }
            }
        });
    },

    // 輔助計算拖曳位置
    getDragAfterElement(container, x, y) {
        const draggableElements = [...container.querySelectorAll('.chip-item:not(.dragging)')];
        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = x - box.left - box.width / 2;
            if (offset < 0 && offset > closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    },

    // 檢查順序並儲存
    checkAndSaveOrder() {
        const chips = document.querySelectorAll('#category-chip-list .chip-item');
        const newOrder = Array.from(chips).map(c => c.dataset.category);
        
        // 簡單比對是否改變
        const currentJson = JSON.stringify(this.categoryOrder);
        const newJson = JSON.stringify(newOrder);

        if (currentJson !== newJson) {
            // 呼叫 API 儲存
            this.saveCategoryOrder(newOrder);
        }
    },

    renderTable(query = '') {
        const container = document.getElementById('product-groups-container');
        if (!container) return;

        let data = this.allProducts;
        
        // 搜尋過濾
        if (query && !this.isEditMode) {
            const q = query.toLowerCase();
            data = data.filter(p => 
                (p.name && p.name.toLowerCase().includes(q)) ||
                (p.category && p.category.toLowerCase().includes(q)) ||
                (p.spec && p.spec.toLowerCase().includes(q))
            );
        }

        if (data.length === 0) {
            container.innerHTML = `<div style="text-align:center; padding:3rem; color:#888;">查無商品資料</div>`;
            return;
        }

        // 1. 分組 (Group Data)
        const groups = {};
        data.forEach(item => {
            const cat = item.category ? item.category.trim() : '未分類';
            if (!groups[cat]) groups[cat] = [];
            groups[cat].push(item);
        });

        // 2. 決定顯示順序 (以 API 回傳的 categoryOrder 為準)
        const currentCategories = Object.keys(groups);
        let displayOrder = [];

        // 先放已儲存的順序
        this.categoryOrder.forEach(cat => {
            if (groups[cat]) {
                displayOrder.push(cat);
            }
        });
        // 再放新出現的 (未在儲存列表中的)
        currentCategories.forEach(cat => {
            if (!displayOrder.includes(cat)) {
                displayOrder.push(cat);
            }
        });
        
        // 若完全沒存檔過，就預設排序 (未分類最後)
        if (this.categoryOrder.length === 0) {
            displayOrder.sort((a, b) => {
                if (a === '未分類') return 1;
                if (b === '未分類') return -1;
                return a.localeCompare(b);
            });
        }

        // 初始化 Chip Wall (編輯模式或搜尋時隱藏)
        if (!this.isEditMode && !query) {
            this.initChipWall(displayOrder, groups);
        } else {
            const wall = document.getElementById('chip-wall-area');
            if(wall) wall.style.display = 'none';
        }

        // 3. 產生 HTML
        let html = '';

        displayOrder.forEach(category => {
            let items = groups[category];

            // 排序卡片內的商品：僅依「商品名稱」排序 (移除狀態排序)
            items.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

            html += `
                <div class="category-group-widget" id="group-${category}">
                    <div class="category-header">
                        <div class="category-title">
                            ${category}
                            <span style="font-size:0.8rem; color:#64748b; background:#e2e8f0; padding:1px 8px; border-radius:10px;">${items.length}</span>
                        </div>
                    </div>
                    <div class="table-responsive">
                        <table class="data-table product-edit-table">
                            <thead>
                                <tr>
                                    <th width="5%">#</th>
                                    <th width="20%">商品名稱</th>
                                    <th width="10%">種類</th>
                                    <th width="15%">規格</th>
                                    
                                    <th width="10%">介面</th>
                                    <th width="10%">性質</th>

                                    <th width="7%">成本</th>
                                    <th width="7%">MTB</th>
                                    <th width="7%">SI</th>
                                    <th width="7%">MTU</th>
                                    
                                    <th width="8%">最後修改</th>
                                </tr>
                            </thead>
                            <tbody>
            `;

            items.forEach((item, index) => {
                const originalIndex = this.allProducts.indexOf(item);
                const itemNum = index + 1; // 項次

                if (this.isEditMode) {
                    // === 編輯模式 ===
                    html += `
                        <tr class="edit-row" data-index="${originalIndex}">
                            <td class="text-muted">${itemNum}</td>
                            
                            <input type="hidden" name="id" value="${item.id || ''}">
                            
                            <td><input type="text" name="name" class="form-control dense" value="${item.name || ''}"></td>
                            <td><input type="text" name="category" class="form-control dense" value="${item.category || ''}" placeholder="分類"></td>
                            <td><input type="text" name="spec" class="form-control dense" value="${item.spec || ''}"></td>
                            
                            <td><input type="text" name="interface" class="form-control dense" value="${item.interface || ''}"></td>
                            <td><input type="text" name="property" class="form-control dense" value="${item.property || ''}"></td>

                            <td><input type="number" name="cost" class="form-control dense" value="${item.cost || ''}"></td>
                            <td><input type="number" name="priceMtb" class="form-control dense" value="${item.priceMtb || ''}"></td>
                            <td><input type="number" name="priceSi" class="form-control dense" value="${item.priceSi || ''}"></td>
                            <td><input type="number" name="priceMtu" class="form-control dense" value="${item.priceMtu || ''}"></td>
                            
                            <td class="text-muted" style="font-size:0.8rem">-</td>
                        </tr>
                    `;
                } else {
                    // === 檢視模式 ===
                    const costHtml = this.renderSensitiveCell(item.id, 'cost', item.cost);
                    const mtbHtml = this.renderSensitiveCell(item.id, 'mtb', item.priceMtb);
                    const siHtml = this.renderSensitiveCell(item.id, 'si', item.priceSi);
                    const mtuHtml = this.renderSensitiveCell(item.id, 'mtu', item.priceMtu);
                    
                    const lastMod = item.lastUpdateTime ? item.lastUpdateTime.split('T')[0] : '-';

                    html += `
                        <tr>
                            <td class="text-muted font-mono">${itemNum}</td>
                            <td style="font-weight:600">${item.name}</td>
                            <td><span class="badge-tag badge-category">${item.category || '-'}</span></td>
                            <td style="font-size:0.9rem">${item.spec || '-'}</td>
                            
                            <td style="font-size:0.9rem">${item.interface || '-'}</td>
                            <td style="font-size:0.9rem">${item.property || '-'}</td>

                            <td>${costHtml}</td>
                            <td>${mtbHtml}</td>
                            <td>${siHtml}</td>
                            <td>${mtuHtml}</td>
                            
                            <td style="font-size:0.8rem; color:#999;">${lastMod}</td>
                        </tr>
                    `;
                }
            });

            html += `</tbody></table></div></div>`;
        });

        container.innerHTML = html;
    },

    // 儲存邏輯
    async saveAll() {
        const rows = document.querySelectorAll('.product-edit-table tbody tr');
        const payload = [];
        
        rows.forEach(row => {
            const inputs = row.querySelectorAll('input, select');
            const obj = {};
            inputs.forEach(input => {
                obj[input.name] = input.value.trim();
            });

            // 合併原始資料 (包含未顯示的欄位)
            const originalIndex = parseInt(row.dataset.index);
            const originalObj = this.allProducts[originalIndex] || {};
            
            payload.push({ ...originalObj, ...obj });
        });

        if (payload.length === 0) return;
        if (!confirm(`確定要儲存 ${payload.length} 筆資料嗎？`)) return;

        const btnSave = document.getElementById('btn-save-batch');
        if(btnSave) {
            btnSave.disabled = true;
            btnSave.innerHTML = '<div class="spinner small"></div> 儲存中...';
        }

        try {
            const res = await authedFetch('/api/products/batch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ products: payload })
            });

            if (res.success) {
                showNotification(`儲存成功！`, 'success');
                this.isEditMode = false;
                this.loadData();
            } else {
                throw new Error(res.error || '儲存失敗');
            }
        } catch (error) {
            console.error(error);
            showNotification(error.message, 'error');
            if(btnSave) {
                btnSave.disabled = false;
                btnSave.innerHTML = '儲存';
            }
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
            return `<span class="sensitive-value masked" onclick="ProductManager.toggleSensitive('${key}')">$$$</span>`;
        }
    },

    toggleSensitive(key) {
        if (this.revealedIds.has(key)) this.revealedIds.delete(key);
        else this.revealedIds.add(key);
        if (!this.isEditMode) this.renderTable();
    },
    
    async forceRefresh() {
        const btn = document.getElementById('btn-refresh-products');
        if(btn) { btn.disabled = true; btn.innerHTML = '<div class="spinner small"></div> 同步中...'; }
        try {
            const res = await authedFetch('/api/products/refresh', { method: 'POST' });
            if(res.success) {
                showNotification('同步完成', 'success');
                await this.loadData();
            } else { throw new Error(res.error); }
        } catch(err) { showNotification(err.message, 'error'); } 
        finally {
            if(btn) { 
                btn.disabled = false; 
                btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6"></path><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg> 同步資料`; 
            }
        }
    }
};

if (window.CRM_APP) {
    window.CRM_APP.pageModules['products'] = () => ProductManager.init();
}