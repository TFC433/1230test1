// public/scripts/services/ui.js
// 職責：管理所有全域 UI 元素，如彈窗、通知、面板、載入畫面和共用元件渲染器

// 【修改】將起始層級提高到 3000，確保系統彈窗永遠蓋在應用程式畫面(包含獨立編輯器)之上
let zIndexCounter = 3000; 

// Global variable to store the callback for the confirm dialog
window.confirmActionCallback = null;
let currentPreviewDriveLink = null;

function showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        zIndexCounter++; // Increment z-index for the new modal
        modal.style.zIndex = zIndexCounter; // Apply it
        modal.style.display = 'block';
        document.body.style.overflow = 'hidden'; // Prevent background scrolling
        console.log(`[UI] Modal shown: #${modalId} (z-index: ${zIndexCounter})`);
    } else {
        console.error(`[UI] Error: Modal with ID "${modalId}" not found.`);
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
        console.log(`[UI] Modal closed: #${modalId}`);
        const anyModalOpen = document.querySelector('.modal[style*="display: block"]');
        if (!anyModalOpen) {
            document.body.style.overflow = 'auto'; // Restore background scrolling only if no modals are left
            console.log('[UI] Restored body scroll.');
        } else {
            console.log('[UI] Body scroll remains hidden as other modals are open.');
        }
    } else {
        console.warn(`[UI] Attempted to close non-existent modal: #${modalId}`);
    }
}

function showConfirmDialog(message, callback) {
    const confirmMessageEl = document.getElementById('confirm-message');
    const confirmDialog = document.getElementById('confirm-dialog'); 

    if (confirmMessageEl && confirmDialog) {
        confirmMessageEl.textContent = message;
        window.confirmActionCallback = callback; 
        showModal('confirm-dialog'); 
    } else {
        console.warn('[UI] Custom confirm dialog elements not found. Falling back to native confirm.');
        if (confirm(message)) {
            if (typeof callback === 'function') {
                callback();
            }
        }
    }
}

function executeConfirmAction() {
    if (typeof window.confirmActionCallback === 'function') {
        try {
            window.confirmActionCallback(); 
        } catch (error) {
            console.error("[UI] Error executing confirm dialog callback:", error);
            showNotification(`執行確認操作時出錯: ${error.message}`, 'error');
        }
    } else {
        console.warn("[UI] Confirm button clicked, but no callback function was found.");
    }
    closeModal('confirm-dialog'); 
    window.confirmActionCallback = null; 
}


function openPanel(modalId) {
    const panelContainer = document.getElementById('slide-out-panel-container');
    const backdrop = document.getElementById('panel-backdrop');
    
    if (!panelContainer || !backdrop) { 
        console.error('[UI] 開啟 Panel 所需的容器或背景元素不完整。');
        return;
    }
    const title = "詳細資訊"; 
    const content = "<p>面板內容應在此處動態載入。</p>"; 

    const panelHTML = `
        <div class="slide-out-panel" id="active-panel">
            <div class="panel-header">
                <h2 class="panel-title">${title}</h2>
                <button class="close-btn" onclick="closePanel()">&times;</button>
            </div>
            <div class="panel-content">
                ${content}
            </div>
        </div>`;

    panelContainer.innerHTML = panelHTML;

    document.body.style.overflow = 'hidden'; 

    requestAnimationFrame(() => {
        const panel = document.getElementById('active-panel');
        backdrop.style.display = 'block'; 
        requestAnimationFrame(() => { 
            backdrop.classList.add('is-open');
            if(panel) panel.classList.add('is-open');
        });
    });

    backdrop.onclick = () => closePanel();
    console.log(`[UI] Panel opened.`);
}

