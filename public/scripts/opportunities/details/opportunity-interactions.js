// views/scripts/opportunity-details/interactions.js
// 職責：專門管理「互動與新增」頁籤的所有 UI 與功能 (已重構為共用元件)

const OpportunityInteractions = (() => {
    // 模組私有變數
    let _interactions = [];
    let _context = {}; // 使用通用的 context 物件
    let _container = null; // 私有變數，用於儲存模組的操作容器

    // --- 【*** 程式碼修改點：將 '事件報告' 移出 ***】 ---
    // 【修正】定義哪些類型屬於「系統自動產生」
    const SYSTEM_GENERATED_TYPES = ['系統事件'];
    // --- 【*** 修改結束 ***】 ---

    // 【新增】處理子頁籤點擊事件
    function _handleTabClick(event) {
        if (!event.target.classList.contains('sub-tab-link')) return;

        const tab = event.target;
        const tabName = tab.dataset.tab;
        
        // 移除所有 active class
        _container.querySelectorAll('.sub-tab-link').forEach(t => t.classList.remove('active'));
        _container.querySelectorAll('.sub-tab-content').forEach(c => c.classList.remove('active'));

        // 新增 active class 到點擊的目標
        tab.classList.add('active');
        const contentPane = _container.querySelector(`#${tabName}-pane`);
        if (contentPane) {
            contentPane.classList.add('active');
        }
    }

    /**
     * 【重構】新的內部輔助函式，專門渲染一個時間軸列表
     * @param {string} containerId - 目標 <div id="...">
     * @param {Array<object>} interactions - 要渲染的互動資料
     * @param {number} limit - 預設顯示的數量
     */
    function _renderTimelineList(containerId, interactions, limit = 3) {
        const historyList = _container.querySelector(containerId);
        if (!historyList) {
            console.error(`[Interactions] 找不到時間軸容器: ${containerId}`);
            return;
        }

        const allInteractions = interactions; // 這是已經過濾過的
        
        if (!allInteractions || allInteractions.length === 0) {
            // 【*** 這裡是修改點 ***】
            historyList.innerHTML = `<div class="alert alert-info" style="text-align:center;">${containerId.includes('discussion') ? '尚無動態' : '尚無系統活動'}</div>`;
            // 【*** 修改結束 ***】
            return;
        }
        
        // 判斷當前是否已展開
        const isExpanded = historyList.classList.contains('is-expanded');
        
        const interactionsToRender = isExpanded ? allInteractions : allInteractions.slice(0, limit);
        let listHtml = interactionsToRender.map(renderSingleInteractionItem).join('');

        if (allInteractions.length > limit) {
            const buttonText = isExpanded 
                ? '收合紀錄' 
                : `顯示其餘 ${allInteractions.length - limit} 筆紀錄`;
            
            // 【修改】onclick 事件需要指定正確的列表 ID
            listHtml += `
                <div class="interaction-timeline-toggle">
                    <button class="action-btn secondary" onclick="OpportunityInteractions.toggleListExpanded('${containerId}', ${!isExpanded})">
                        ${buttonText}
                    </button>
                </div>
            `;
        }
        historyList.innerHTML = listHtml;
    }

    /**
     * 【新增】公開的輔助函式，用於切換特定列表的展開/收合
     * @param {string} containerId 
     * @param {boolean} expand 
     */
    function toggleListExpanded(containerId, expand) {
        const historyList = _container.querySelector(containerId);
        if (historyList) {
            historyList.classList.toggle('is-expanded', expand);
            // 重新渲染該列表
            _updateTimelineView(); 
        }
    }


    /**
     * 【重構】更新時間軸視圖 (現在會分離資料)
     * (此函式不再接收 isExpanded 參數)
     */
    function _updateTimelineView() {
        if (!_container) return;

        // 1. 將互動紀錄分為兩類
        const discussionInteractions = [];
        const activityLogInteractions = [];

        _interactions.forEach(interaction => {
            // 【關鍵修正】
            // 如果 eventType (應為中文) 包含在「系統類型」陣列中，則歸入系統活動
            if (SYSTEM_GENERATED_TYPES.includes(interaction.eventType)) {
                activityLogInteractions.push(interaction);
            } else {
                // 否則，歸入貼文與討論 (包括 "會議討論", "電話聯繫" 等)
                discussionInteractions.push(interaction);
            }
        });

        // 2. 分別渲染兩個列表
        // 貼文與討論（預設顯示 5 筆）
        _renderTimelineList('#discussion-timeline', discussionInteractions, 5); 
        // 系統活動（預設顯示 3 筆）
        _renderTimelineList('#activity-log-timeline', activityLogInteractions, 3);
    }


    // 處理表單提交 (新增/編輯) - 此函式保持不變
    async function _handleSubmit(event) {
        event.preventDefault();
        if (!_container) return;

        const form = _container.querySelector('#new-interaction-form');
        const rowIndex = form.querySelector('#interaction-edit-rowIndex').value;
        const isEditMode = !!rowIndex;
        
        showLoading(isEditMode ? '正在更新互動紀錄...' : '正在新增互動紀錄...');
        try {
            const interactionData = {
                interactionTime: new Date(form.querySelector('#interaction-time').value).toISOString(),
                eventType: form.querySelector('#interaction-event-type').value, // 這裡會是 "會議討論" (中文)
                contentSummary: form.querySelector('#interaction-summary').value,
                nextAction: form.querySelector('#interaction-next-action').value,
                modifier: getCurrentUser()
            };

            if (_context.opportunityId) {
                interactionData.opportunityId = _context.opportunityId;
            }
            if (_context.companyId) {
                interactionData.companyId = _context.companyId;
            }

            const url = isEditMode ? `/api/interactions/${rowIndex}` : '/api/interactions';
            const method = isEditMode ? 'PUT' : 'POST';
            if (!isEditMode) {
                interactionData.recorder = getCurrentUser();
            }

            // authedFetch 會自動處理成功後的刷新和通知
            const result = await authedFetch(url, { method, body: JSON.stringify(interactionData) });

            if (!result.success) {
                throw new Error(result.details || '操作失敗');
            }
            // 成功後，authedFetch 會自動刷新頁面
            
        } catch (error) {
            if (error.message !== 'Unauthorized') showNotification(`操作失敗: ${error.message}`, 'error');
        } finally {
            hideLoading();
        }
    }
    
    // 動態注入樣式 - 此函式保持不變
    function _injectStyles() {
        const styleId = 'interactions-dynamic-styles';
        if (document.getElementById(styleId)) return;
        
        const style = document.createElement('style');
        style.id = styleId;
        style.innerHTML = `
            .interaction-timeline-toggle {
                text-align: center;
                margin-top: var(--spacing-4);
            }
            .interaction-timeline.is-expanded {
                max-height: none;
                overflow-y: visible;
                mask-image: none;
                -webkit-mask-image: none;
            }
        `;
        document.head.appendChild(style);
    }

    // 公開方法：顯示表單以供編輯 - 此函式保持不變
    function showForEditing(interactionId) {
        if (!_container) return;
        //【修正】確保是從 _interactions (所有資料) 中查找
        const item = _interactions.find(i => i.interactionId === interactionId);
        if (!item) {
            showNotification('找不到該筆互動紀錄資料', 'error');
            return;
        }
        
        const form = _container.querySelector('#new-interaction-form');
        if (!form) return;

        form.querySelector('#interaction-edit-rowIndex').value = item.rowIndex;
        
        const interactionTime = new Date(item.interactionTime);
        interactionTime.setMinutes(interactionTime.getMinutes() - interactionTime.getTimezoneOffset());
        form.querySelector('#interaction-time').value = interactionTime.toISOString().slice(0, 16);
        
        form.querySelector('#interaction-event-type').value = item.eventType;
        form.querySelector('#interaction-summary').value = item.contentSummary;
        form.querySelector('#interaction-next-action').value = item.nextAction;
        
        // --- 【*** 程式碼修改點：鎖定系統欄位 ***】 ---
        const eventTypeSelect = form.querySelector('#interaction-event-type');
        const summaryTextarea = form.querySelector('#interaction-summary');
        const nextActionInput = form.querySelector('#interaction-next-action');
        const submitBtn = form.querySelector('#interaction-submit-btn');
        
        // 檢查是否為「系統事件」或「事件報告」
        const isLockedRecord = ['系統事件', '事件報告'].includes(item.eventType);

        if (isLockedRecord) {
            // 鎖定欄位
            eventTypeSelect.disabled = true;
            summaryTextarea.readOnly = true;
            nextActionInput.readOnly = true;
            
            // 視覺上提示
            eventTypeSelect.style.backgroundColor = 'var(--primary-bg)';
            summaryTextarea.style.backgroundColor = 'var(--primary-bg)';
            nextActionInput.style.backgroundColor = 'var(--primary-bg)';
            submitBtn.textContent = '💾 僅儲存時間變更';
            
        } else {
            // 確保欄位是啟用的 (若上次點擊的是鎖定紀錄)
            eventTypeSelect.disabled = false;
            summaryTextarea.readOnly = false;
            nextActionInput.readOnly = false;
            
            // 恢復視覺
            eventTypeSelect.style.backgroundColor = '';
            summaryTextarea.style.backgroundColor = '';
            nextActionInput.style.backgroundColor = '';
            submitBtn.textContent = '💾 儲存變更';
        }
        // --- 【*** 修改結束 ***】 ---
        
        form.scrollIntoView({ behavior: 'smooth' });
    }

    // 顯示刪除確認對話框 - 此函式已修正
    function confirmDelete(interactionId, rowIndex) {
        if (!_container) return;

        //【修正】確保是從 _interactions (所有資料) 中查找
        const item = _interactions.find(i => i.interactionId === interactionId);
        const summary = item ? (item.contentSummary || '此紀錄').substring(0, 30) + '...' : '此筆紀錄';

        const message = `您確定要永久刪除這筆互動紀錄嗎？\n\n"${summary}"\n\n此操作無法復原。`;

        showConfirmDialog(message, async () => {
            showLoading('正在刪除紀錄...');
            try {
                // authedFetch 會自動處理刷新和通知
                await authedFetch(`/api/interactions/${rowIndex}`, {
                    method: 'DELETE'
                });
            } catch (error) {
                if (error.message !== 'Unauthorized') {
                    console.error('刪除互動紀錄失敗:', error);
                }
            } finally {
                // 【修正】移到 finally 區塊，確保無論成功或失敗都會執行
                hideLoading(); 
            }
        });
    }

    /**
     * 【重構】公開方法：初始化模組
     * @param {HTMLElement} containerElement - 容器元素 (e.g., #tab-content-interactions)
     * @param {object} context - { opportunityId } 或 { companyId }
     * @param {Array<object>} interactions - 所有的互動紀錄
     */
    function init(containerElement, context, interactions) {
        _container = containerElement;
        _context = context;
        _interactions = interactions;
        
        if (!_container) {
            console.error('[Interactions] 初始化失敗：未提供有效的容器元素。');
            return;
        }

        const form = _container.querySelector('#new-interaction-form');
        if (!form) {
            console.error('[Interactions] 初始化失敗：在指定的容器中找不到 #new-interaction-form。');
            return;
        }
        
        // 1. (保持不變) 填入下拉選單
        const eventTypeSelect = form.querySelector('#interaction-event-type');
        if (eventTypeSelect && window.CRM_APP && window.CRM_APP.systemConfig['互動類型']) {
            const interactionTypes = window.CRM_APP.systemConfig['互動類型'];
            eventTypeSelect.innerHTML = '<option value="">請選擇類型...</option>'; 
            
            // --- 【*** 核心錯誤修正 (V2) ***】 ---
            interactionTypes.forEach(type => {
                const note = type.note || type.value; // 安全地取得 note (中文名稱)
                
                // 如果類型不是「系統事件」或「事件報告」，就把它加入下拉選單
                if (!SYSTEM_GENERATED_TYPES.includes(note)) { 
                    // 【關鍵】將 value 和 text 都設置為 note (中文名稱)
                    // 系統設定中的 type.value 儲存的才是中文 (e.g., "會議討論")
                    eventTypeSelect.innerHTML += `<option value="${type.value}">${note}</option>`;
                }
            });
            // --- 【*** 修正結束 ***】 ---
            
            // 如果手動類型只有一種（例如只剩下"會議討論"），預設選中它
            if (eventTypeSelect.options.length === 2) {
                 eventTypeSelect.selectedIndex = 1;
            }
        }

        // 2. (保持不變) 重置表單
        form.reset();
        form.querySelector('#interaction-edit-rowIndex').value = '';
        form.querySelector('#interaction-submit-btn').textContent = '💾 新增紀錄';
        const now = new Date();
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
        form.querySelector('#interaction-time').value = now.toISOString().slice(0, 16);

        // 3. (保持不變) 綁定提交事件
        form.removeEventListener('submit', _handleSubmit);
        form.addEventListener('submit', _handleSubmit);
        
        // 4. 【新增】綁定子頁籤點擊事件
        const tabContainer = _container.querySelector('.sub-tabs');
        if(tabContainer) {
            tabContainer.removeEventListener('click', _handleTabClick);
            tabContainer.addEventListener('click', _handleTabClick);
        }

        // 5. (保持不變) 注入樣式並初始渲染
        _injectStyles();
        _updateTimelineView(); // 呼叫新的分離渲染函式
    }

    // 返回公開的 API
    return {
        init: init,
        showForEditing: showForEditing,
        toggleListExpanded: toggleListExpanded, // 【新增】公開切換函式
        confirmDelete: confirmDelete 
    };
})();