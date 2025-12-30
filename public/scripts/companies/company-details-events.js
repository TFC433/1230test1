// views/scripts/company-details-events.js
// 職責：處理「公司詳細資料頁」的所有使用者互動事件 (Fix: 補上機會案件與聯絡人的刪除處理)

let _currentCompanyInfo = null;
let _detailsContainer = null;

function initializeCompanyEventListeners(companyInfo) {
    _currentCompanyInfo = companyInfo;
    
    // 尋找主容器 (假設在 layout 中有一個 ID 為 page-company-details 的容器)
    _detailsContainer = document.getElementById('page-company-details') || document.body;

    // 移除舊的監聽器 (防止重複)
    _detailsContainer.removeEventListener('click', handleCompanyDetailsAction);
    _detailsContainer.removeEventListener('submit', handleCompanyDetailsSubmit);

    // 綁定新的監聽器
    _detailsContainer.addEventListener('click', handleCompanyDetailsAction);
    _detailsContainer.addEventListener('submit', handleCompanyDetailsSubmit);
}

// --- 事件委派處理器 (修正重點：補齊所有動作) ---

function handleCompanyDetailsAction(e) {
    // 尋找最近的帶有 data-action 的按鈕
    const btn = e.target.closest('[data-action]');
    if (!btn) return;

    const action = btn.dataset.action;
    const payload = btn.dataset;

    switch (action) {
        // --- 編輯與 UI ---
        case 'edit-mode':
            toggleCompanyEditMode(payload.enabled === 'true');
            break;
        case 'generate-profile':
            generateCompanyProfile();
            break;
        
        // --- 刪除操作 ---
        case 'delete-company':
            confirmDeleteCompany();
            break;
        case 'delete-opp': // 【修正】補上機會刪除
            confirmDeleteOppInDetails(payload.rowIndex, payload.name);
            break;
        
        // --- 聯絡人操作 ---
        case 'edit-contact':
            try {
                const contact = JSON.parse(payload.contact);
                showEditContactModal(contact);
            } catch (err) { console.error('解析聯絡人資料失敗', err); }
            break;
        
        // 若有導航需求
        case 'navigate':
             e.preventDefault();
             if (window.CRM_APP && payload.page) {
                 const params = payload.params ? JSON.parse(payload.params) : {};
                 window.CRM_APP.navigateTo(payload.page, params);
             }
             break;
    }
}

function handleCompanyDetailsSubmit(e) {
    // 攔截所有表單提交
    if (e.target.id === 'company-edit-form') {
        saveCompanyInfo(e);
    } else if (e.target.id === 'edit-contact-form') {
        handleSaveContact(e);
    }
}

// =============================================
// 邏輯實作區
// =============================================

// 1. 切換編輯模式
function toggleCompanyEditMode(isEditing, aiData = null) {
    const container = document.getElementById('company-info-card-container');
    if (!container) return;

    let dataToRender = _currentCompanyInfo;

    if (aiData) {
        dataToRender = { ..._currentCompanyInfo, ...aiData };
    } else if (isEditing) {
        dataToRender = _currentCompanyInfo;
    }

    if (typeof renderCompanyInfoCard === 'function') {
        const newHtml = renderCompanyInfoCard(dataToRender, isEditing);
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = newHtml;
        const newElement = tempDiv.firstElementChild;
        container.replaceWith(newElement);
    } else {
        console.error('找不到 renderCompanyInfoCard 函式');
    }
}

// 2. 儲存公司資料
async function saveCompanyInfo(event) {
    event.preventDefault();
    const form = document.getElementById('company-edit-form');
    if (!form) return;

    const formData = new FormData(form);
    const updateData = Object.fromEntries(formData.entries());
    const oldCompanyName = _currentCompanyInfo.companyName;
    const encodedOldName = encodeURIComponent(oldCompanyName);

    if (!updateData.companyName || updateData.companyName.trim() === '') {
        showNotification('公司名稱為必填項目', 'warning');
        return;
    }

    const saveBtn = form.querySelector('.btn-save');
    const originalBtnContent = saveBtn ? saveBtn.innerHTML : '💾 儲存';
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<span>儲存中...</span>';
    }

    try {
        const result = await authedFetch(`/api/companies/${encodedOldName}`, {
            method: 'PUT',
            body: JSON.stringify(updateData),
            headers: { 'Content-Type': 'application/json' }
        });

        if (result.success) {
            showNotification('公司資料已更新', 'success');
            _currentCompanyInfo = { ..._currentCompanyInfo, ...updateData };

            if (updateData.companyName !== oldCompanyName) {
                // 名稱變更導致 URL 改變，導航會觸發重載
                window.location.hash = `#/companies/${encodeURIComponent(updateData.companyName)}`;
            } else {
                toggleCompanyEditMode(false);
            }
        } else {
            throw new Error(result.error || '儲存失敗');
        }
    } catch (error) {
        console.error('儲存失敗:', error);
        showNotification('儲存失敗: ' + error.message, 'error');
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = originalBtnContent;
        }
    }
}