function closePanel() {
    const panelContainer = document.getElementById('slide-out-panel-container');
    const panel = document.getElementById('active-panel');
    const backdrop = document.getElementById('panel-backdrop');

    if (panel && backdrop) {
        panel.classList.remove('is-open');
        backdrop.classList.remove('is-open');
        console.log(`[UI] Panel closing...`);

        panel.addEventListener('transitionend', () => {
            if (!panel.classList.contains('is-open')) { 
                if(panelContainer) panelContainer.innerHTML = ''; 
                backdrop.style.display = 'none'; 
                const anyModalOpen = document.querySelector('.modal[style*="display: block"]');
                if (!anyModalOpen) {
                    document.body.style.overflow = 'auto';
                    console.log('[UI] Restored body scroll after panel close.');
                }
                console.log(`[UI] Panel closed completely.`);
            }
        }, { once: true }); 

        setTimeout(() => {
            if (panel && !panel.classList.contains('is-open')) { 
                if(panelContainer) panelContainer.innerHTML = '';
                if(backdrop) backdrop.style.display = 'none';
                const anyModalOpen = document.querySelector('.modal[style*="display: block"]');
                if (!anyModalOpen && document.body.style.overflow !== 'auto') {
                    document.body.style.overflow = 'auto';
                    console.log('[UI] Restored body scroll after panel close (timeout fallback).');
                }
            }
        }, 500); 

    } else {
        console.warn('[UI] Cannot close panel: Panel or backdrop element not found.');
        if(document.body.style.overflow === 'hidden'){
            document.body.style.overflow = 'auto';
        }
    }
}


function showLoading(message = '處理中...') {
    const overlay = document.getElementById('loading-overlay');
    const messageEl = document.getElementById('loading-message');
    if (overlay && messageEl) {
        messageEl.textContent = message;
        // 確保 loading 也在最上層
        overlay.style.zIndex = zIndexCounter + 100; 
        overlay.style.display = 'flex'; 
        console.log(`[UI] Loading shown: ${message}`);
    } else {
        console.error("[UI] Loading overlay elements not found.");
    }
}

function hideLoading() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
        overlay.style.display = 'none';
        console.log(`[UI] Loading hidden.`);
    }
}

function showNotification(message, type = 'info', duration = 3000) {
    const notificationArea = document.getElementById('notification-area');
    const template = document.getElementById('notification-template'); 
    if (!notificationArea || !template || !template.content) {
        console.error('[UI] Notification area or template not found/invalid.');
        alert(`${type.toUpperCase()}: ${message}`);
        return;
    }

    const notification = template.content.cloneNode(true).firstElementChild;
    if (!notification) {
        console.error('[UI] Failed to clone notification template.');
        return;
    }

    const iconMap = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    const iconSpan = notification.querySelector('.notification-icon');
    const messageSpan = notification.querySelector('.notification-message');
    const closeBtn = notification.querySelector('.notification-close');

    notification.classList.add(type);
    if (iconSpan) iconSpan.textContent = iconMap[type] || '🔔'; 
    
    if (messageSpan) messageSpan.innerHTML = message;

    // 確保通知也在最上層
    notificationArea.style.zIndex = zIndexCounter + 200;

    const removeNotification = () => {
        notification.style.animation = 'slideOutRight 0.3s ease forwards';
        notification.addEventListener('animationend', () => notification.remove(), { once: true });
        setTimeout(() => notification.remove(), 400);
    };

    if (closeBtn) {
        closeBtn.onclick = removeNotification;
    }

    notificationArea.appendChild(notification);

    if (duration > 0) {
        setTimeout(removeNotification, duration);
    }
}

