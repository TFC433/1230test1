// public/scripts/core/login.js

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    // 【修正】這裡改回正確的 ID 'error-message'
    const messageEl = document.getElementById('error-message'); 
    const submitBtn = document.getElementById('login-btn');

    if (!loginForm) return;

    // 清除舊的 Session (避免權限混亂)
    localStorage.removeItem('crmToken');
    localStorage.removeItem('crmCurrentUserName');
    localStorage.removeItem('crmUserRole');

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // UI 狀態更新
        if (messageEl) {
            messageEl.textContent = '';
            messageEl.classList.remove('text-danger', 'text-success');
        }
        
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = '登入中...';
        }

        // 收集表單資料
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;

        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password })
            });

            const result = await response.json();

            if (result.success) {
                // 1. 儲存 Token
                localStorage.setItem('crmToken', result.token);
                // 相容舊版 Key (部分頁面可能還在用 crm-token)
                localStorage.setItem('crm-token', result.token); 
                
                // 2. 儲存使用者資訊
                localStorage.setItem('crmCurrentUserName', result.name);
                
                // ★★★ 3. 儲存角色權限 (這是我們這次新增的重點) ★★★
                localStorage.setItem('crmUserRole', result.role || 'sales');

                if (messageEl) {
                    messageEl.textContent = '登入成功，正在跳轉...';
                    messageEl.classList.add('text-success');
                }

                // 4. 延遲跳轉
                setTimeout(() => {
                    window.location.href = 'dashboard.html';
                }, 800);
            } else {
                throw new Error(result.message || '登入失敗');
            }

        } catch (error) {
            console.error('Login Error:', error);
            if (messageEl) {
                messageEl.textContent = error.message || '登入發生錯誤';
                messageEl.classList.add('text-danger');
            }
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = '登入系統'; // 修正按鈕文字
            }
        }
    });
});