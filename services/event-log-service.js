// services/event-log-service.js

/**
 * 專門負責處理與「事件紀錄」相關的業務邏輯
 */
class EventLogService {
    /**
     * @param {object} services - 包含所有已初始化服務的容器
     */
    constructor(services) {
        this.eventLogWriter = services.eventLogWriter;
        this.interactionWriter = services.interactionWriter; 
        this.eventLogReader = services.eventLogReader;
        this.interactionReader = services.interactionReader; 
    }

    /**
     * 建立一筆事件紀錄，並自動產生對應的互動紀錄
     * @param {object} eventData 
     * @param {string} creator - 【新增】強制指定的操作者名稱
     * @returns {Promise<object>}
     */
    async createEventLog(eventData, creator) {
        // 【修正】確保建立者是當前登入的使用者，若無則 fallback 到原本的欄位或 '系統'
        const currentOperator = creator || eventData.creator || '系統';
        eventData.creator = currentOperator;
        
        // 新增時，版次預設為 1
        eventData.editCount = 1;

        const result = await this.eventLogWriter.createEventLog(eventData);
        if (!result.success) {
            throw new Error("建立事件紀錄失敗");
        }

        // 建立事件成功後，自動產生一筆對應的互動紀錄
        try {
            console.log(`📝 [EventLogService] 自動建立關聯的互動紀錄 (操作者: ${currentOperator})...`);
            const interactionData = {
                opportunityId: eventData.opportunityId,
                companyId: eventData.companyId,
                interactionTime: result.createdTime,
                eventType: '事件報告',
                eventTitle: eventData.eventName || '建立事件紀錄報告',
                // 建立時的文字維持原樣，或您也可以統一風格
                contentSummary: `已建立事件報告: "${eventData.eventName}". [點此查看報告](event_log_id=${result.eventId})`,
                recorder: currentOperator, // 【修正】使用正確的操作者
                participants: `${eventData.ourParticipants || ''} (我方), ${eventData.clientParticipants || ''} (客戶方)`
            };
            await this.interactionWriter.createInteraction(interactionData);
            console.log('✅ [EventLogService] 已成功建立關聯的互動紀錄');
        } catch (interactionError) {
            console.warn('⚠️ [EventLogService] 建立關聯的互動紀錄失敗:', interactionError);
        }
        
        return result;
    }

    /**
     * 更新一筆事件紀錄 (含合併邏輯)
     * @param {string} eventId 
     * @param {object} eventData 
     * @param {string} modifier 
     * @returns {Promise<object>}
     */
    async updateEventLog(eventId, eventData, modifier) {
        // 1. 先讀取目前的事件，獲取舊版次
        const currentEvent = await this.eventLogReader.getEventLogById(eventId);
        if (!currentEvent) throw new Error(`找不到事件 ${eventId}`);

        // 2. 計算新版次
        const currentCount = parseInt(currentEvent.editCount || 0);
        const newEditCount = currentCount + 1;
        eventData.editCount = newEditCount;

        // 3. 執行更新 (寫入 Google Sheets)
        const result = await this.eventLogWriter.updateEventLog(eventId, eventData, modifier);
        if (!result.success) {
            throw new Error("更新事件紀錄失敗");
        }

        // 檢查是否發生了類型遷移
        const finalEventId = result.migrated ? result.newEventId : eventId;
        
        if (result.migrated) {
            console.log(`🔀 [EventLogService] 偵測到類型遷移，ID 已變更: ${eventId} -> ${finalEventId}`);
        }

        // 4. 處理互動紀錄 (防洗版邏輯)
        try {
            // 取得所有互動紀錄
            const allInteractions = await this.interactionReader.getInteractions();
            const MERGE_THRESHOLD_MS = 12 * 60 * 60 * 1000; // 12 小時
            const now = Date.now();

            // 尋找符合合併條件的「最新」一筆紀錄
            const lastLog = allInteractions.find(i => {
                const isSameContext = (i.opportunityId && i.opportunityId === currentEvent.opportunityId) || 
                                      (i.companyId && i.companyId === currentEvent.companyId);
                const isUpdateType = i.eventType === '系統事件' && i.eventTitle === '更新事件報告';
                // 使用舊 ID 進行比對，確保能找到原始紀錄
                const hasEventId = i.contentSummary && i.contentSummary.includes(`event_log_id=${eventId}`);
                
                return isSameContext && isUpdateType && hasEventId;
            });

            let shouldMerge = false;
            if (lastLog) {
                const lastTime = new Date(lastLog.interactionTime || lastLog.createdTime).getTime();
                if ((now - lastTime) < MERGE_THRESHOLD_MS) {
                    shouldMerge = true;
                }
            }

            // 【修改點】更簡潔的動態文字格式
            const newSummary = `更新: "${eventData.eventName || currentEvent.eventName}". (edited ${newEditCount}) [點此查看報告](event_log_id=${finalEventId})`;

            if (shouldMerge) {
                console.log(`🔄 [EventLogService] 發現 12 小時內的更新紀錄 (ID: ${lastLog.interactionId})，執行合併...`);
                // 更新舊紀錄的時間與內容
                await this.interactionWriter.updateInteraction(lastLog.rowIndex, {
                    interactionTime: new Date().toISOString(),
                    contentSummary: newSummary
                }, modifier);
                console.log('✅ [EventLogService] 互動紀錄合併完成');
            } else {
                console.log('📝 [EventLogService] 無近期紀錄或超過 12 小時，新增一筆互動紀錄...');
                const interactionData = {
                    opportunityId: currentEvent.opportunityId,
                    companyId: currentEvent.companyId,
                    eventType: '系統事件',
                    eventTitle: '更新事件報告',
                    contentSummary: newSummary,
                    recorder: modifier,
                };
                await this.interactionWriter.createInteraction(interactionData);
                console.log('✅ [EventLogService] 新增互動紀錄完成');
            }

        } catch (interactionError) {
            console.warn('⚠️ [EventLogService] 處理互動紀錄 (合併/新增) 失敗:', interactionError);
        }
        
        return result;
    }

    /**
     * 刪除一筆事件紀錄，並自動產生對應的互動紀錄
     * @param {string} eventId 
     * @param {string} modifier 
     * @returns {Promise<object>}
     */
    async deleteEventLog(eventId, modifier) {
        // 1. 先獲取事件資料
        const eventLog = await this.eventLogReader.getEventLogById(eventId);
        if (!eventLog) {
            throw new Error(`刪除失敗：找不到 Event ID ${eventId}`);
        }
        
        // 2. 執行刪除
        const result = await this.eventLogWriter.deleteEventLog(eventId, modifier);
        if (!result.success) {
            throw new Error("刪除事件紀錄失敗");
        }

        // 3. 刪除成功後，產生一筆互動紀錄
        try {
            console.log('📝 [EventLogService] 自動建立事件刪除的互動紀錄...');
            const interactionData = {
                opportunityId: eventLog.opportunityId,
                companyId: eventLog.companyId,
                eventType: '系統事件',
                eventTitle: '刪除事件報告',
                contentSummary: `事件報告 "${eventLog.eventName}" 已被 ${modifier} 刪除。`,
                recorder: modifier,
            };
            await this.interactionWriter.createInteraction(interactionData);
            console.log('✅ [EventLogService] 已成功建立事件刪除的互動紀錄');
        } catch (interactionError) {
            console.warn('⚠️ [EventLogService] 建立事件刪除的互動紀錄失敗:', interactionError);
        }
        
        return result;
    }
}

module.exports = EventLogService;