function renderPagination(containerId, pagination, loadFnName, filters = {}) {
    const paginationElement = document.getElementById(containerId);
    if (!paginationElement) {
        console.warn(`[UI] Pagination container #${containerId} not found.`);
        return;
    }

    let html = '';
    if (pagination && pagination.total && pagination.total > 1) {
        const searchBoxId = containerId.replace('-pagination', '-search'); 
        const searchBox = document.getElementById(searchBoxId);
        const query = searchBox ? searchBox.value.replace(/'/g, "\\'") : '';
        const filtersJson = JSON.stringify(filters || {}).replace(/'/g, "\\'"); 

        const loadFunctionExists = typeof window[loadFnName] === 'function';
        if (!loadFunctionExists) {
            console.error(`[UI] Pagination load function "${loadFnName}" is not defined globally.`);
            paginationElement.innerHTML = '<span style="color:red;">分頁錯誤</span>';
            return;
        }

        html += `<button class="pagination-btn prev" ${!pagination.hasPrev ? 'disabled' : ''} onclick="${loadFnName}(${pagination.current - 1}, '${query}', ${filtersJson})">‹ 上一頁</button>`;
        html += `<span class="pagination-info">第 ${pagination.current} / ${pagination.total} 頁</span>`;
        html += `<button class="pagination-btn next" ${!pagination.hasNext ? 'disabled' : ''} onclick="${loadFnName}(${pagination.current + 1}, '${query}', ${filtersJson})">下一頁 ›</button>`;
    } else if (pagination && pagination.totalItems !== undefined) {
        html = ''; 
    }
    paginationElement.innerHTML = html;
}

function _getTimelineIconSVG(eventType) {
    const svgAttrs = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
    
    switch (eventType) {
        case '會議討論':
            return `<svg ${svgAttrs}><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>`;
        case '電話聯繫':
            return `<svg ${svgAttrs}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>`;
        case '郵件溝通':
            return `<svg ${svgAttrs}><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>`;
        case '事件報告':
            return `<svg ${svgAttrs}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>`;
        case '系統事件':
            return `<svg ${svgAttrs}><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>`; 
        default:
            return `<svg ${svgAttrs}><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>`;
    }
}

function renderSingleInteractionItem(item) {
    if (!item || !item.interactionId) {
        console.warn("[Util] renderSingleInteractionItem called with invalid item:", item);
        return '<div class="timeline-item"><div class="alert alert-error">無法渲染此互動紀錄</div></div>'; 
    }

    const layoutConfig = window.CRM_APP?.systemConfig?.['時間軸佈局'] || [];
    const layoutMap = new Map(layoutConfig.map(configItem => [configItem.value, configItem.note]));
    
    const eventType = item.eventType || '互動'; 
    
    const direction = layoutMap.get(eventType) || 'right'; 
    const layoutClass = direction === 'left' ? 'timeline-item-left' : 'timeline-item-right';

    const iconSVG = _getTimelineIconSVG(eventType); 

    let summaryHTML = item.contentSummary || '';
    summaryHTML = summaryHTML.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const linkRegex = /\[(.*?)\]\(event_log_id=([a-zA-Z0-9]+)\)/g; 
    summaryHTML = summaryHTML.replace(linkRegex, (fullMatch, text, eventId) => {
        if (eventId && eventId.length > 5) {
            const safeEventId = eventId.replace(/'/g, "\\'").replace(/"/g, '&quot;');
            const onclickAction = typeof showEventLogReport === 'function'
                ? `showEventLogReport('${safeEventId}')`
                : `alert('查看報告功能無法使用')`;
            return `<a href="#" class="text-link" onclick="event.preventDefault(); ${onclickAction}">${text}</a>`;
        }
        return text;
    });

    const safeInteractionId = item.interactionId.replace(/'/g, "\\'").replace(/"/g, '&quot;');
    const editOnClick = (typeof OpportunityInteractions !== 'undefined' && OpportunityInteractions.showForEditing)
        ? `OpportunityInteractions.showForEditing('${safeInteractionId}')`
        : `console.warn('OpportunityInteractions.showForEditing not available in this context')`;

    const deleteOnClick = (typeof OpportunityInteractions !== 'undefined' && OpportunityInteractions.confirmDelete)
        ? `OpportunityInteractions.confirmDelete('${safeInteractionId}', ${item.rowIndex})`
        : `console.warn('OpportunityInteractions.confirmDelete not available in this context')`;

    const safeTitle = (item.eventTitle || eventType).replace(/"/g, '&quot;');
    const safeNextAction = (item.nextAction || '').replace(/"/g, '&quot;');
    const safeRecorder = (item.recorder || '-').replace(/"/g, '&quot;');

    return `
        <div class="timeline-item ${layoutClass}" data-type="${eventType}">
            <div class="timeline-icon" title="${safeTitle}"></div>
            <div class="timeline-content">
                <div class="interaction-card" id="interaction-${item.interactionId}">
                    <div class="interaction-card-header">
                        ${iconSVG} 
                        <h4 class="interaction-title">${safeTitle}</h4>
                        <span class="interaction-time">${formatDateTime(item.interactionTime)}</span>
                    </div>
                    <div class="interaction-card-body">
                        <p class="interaction-summary">${summaryHTML || '(無摘要)'}</p>
                        ${item.nextAction ? `<div class="interaction-next-action" style="margin-top: 8px;"><strong>下次行動:</strong> ${safeNextAction}</div>` : ''}
                    </div>
                    <div class="interaction-card-footer">
                        <span class="interaction-recorder" title="記錄人">👤 ${safeRecorder}</span>

                        <div class="action-buttons-container" style="display: inline-flex; gap: 4px;">
                            <button class="action-btn small warn" style="padding: 2px 6px; font-size: 0.7rem;" onclick="${editOnClick}" title="編輯此紀錄">✏️</button>
                            <button class="action-btn small danger" style="padding: 2px 6px; font-size: 0.7rem;" onclick="${deleteOnClick}" title="刪除此紀錄">🗑️</button>
                        </div>

                    </div>
                </div>
            </div>
        </div>
    `;
}

async function showBusinessCardPreview(driveLink) {
    currentPreviewDriveLink = driveLink;

    const modal = document.getElementById('business-card-preview-modal');
    const contentArea = document.getElementById('business-card-preview-content');
    if (!modal || !contentArea) {
        console.error('找不到名片預覽 modal 或內容區域');
        showNotification('無法開啟預覽視窗', 'error');
        return;
    }

    contentArea.innerHTML = '<div class="loading show"><div class="spinner"></div><p>載入預覽中...</p></div>';
    showModal('business-card-preview-modal');

    try {
        const result = await authedFetch(`/api/drive/thumbnail?link=${encodeURIComponent(driveLink)}`);
        
        if (result.success && result.thumbnailUrl) {
            const originalUrl = result.thumbnailUrl; 
            const highResUrl = originalUrl.replace(/=s\d+/g, '=s1600');
            const mediumResUrl = originalUrl.replace(/=s\d+/g, '=s800');

            const img = document.createElement('img');
            img.style.width = '100%';
            img.style.height = 'auto'; 
            img.style.borderRadius = '8px';
            img.style.display = 'block'; 

            const handleFinalError = () => {
                if (currentPreviewDriveLink !== driveLink) {
                    console.warn('[UI] Stale thumbnail error (s220) ignored.');
                    return; 
                }
                console.error('[UI] All thumbnail resolutions failed to load (s1600, s800, s220).');
                const safeOriginalLink = driveLink.replace(/"/g, '&quot;');
                contentArea.innerHTML = `<div class="alert alert-error">無法載入名片預覽 (所有解析度均失敗)。<br><a href="${safeOriginalLink}" target="_blank" class="text-link" style="margin-top: 10px; display: inline-block;" onclick="closeBusinessCardPreview()">點此在新分頁開啟</a></div>`;
            };

            const handleMediumError = () => {
                if (currentPreviewDriveLink !== driveLink) {
                    console.warn('[UI] Stale thumbnail error (s800) ignored.');
                    return; 
                }
                console.warn(`[UI] Medium-res thumbnail (s800) failed. Falling back to original (s220)...`);
                img.onerror = handleFinalError; 
                img.src = originalUrl;
            };

            const handleHighResError = () => {
                if (currentPreviewDriveLink !== driveLink) {
                    console.warn('[UI] Stale thumbnail error (s1600) ignored.');
                    return; 
                }
                console.warn(`[UI] High-res thumbnail (s1600) failed. Falling back to medium-res (s800)...`);
                img.onerror = handleMediumError; 
                img.src = mediumResUrl;
            };
            
            img.onload = () => {
                if (currentPreviewDriveLink === driveLink) {
                    contentArea.innerHTML = ''; 
                    contentArea.appendChild(img);
                    console.log(`[UI] Business card preview loaded successfully (at size: ${img.src.match(/=s(\d+)/)?.[1] || 'original'}).`);
                } else {
                    console.warn(`[UI] Stale business card preview (link: ${driveLink}) loaded but was ignored.`);
                }
            };

            img.onerror = handleHighResError;
            img.src = highResUrl; 

        } else {
            throw new Error(result.error || '無法取得縮圖 URL');
        }
    } catch (error) {
        if (currentPreviewDriveLink === driveLink) {
            console.warn("名片預覽失敗 (Catch Block):", error.message);
            const safeOriginalLink = driveLink.replace(/"/g, '&quot;');
            contentArea.innerHTML = `<div class="alert alert-error">無法載入名片預覽。<br><a href="${safeOriginalLink}" target="_blank" class="text-link" style="margin-top: 10px; display: inline-block;" onclick="closeBusinessCardPreview()">點此在新分頁開啟</a></div>`;
        } else {
            console.warn(`[UI] Stale business card preview API error ignored for link: ${driveLink}`);
        }
    }
}

function closeBusinessCardPreview() {
    currentPreviewDriveLink = null;

    const contentArea = document.getElementById('business-card-preview-content');
    const iframe = document.getElementById('business-card-iframe');
    if (iframe) {
        iframe.src = 'about:blank'; 
        iframe.remove(); 
    }
    const img = contentArea ? contentArea.querySelector('img') : null;
    if (img) {
        img.remove();
    }
    
    if(contentArea) {
        contentArea.innerHTML = '<div class="loading show"><div class="spinner"></div></div>'; 
    }
    closeModal('business-card-preview-modal');
}