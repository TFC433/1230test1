// public/scripts/core/layout-manager.js
// 職責：管理側邊欄 (Sidebar) 狀態、使用者資訊、權限顯示與下拉選單更新

window.CRM_APP = window.CRM_APP || {};

const LayoutManager = {
    isPinned: true,
    currentUserRole: 'sales', // 預設權限

    init() {
        console.log('🏗️ [Layout] 初始化 UI 佈局...');
        this.loadUserRole();
        this.setupSidebar();
        this.displayUser();
        this.injectAdminFeatures(); // ★ 新增：注入管理員功能
    },

    /**
     * 從 LocalStorage 載入使用者角色
     */
    loadUserRole() {
        this.currentUserRole = localStorage.getItem('crmUserRole') || 'sales';
        window.CRM_APP.currentUserRole = this.currentUserRole;
        console.log(`👤 [Layout] 當前使用者角色: ${this.currentUserRole}`);
    },

    setupSidebar() {
        const pinBtn = document.getElementById('sidebar-pin-toggle');
        if (!pinBtn) return;

        const stored = localStorage.getItem('crm-sidebar-pinned');
        this.isPinned = stored === null ? true : (stored === 'true');

        pinBtn.addEventListener('click', () => {
            this.isPinned = !this.isPinned;
            localStorage.setItem('crm-sidebar-pinned', this.isPinned);
            this.updateSidebarUI();
        });

        this.updateSidebarUI();
    },

    updateSidebarUI() {
        const layout = document.querySelector('.app-layout');
        const pinBtn = document.getElementById('sidebar-pin-toggle');
        if (!layout || !pinBtn) return;

        const iconContainer = pinBtn.querySelector('.nav-icon');
        const textLabel = pinBtn.querySelector('.nav-text');

        if (this.isPinned) {
            layout.classList.remove('sidebar-collapsed');
            if (textLabel) textLabel.textContent = '收合側邊欄';
            if (iconContainer) iconContainer.innerHTML = this.getIcon('left');
        } else {
            layout.classList.add('sidebar-collapsed');
            if (textLabel) textLabel.textContent = '展開側邊欄';
            if (iconContainer) iconContainer.innerHTML = this.getIcon('right');
        }
    },

    getIcon(dir) {
        const pts = dir === 'left' ? "15 18 9 12 15 6" : "9 18 15 12 9 6";
        return `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="${pts}"></polyline></svg>`;
    },

    displayUser() {
        const el = document.getElementById('user-display-name');
        const name = localStorage.getItem('crmCurrentUserName') || '使用者';
        
        // 顯示名稱與角色標記 (如果是 Admin)
        const roleLabel = this.currentUserRole === 'admin' ? ' (Admin)' : '';
        
        if (el) el.textContent = `👤 ${name}${roleLabel}`;
        window.CRM_APP.currentUser = name;
    },

    /**
     * ★★★ 新增：注入管理員專用選單 ★★★
     * 只有 admin 角色才會執行此邏輯
     */
    injectAdminFeatures() {
        if (this.currentUserRole !== 'admin') return;

        const sidebarNav = document.querySelector('.sidebar-nav ul') || document.querySelector('.sidebar-menu');
        if (!sidebarNav) return;

        // 檢查是否已經存在 (避免重複插入)
        if (document.getElementById('nav-cost-analysis')) return;

        console.log('🛡️ [Layout] 偵測到管理員權限，啟用進階選單...');

        // 建立新的選單項目
        const adminItem = document.createElement('li');
        adminItem.id = 'nav-cost-analysis';
        adminItem.className = 'nav-item admin-only'; // 加上 class 方便管理
        
        // 這裡設定點擊後的行為，暫時先 log，下一階段我們會換成 router.navigate
        adminItem.innerHTML = `
            <a href="#" class="nav-link" onclick="alert('Phase 2 待實作：跳轉至商品成本分析頁面'); return false;">
                <span class="nav-icon">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="12" y1="1" x2="12" y2="23"></line>
                        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                    </svg>
                </span>
                <span class="nav-text">商品成本</span>
            </a>
        `;

        // 將新按鈕插入到「系統設定」之前，或者列表的最下方
        const systemConfigItem = Array.from(sidebarNav.children).find(li => li.textContent.includes('系統設定'));
        
        if (systemConfigItem) {
            sidebarNav.insertBefore(adminItem, systemConfigItem);
        } else {
            sidebarNav.appendChild(adminItem);
        }
    },

    updateDropdowns() {
        const config = window.CRM_APP.systemConfig;
        const mappings = window.CRM_APP.dropdownMappings;
        if (!config || !mappings) return;

        Object.entries(mappings).forEach(([id, key]) => {
            const select = document.getElementById(id);
            if (select && Array.isArray(config[key])) {
                const currentVal = select.value;
                const firstOption = select.querySelector('option:first-child')?.outerHTML || '<option value="">請選擇...</option>';
                
                select.innerHTML = firstOption;
                config[key]
                    .sort((a, b) => (a.order || 99) - (b.order || 99))
                    .forEach(item => {
                        const opt = document.createElement('option');
                        opt.value = item.value;
                        opt.textContent = item.note || item.value;
                        select.appendChild(opt);
                    });
                
                if (currentVal) select.value = currentVal;
            }
        });
    }
};

window.CRM_APP.updateAllDropdowns = LayoutManager.updateDropdowns.bind(LayoutManager);