// public/scripts/dashboard/dashboard_ui.js

const DashboardUI = {
    /**
     * 顯示指定 Widget 的 Loading 狀態
     * @param {string} widgetId - Widget 的 DOM ID (e.g., 'kanban-widget')
     * @param {string} message - 顯示訊息
     */
    showLoading(widgetId, message = '載入中...') {
        const widget = document.getElementById(widgetId);
        if (!widget) return;
        
        // 嘗試找到內部的 .loading 容器，若無則建立
        let loadingEl = widget.querySelector('.loading');
        if (!loadingEl) {
            const content = widget.querySelector('.widget-content') || widget;
            // 檢查是否已經有 .loading 結構 (避免重複)
            if (!content.querySelector('.loading')) {
                loadingEl = document.createElement('div');
                loadingEl.className = 'loading';
                loadingEl.innerHTML = `<div class="spinner"></div><p>${message}</p>`;
                content.appendChild(loadingEl);
            } else {
                loadingEl = content.querySelector('.loading');
            }
        }
        
        if (loadingEl) {
            const msgP = loadingEl.querySelector('p');
            if (msgP) msgP.textContent = message;
            loadingEl.classList.add('show');
        }
    },

    /**
     * 隱藏指定 Widget 的 Loading 狀態
     * @param {string} widgetId 
     */
    hideLoading(widgetId) {
        const widget = document.getElementById(widgetId);
        if (!widget) return;
        
        const loadingEl = widget.querySelector('.loading');
        if (loadingEl) {
            loadingEl.classList.remove('show');
        }
    },

    /**
     * 全域的初始化 Loading (通常用於第一次進入 Dashboard)
     */
    showGlobalLoading(message = '正在同步儀表板資料...') {
        if (typeof showLoading === 'function') {
            showLoading(message); // 使用 utils.js 的全域 loading
        }
    },

    hideGlobalLoading() {
        if (typeof hideLoading === 'function') {
            hideLoading();
        }
    },

    /**
     * 顯示錯誤訊息在指定 Widget
     */
    showError(widgetId, errorMessage) {
        const widget = document.getElementById(widgetId);
        if (!widget) return;
        
        const content = widget.querySelector('.widget-content') || widget;
        content.innerHTML = `<div class="alert alert-error">${errorMessage}</div>`;
    }
};

window.DashboardUI = DashboardUI;