// 3. AI 生成簡介
async function generateCompanyProfile() {
    const input = document.getElementById('company-keywords-input');
    const keywords = input ? input.value : '';
    
    const form = document.getElementById('company-edit-form');
    let currentInputData = {};
    if (form) {
        const currentFormData = new FormData(form);
        currentInputData = Object.fromEntries(currentFormData.entries());
    }

    showLoading('AI 正在撰寫簡介並查找資料...');
    try {
        const encodedCompanyName = encodeURIComponent(_currentCompanyInfo.companyName);
        const result = await authedFetch(`/api/companies/${encodedCompanyName}/generate-profile`, {
            method: 'POST',
            body: JSON.stringify({ userKeywords: keywords }),
            skipRefresh: true 
        });

        if (result.success && result.data) {
            const aiUpdates = {};
            if (result.data.introduction) aiUpdates.introduction = result.data.introduction;
            if (result.data.phone) aiUpdates.phone = result.data.phone;
            if (result.data.address) aiUpdates.address = result.data.address;
            if (result.data.county) aiUpdates.county = result.data.county;

            const mergedData = { ..._currentCompanyInfo, ...currentInputData, ...aiUpdates };
            toggleCompanyEditMode(true, mergedData);
            showNotification('AI 簡介與聯絡資訊已生成！', 'success');
        } else {
            throw new Error(result.message || '生成失敗');
        }
    } catch (error) {
        showNotification('AI 生成失敗: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

// 4. 刪除公司
async function confirmDeleteCompany() {
    if (!_currentCompanyInfo) return;
    const name = _currentCompanyInfo.companyName;
    const message = `確定要刪除「${name}」嗎？此操作無法復原。`;
    
    const performDelete = async () => {
        showLoading('刪除中...');
        try {
            const result = await authedFetch(`/api/companies/${encodeURIComponent(name)}`, { method: 'DELETE' });
            if (result.success) {
                showNotification('公司已刪除', 'success');
                // 導回列表頁
                if (window.CRM_APP) window.CRM_APP.navigateTo('companies');
                else window.location.hash = '#/companies';
            } else {
                showNotification('刪除失敗: ' + (result.error || '未知錯誤'), 'error');
            }
        } catch (e) {
            showNotification('刪除請求失敗', 'error');
        } finally {
            hideLoading();
        }
    };

    if (typeof showConfirmDialog === 'function') {
        showConfirmDialog(message, performDelete);
    } else if (confirm(message)) {
        performDelete();
    }
}

// 5. 【新增】刪除機會案件 (在詳細頁中)
async function confirmDeleteOppInDetails(rowIndex, oppName) {
    if (!rowIndex) return;
    const message = `確定要刪除機會「${oppName || '(未命名)'}」嗎？`;

    showConfirmDialog(message, async () => {
        showLoading('正在刪除機會...');
        try {
            const result = await authedFetch(`/api/opportunities/${rowIndex}`, { method: 'DELETE' });
            if (result.success) {
                showNotification('刪除成功', 'success');
                // 重新載入當前公司頁面以刷新列表
                if (window.CRM_APP && window.CRM_APP.pageModules['company-details']) {
                    window.CRM_APP.pageModules['company-details'](encodeURIComponent(_currentCompanyInfo.companyName));
                } else {
                    window.location.reload();
                }
            } else {
                showNotification('刪除失敗: ' + (result.error || '未知錯誤'), 'error');
            }
        } catch (e) {
            showNotification('刪除請求失敗', 'error');
        } finally {
            hideLoading();
        }
    });
}

// 6. 聯絡人編輯 Modal
function showEditContactModal(contact) {
    const modalContainer = document.createElement('div');
    modalContainer.id = 'edit-contact-modal-container';
    modalContainer.innerHTML = `
        <div id="edit-contact-modal" class="modal" style="display: block;">
            <div class="modal-content" style="max-width: 600px;">
                <div class="modal-header">
                    <h2 class="modal-title">編輯聯絡人: ${contact.name}</h2>
                    <button class="close-btn" id="btn-close-contact-modal">&times;</button>
                </div>
                <form id="edit-contact-form">
                    <input type="hidden" id="edit-contact-id" value="${contact.contactId}">
                    <div class="form-row">
                        <div class="form-group"><label class="form-label">部門</label><input type="text" class="form-input" id="edit-contact-department" value="${contact.department || ''}"></div>
                        <div class="form-group"><label class="form-label">職位</label><input type="text" class="form-input" id="edit-contact-position" value="${contact.position || ''}"></div>
                    </div>
                    <div class="form-row">
                        <div class="form-group"><label class="form-label">手機</label><input type="tel" class="form-input" id="edit-contact-mobile" value="${contact.mobile || ''}"></div>
                        <div class="form-group"><label class="form-label">公司電話</label><input type="tel" class="form-input" id="edit-contact-phone" value="${contact.phone || ''}"></div>
                    </div>
                    <div class="form-group"><label class="form-label">Email</label><input type="email" class="form-input" id="edit-contact-email" value="${contact.email || ''}"></div>
                    <button type="submit" class="submit-btn">💾 儲存變更</button>
                </form>
            </div>
        </div>
    `;
    document.body.appendChild(modalContainer);

    // 綁定關閉按鈕
    document.getElementById('btn-close-contact-modal').addEventListener('click', closeEditContactModal);
    // 表單提交會自動冒泡到 handleCompanyDetailsSubmit
}

function closeEditContactModal() {
    const el = document.getElementById('edit-contact-modal-container');
    if (el) el.remove();
}

async function handleSaveContact(e) {
    e.preventDefault();
    const id = document.getElementById('edit-contact-id').value;
    const data = {
        department: document.getElementById('edit-contact-department').value,
        position: document.getElementById('edit-contact-position').value,
        mobile: document.getElementById('edit-contact-mobile').value,
        phone: document.getElementById('edit-contact-phone').value,
        email: document.getElementById('edit-contact-email').value,
    };
    try {
        await authedFetch(`/api/contacts/${id}`, { method: 'PUT', body: JSON.stringify(data) });
        showNotification('聯絡人已更新', 'success');
        closeEditContactModal();
        // 重新載入頁面
        if(window.CRM_APP && window.CRM_APP.pageModules['company-details']) {
             window.CRM_APP.pageModules['company-details'](encodeURIComponent(_currentCompanyInfo.companyName));
        }
    } catch(e) { 
        console.error(e); 
        showNotification('更新失敗', 'error');
    }
}