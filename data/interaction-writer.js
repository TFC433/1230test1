// data/interaction-writer.js

const BaseWriter = require('./base-writer');

class InteractionWriter extends BaseWriter {
    /**
     * @param {import('googleapis').google.sheets_v4.Sheets} sheets 
     * @param {import('./interaction-reader')} interactionReader 
     * @param {import('./opportunity-reader')} opportunityReader 
     */
    constructor(sheets, interactionReader, opportunityReader) {
        super(sheets);
        if (!interactionReader) {
            throw new Error('InteractionWriter 需要 InteractionReader 的實例');
        }
        if (!opportunityReader) {
            throw new Error('InteractionWriter 需要 OpportunityReader 的實例');
        }
        this.interactionReader = interactionReader;
        this.opportunityReader = opportunityReader;
    }

    async createInteraction(interactionData) {
        console.log('📝 [InteractionWriter] 建立互動記錄...');
        const now = new Date().toISOString();
        const interactionId = `INT${Date.now()}`;
        
        const rowData = [
            interactionId, interactionData.opportunityId || '',
            interactionData.interactionTime || now, interactionData.eventType || '',
            interactionData.eventTitle || '', interactionData.contentSummary || '',
            interactionData.participants || '', interactionData.nextAction || '',
            interactionData.attachmentLink || '', interactionData.calendarEventId || '',
            interactionData.recorder || '', now,
            interactionData.companyId || ''
        ];
        
        await this.sheets.spreadsheets.values.append({
            spreadsheetId: this.config.SPREADSHEET_ID,
            range: `${this.config.SHEETS.INTERACTIONS}!A:M`,
            valueInputOption: 'USER_ENTERED',
            resource: { values: [rowData] }
        });
        
        this.interactionReader.invalidateCache('interactions');
        this.opportunityReader.invalidateCache('opportunities');

        console.log('✅ [InteractionWriter] 互動記錄建立成功:', interactionId);
        return { success: true, interactionId, data: rowData };
    }

    async updateInteraction(rowIndex, updateData, modifier) {
        if (isNaN(parseInt(rowIndex)) || rowIndex <= 1) throw new Error(`無效的 rowIndex: ${rowIndex}`);
        console.log(`📝 [InteractionWriter] 更新互動紀錄 - Row: ${rowIndex} by ${modifier}`);
        const range = `${this.config.SHEETS.INTERACTIONS}!A${rowIndex}:M${rowIndex}`;

        const response = await this.sheets.spreadsheets.values.get({
            spreadsheetId: this.config.SPREADSHEET_ID, range: range,
        });

        const currentRow = response.data.values ? response.data.values[0] : [];
        if(currentRow.length === 0) throw new Error(`在 ${rowIndex} 列找不到互動紀錄`);

        // --- 【安全鎖定邏輯修正】 ---
        const eventType = currentRow[3] || ''; 
        const isLockedRecord = ['系統事件', '事件報告'].includes(eventType);

        // 1. 基礎欄位：時間與修改者 (總是允許)
        if(updateData.interactionTime !== undefined) currentRow[2] = updateData.interactionTime;
        currentRow[10] = modifier;

        // 2. 根據鎖定狀態決定開放哪些欄位
        if (!isLockedRecord) {
            // [一般紀錄]：全開放
            if(updateData.eventType !== undefined) currentRow[3] = updateData.eventType;
            if(updateData.contentSummary !== undefined) currentRow[5] = updateData.contentSummary;
            if(updateData.nextAction !== undefined) currentRow[7] = updateData.nextAction;
        } else {
            // [系統紀錄]：
            // 鎖定：eventType (不能把系統事件改成會議)
            // 解鎖：contentSummary (為了讓系統能更新 "修訂第 N 次" 的文字)
            
            if(updateData.contentSummary !== undefined) {
                console.log(`[InteractionWriter] 系統紀錄更新內容摘要 (允許更新版次說明)`);
                currentRow[5] = updateData.contentSummary;
            }
            
            if(updateData.eventType !== undefined || updateData.nextAction !== undefined) {
                console.warn(`[InteractionWriter] 試圖修改系統紀錄的鎖定欄位 (Type/NextAction)，已忽略。`);
            }
        }
        // --- 【修正結束】 ---

        await this.sheets.spreadsheets.values.update({
            spreadsheetId: this.config.SPREADSHEET_ID, range: range,
            valueInputOption: 'USER_ENTERED',
            resource: { values: [currentRow] }
        });

        this.interactionReader.invalidateCache('interactions');
        this.opportunityReader.invalidateCache('opportunities');
        
        console.log('✅ [InteractionWriter] 互動紀錄更新成功');
        return { success: true };
    }

    async deleteInteraction(rowIndex) {
        if (isNaN(parseInt(rowIndex)) || rowIndex <= 1) {
            throw new Error(`無效的 rowIndex: ${rowIndex}`);
        }
        console.log(`🗑️ [InteractionWriter] 刪除互動紀錄 - Row: ${rowIndex}`);

        await this._deleteRow(
            this.config.SHEETS.INTERACTIONS, 
            rowIndex, 
            this.interactionReader
        );
        
        this.interactionReader.invalidateCache('interactions');
        this.opportunityReader.invalidateCache('opportunities');

        console.log('✅ [InteractionWriter] 互動紀錄刪除成功');
        return { success: true };
    }
}

module.exports = InteractionWriter;