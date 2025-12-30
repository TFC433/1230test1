// data/base-writer.js

const config = require('../config');

/**
 * 所有 Writer 的基礎類別，負責處理通用的寫入和更新輔助功能
 */
class BaseWriter {
    /**
     * @param {import('googleapis').google.sheets_v4.Sheets} sheets - 已認證的 Google Sheets API 實例
     */
    constructor(sheets) {
        if (!sheets) {
            throw new Error('BaseWriter 需要一個已認證的 Sheets API 實例');
        }
        this.sheets = sheets;
        this.config = config;
        this._sheetIdCache = {}; // 用於快取 Sheet ID
    }

    /**
     * 內部輔助函式，根據工作表名稱取得其數字ID (Sheet ID)
     * @param {string} sheetName - 工作表名稱
     * @returns {Promise<number>} - 工作表的數字ID
     * @protected
     */
    async _getSheetIdByName(sheetName) {
        if (this._sheetIdCache[sheetName]) {
            return this._sheetIdCache[sheetName];
        }
        try {
            console.log(` SHeet ID from GSheet...: ${sheetName}`);
            const response = await this.sheets.spreadsheets.get({
                spreadsheetId: this.config.SPREADSHEET_ID,
                fields: 'sheets.properties.title,sheets.properties.sheetId',
            });
            const sheets = response.data.sheets;
            const sheet = sheets.find(s => s.properties.title === sheetName);
            if (sheet) {
                const sheetId = sheet.properties.sheetId;
                this._sheetIdCache[sheetName] = sheetId;
                return sheetId;
            }
            throw new Error(`找不到名稱為 "${sheetName}" 的工作表`);
        } catch (error) {
            console.error(`❌ [BaseWriter] 獲取 Sheet ID 失敗:`, error);
            throw error;
        }
    }

    /**
     * 內部輔助函式，用於刪除指定工作表的某一行
     * @param {string} sheetName - 工作表名稱
     * @param {number} rowIndex - 要刪除的列索引 (1-based)
     * @param {import('./base-reader')} dataReader - 資料讀取模組的實例，用於清除快取
     * @returns {Promise<void>}
     * @protected
     */
    async _deleteRow(sheetName, rowIndex, dataReader) {
        if (!dataReader || !dataReader.invalidateCache) {
            throw new Error('_deleteRow 需要一個有效的 dataReader 實例來清除快取');
        }
        const sheetId = await this._getSheetIdByName(sheetName);
        await this.sheets.spreadsheets.batchUpdate({
            spreadsheetId: this.config.SPREADSHEET_ID,
            resource: {
                requests: [{
                    deleteDimension: {
                        range: {
                            sheetId: sheetId,
                            dimension: 'ROWS',
                            startIndex: rowIndex - 1,
                            endIndex: rowIndex
                        }
                    }
                }]
            }
        });
        
        // 根據工作表名稱清除對應的快取
        const cacheKeyMap = {
            [this.config.SHEETS.OPPORTUNITIES]: 'opportunities',
            [this.config.SHEETS.OPPORTUNITY_CONTACT_LINK]: 'oppContactLinks',
            [this.config.SHEETS.WEEKLY_BUSINESS]: 'weeklyBusiness',
            // 【新增】對應公司列表
            [this.config.SHEETS.COMPANY_LIST]: 'companyList',
            [this.config.SHEETS.EVENT_LOGS_GENERAL]: 'eventLogs',
            [this.config.SHEETS.EVENT_LOGS_IOT]: 'eventLogs',
            [this.config.SHEETS.EVENT_LOGS_DT]: 'eventLogs',
            [this.config.SHEETS.EVENT_LOGS_DX]: 'eventLogs',
            '事件紀錄總表': 'eventLogs' // 確保舊版事件表也能清除快取
        };
        if (cacheKeyMap[sheetName]) {
            // dataReader 可能是 CompanyReader, EventLogReader, OpportunityReader 等
            // 它們都繼承自 BaseReader，共享同一個 cache 物件
            // 所以無論是哪個 reader 實例，呼叫 invalidateCache 都會清除全域快取
            dataReader.invalidateCache(cacheKeyMap[sheetName]);
        }
    }
}

module.exports = BaseWriter;