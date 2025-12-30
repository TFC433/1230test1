// data/system-writer.js
const BaseWriter = require('./base-writer');
const config = require('../config');

class SystemWriter extends BaseWriter {
    constructor(sheets) {
        super(sheets);
    }

    async updatePassword(rowIndex, newHash) {
        const targetSheetId = config.AUTH_SPREADSHEET_ID || config.SPREADSHEET_ID;
        const range = `使用者名冊!B${rowIndex}`;
        try {
            await this.sheets.spreadsheets.values.update({
                spreadsheetId: targetSheetId, range, valueInputOption: 'RAW',
                resource: { values: [[newHash]] }
            });
            return true;
        } catch (error) {
            console.error('❌ [SystemWriter] 更新密碼失敗:', error.message);
            throw error;
        }
    }

    // ★★★ 新增：更新系統偏好設定 (用於存分類順序) ★★★
    async updateSystemPref(key, value) {
        const sheetId = config.SPREADSHEET_ID;
        const sheetName = config.SHEETS.SYSTEM_CONFIG;

        // 1. 先讀取整張表找出 Key 在哪一行
        const readRes = await this.sheets.spreadsheets.values.get({
            spreadsheetId: sheetId,
            range: `${sheetName}!A:B` // 假設 A欄=Type, B欄=Item
        });
        
        const rows = readRes.data.values || [];
        let targetRowIndex = -1;

        // 尋找 Type='SystemPref' 且 Item=key 的行
        for (let i = 0; i < rows.length; i++) {
            if (rows[i][0] === 'SystemPref' && rows[i][1] === key) {
                targetRowIndex = i + 1; // 1-based index
                break;
            }
        }

        // 2. 準備寫入資料: [Type, Item, Order, Enabled, Note(存放Value)]
        // 對應 SYSTEM_CONFIG_FIELDS: 類型(A), 項目(B), 順序(C), 啟用(D), 備註(E)
        const rowData = ['SystemPref', key, '0', 'TRUE', value];

        if (targetRowIndex !== -1) {
            // 更新現有行 (只更新 Note 欄位 E)
            await this.sheets.spreadsheets.values.update({
                spreadsheetId: sheetId,
                range: `${sheetName}!E${targetRowIndex}`,
                valueInputOption: 'RAW',
                resource: { values: [[value]] }
            });
        } else {
            // 新增一行
            await this.sheets.spreadsheets.values.append({
                spreadsheetId: sheetId,
                range: `${sheetName}!A:E`,
                valueInputOption: 'RAW',
                insertDataOption: 'INSERT_ROWS',
                resource: { values: [rowData] }
            });
        }
        return true;
    }
}

module.exports = SystemWriter;