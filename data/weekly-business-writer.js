// data/weekly-business-writer.js

const BaseWriter = require('./base-writer');

class WeeklyBusinessWriter extends BaseWriter {
    /**
     * @param {import('googleapis').google.sheets_v4.Sheets} sheets 
     * @param {import('./weekly-business-reader')} weeklyBusinessReader 
     */
    constructor(sheets, weeklyBusinessReader) {
        super(sheets);
        if (!weeklyBusinessReader) {
            throw new Error('WeeklyBusinessWriter 需要 WeeklyBusinessReader 的實例');
        }
        this.weeklyBusinessReader = weeklyBusinessReader;
    }

    async createWeeklyBusinessEntry(data) {
        console.log('📝 [WeeklyBusinessWriter] 建立週間業務紀錄...');
        const now = new Date().toISOString();
        const recordId = `WB-${Date.now()}`;
        const newRow = [
            data.date, data.weekId, data.category, data.topic,
            data.participants, data.summary, data.actionItems,
            now, now, data.creator, recordId
        ];
        
        const response = await this.sheets.spreadsheets.values.append({
            spreadsheetId: this.config.SPREADSHEET_ID,
            range: `${this.config.SHEETS.WEEKLY_BUSINESS}!A:K`,
            valueInputOption: 'USER_ENTERED',
            resource: { values: [newRow] }
        });
        
        const updatedRange = response.data.updates.updatedRange;
        const match = updatedRange.match(/!A(\d+)/);
        const newRowIndex = match ? parseInt(match[1]) : null;

        this.weeklyBusinessReader.invalidateCache('weeklyBusiness');
        return { success: true, recordId: recordId, rowIndex: newRowIndex };
    }

    async updateWeeklyBusinessEntry(recordId, data) {
        const rowIndex = data.rowIndex;
        if (!rowIndex || isNaN(parseInt(rowIndex)) || rowIndex <= 1) {
            throw new Error(`更新週間業務紀錄需要一個有效的 rowIndex，但收到: ${rowIndex}`);
        }
        console.log(`📝 [WeeklyBusinessWriter] 更新週間業務紀錄 - Row: ${rowIndex}`);

        const range = `${this.config.SHEETS.WEEKLY_BUSINESS}!A${rowIndex}:K${rowIndex}`;
        
        const getResponse = await this.sheets.spreadsheets.values.get({
            spreadsheetId: this.config.SPREADSHEET_ID,
            range: range,
        });
        const currentRow = getResponse.data.values ? getResponse.data.values[0] : [];
        const createdTime = currentRow[7] || new Date().toISOString();
        const now = new Date().toISOString();

        const updatedRow = [
            data.date, data.weekId, data.category, data.topic,
            data.participants, data.summary, data.actionItems,
            createdTime, now, data.creator, recordId
        ];

        await this.sheets.spreadsheets.values.update({
            spreadsheetId: this.config.SPREADSHEET_ID,
            range: range,
            valueInputOption: 'USER_ENTERED',
            resource: { values: [updatedRow] }
        });
        
        this.weeklyBusinessReader.invalidateCache('weeklyBusiness');
        return { success: true };
    }

    async deleteWeeklyBusinessEntry(recordId, rowIndex) {
        if (!rowIndex || isNaN(parseInt(rowIndex)) || rowIndex <= 1) {
            throw new Error(`刪除週間業務紀錄需要一個有效的 rowIndex，但收到: ${rowIndex}`);
        }
        console.log(`🗑️ [WeeklyBusinessWriter] 刪除週間業務紀錄 - Row: ${rowIndex}`);
        await this._deleteRow(this.config.SHEETS.WEEKLY_BUSINESS, rowIndex, this.weeklyBusinessReader);
        return { success: true };
    }
}

module.exports = WeeklyBusinessWriter;