// ★★★ 全新：UserProfile 管理器 (包含修改密碼邏輯) ★★★
const UserProfile = {
    modalId: 'user-profile-modal',
    
    // 初始化
    init() {
        const modal = document.getElementById(this.modalId);
        if (!modal) return;

        // 綁定背景點擊 (防誤觸搖晃)
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                const card = modal.querySelector('.profile-card');
                card.classList.remove('modal-shake');
                void card.offsetWidth; // Trigger reflow
                card.classList.add('modal-shake');
            }
        });

        // 綁定表單輸入事件 (即時驗證)
        this.bindEvents();
    },

    open() {
        const modal = document.getElementById(this.modalId);
        
        // 1. 讀取使用者資訊
        const storedName = localStorage.getItem('crmCurrentUserName') || '使用者';
        const storedRole = localStorage.getItem('crmUserRole') || 'sales'; 
        
        const nameEl = document.getElementById('profile-name-large');
        const avatarEl = document.getElementById('profile-avatar');
        
        // 取得新的 Tag 元素
        const roleTagEl = document.getElementById('profile-role-tag');
        const permTagEl = document.getElementById('profile-permission-tag');
        
        // 2. 更新基本資訊
        if (nameEl) nameEl.textContent = storedName;
        if (avatarEl) avatarEl.textContent = (storedName[0] || 'U').toUpperCase();
        
        // ★★★ 3. 角色與權限 Tag 設定 ★★★
        const ROLE_MAP = {
            'admin': {
                title: '主管 (Admin)',
                permission: '系統管理員'
            },
            'sales': {
                title: '業務 (Sales)',
                permission: '一般權限'
            }
        };

        const roleConfig = ROLE_MAP[storedRole] || ROLE_MAP['sales'];

        // 更新 Tag 文字與顏色
        if (roleTagEl) {
            roleTagEl.textContent = roleConfig.title;
            
            // 根據角色給予不同顏色
            if (storedRole === 'admin') {
                // 紅色系 (代表管理員)
                roleTagEl.style.backgroundColor = '#fee2e2';
                roleTagEl.style.color = '#991b1b';
            } else {
                // 藍色系 (代表一般業務)
                roleTagEl.style.backgroundColor = '#dbeafe';
                roleTagEl.style.color = '#1e40af';
            }
        }

        if (permTagEl) {
            permTagEl.textContent = roleConfig.permission;
        }
        
        // 重置狀態
        this.switchView('profile');
        this.resetForm();
        
        modal.classList.add('show');
    },

    // ★★★ 關閉視窗方法 ★★★
    close() {
        const modal = document.getElementById(this.modalId);
        if (modal) modal.classList.remove('show');
    },

    // 切換視圖 (Profile <-> Password)
    switchView(viewName) {
        const views = document.getElementById('profile-views');
        if (viewName === 'password') {
            views.style.transform = 'translateX(-50%)';
        } else {
            views.style.transform = 'translateX(0)';
        }
    },

    resetForm() {
        const form = document.getElementById('change-password-form');
        if (form) form.reset();
        
        // 清除所有驗證狀態
        ['cp-old', 'cp-new', 'cp-confirm'].forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            el.classList.remove('is-valid', 'is-invalid');
            const fb = document.getElementById(id.replace('cp', 'fb'));
            if (fb) {
                fb.textContent = '';
                fb.className = 'feedback-text';
            }
        });
        
        const meter = document.getElementById('strength-meter');
        if (meter) meter.className = 'strength-meter';
        
        const btn = document.getElementById('btn-save-password');
        if (btn) btn.disabled = true;
    },

    bindEvents() {
        const oldInput = document.getElementById('cp-old');
        const newInput = document.getElementById('cp-new');
        const confirmInput = document.getElementById('cp-confirm');
        const form = document.getElementById('change-password-form');

        if (!form) return;

        // 1. 舊密碼：On Blur (移開時) 驗證
        oldInput.addEventListener('blur', async () => {
            const val = oldInput.value;
            if (!val) return;
            
            // 呼叫後端驗證 API
            const isValid = await this.verifyOldPassword(val);
            this.setValidationState(oldInput, isValid, isValid ? '' : '舊密碼錯誤');
            this.checkFormValidity();
        });
        
        // 修正：當使用者重新輸入舊密碼時，移除錯誤狀態
        oldInput.addEventListener('input', () => {
             oldInput.classList.remove('is-invalid');
             document.getElementById('fb-old').textContent = '';
             this.checkFormValidity();
        });

        // 2. 新密碼：輸入時即時檢查強度
        newInput.addEventListener('input', () => {
            const val = newInput.value;
            const strength = this.checkStrength(val);
            this.updateStrengthMeter(strength);
            
            const isValid = strength >= 1; // 至少要有點強度
            this.setValidationState(newInput, isValid, isValid ? '' : '密碼長度至少 6 碼');
            
            // 連動檢查確認密碼
            if (confirmInput.value) confirmInput.dispatchEvent(new Event('input'));
            
            this.checkFormValidity();
        });

        // 3. 確認密碼：輸入時即時比對
        confirmInput.addEventListener('input', () => {
            const val = confirmInput.value;
            const origin = newInput.value;
            
            if (!val) {
                confirmInput.classList.remove('is-valid', 'is-invalid');
                return;
            }

            const isMatch = val === origin;
            this.setValidationState(confirmInput, isMatch, isMatch ? '' : '密碼不一致');
            
            // 決定按鈕是否可按 (全部通過才可按)
            this.checkFormValidity();
        });

        // 4. 送出表單
        form.addEventListener('submit', (e) => this.handleSubmit(e));
    },

    setValidationState(el, isValid, msg = '') {
        const feedback = document.getElementById(el.id.replace('cp', 'fb'));
        if (isValid) {
            el.classList.remove('is-invalid');
            el.classList.add('is-valid');
            feedback.textContent = msg || '';
            feedback.className = 'feedback-text text-success';
        } else {
            el.classList.remove('is-valid');
            el.classList.add('is-invalid');
            feedback.textContent = msg;
            feedback.className = 'feedback-text text-danger';
        }
    },

    checkStrength(pwd) {
        if (pwd.length < 6) return 0;
        let score = 1;
        if (pwd.length >= 8) score++;
        if (/[A-Za-z]/.test(pwd) && /[0-9]/.test(pwd)) score++;
        return Math.min(score, 3);
    },

    updateStrengthMeter(level) {
        const meter = document.getElementById('strength-meter');
        meter.className = 'strength-meter';
        if (level === 1) meter.classList.add('strength-weak');
        if (level === 2) meter.classList.add('strength-medium');
        if (level === 3) meter.classList.add('strength-strong');
    },

    checkFormValidity() {
        const oldValid = document.getElementById('cp-old').classList.contains('is-valid');
        const newValid = document.getElementById('cp-new').classList.contains('is-valid');
        const confirmValid = document.getElementById('cp-confirm').classList.contains('is-valid');
        
        document.getElementById('btn-save-password').disabled = !(oldValid && newValid && confirmValid);
    },

    async verifyOldPassword(password) {
        try {
            const token = localStorage.getItem('crm-token');
            const res = await fetch('/api/auth/verify-password', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ password })
            });
            const data = await res.json();
            return data.success && data.valid;
        } catch (e) {
            console.error(e);
            return false;
        }
    },

    async handleSubmit(e) {
        e.preventDefault();
        const btn = document.getElementById('btn-save-password');
        const oldPassword = document.getElementById('cp-old').value;
        const newPassword = document.getElementById('cp-new').value;

        btn.disabled = true;
        btn.textContent = '更新中...';

        try {
            const token = localStorage.getItem('crm-token');
            const res = await fetch('/api/auth/change-password', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ oldPassword, newPassword })
            });
            const result = await res.json();

            if (result.success) {
                alert('✅ 修改成功！請使用新密碼重新登入');
                logout(); // 呼叫全域登出函式
            } else {
                alert('❌ 修改失敗: ' + (result.message || '未知錯誤'));
                btn.disabled = false;
                btn.textContent = '確認修改';
            }
        } catch (error) {
            alert('網路錯誤');
            btn.disabled = false;
            btn.textContent = '確認修改';
        }
    }
};

// 讓全域可呼叫
window.UserProfile = UserProfile;

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    UserProfile.init();
});