// data/system-writer.js
const BaseWriter = require('./base-writer');
const config = require('../config');

class SystemWriter extends BaseWriter {
    constructor(sheets) {
        super(sheets);
    }

    /**
     * 更新使用者密碼
     * @param {number} rowIndex - 該使用者在 Sheet 中的行號 (1-based)
     * @param {string} newHash - 加密後的新密碼 Hash
     */
    async updatePassword(rowIndex, newHash) {
        // 優先使用權限專用表 ID，若無則使用預設 ID
        const targetSheetId = config.AUTH_SPREADSHEET_ID || config.SPREADSHEET_ID;
        
        // 密碼位於 B 欄 (第二欄)
        const range = `使用者名冊!B${rowIndex}`;

        console.log(`🔐 [SystemWriter Debug] 開始執行 updatePassword`);
        console.log(`   - Row Index: ${rowIndex}`);
        console.log(`   - Target Range: ${range}`);
        console.log(`   - Target Sheet ID: ${targetSheetId} (Length: ${targetSheetId ? targetSheetId.length : 0})`);

        try {
            const response = await this.sheets.spreadsheets.values.update({
                spreadsheetId: targetSheetId,
                range: range,
                valueInputOption: 'RAW',
                resource: {
                    values: [[newHash]]
                }
            });

            console.log(`✅ [SystemWriter Debug] Google API 回應成功:`, response.data);
            return true;
        } catch (error) {
            console.error('❌ [SystemWriter Debug] Google API 呼叫失敗:', error.message);
            if (error.response) {
                console.error('   - Error Details:', JSON.stringify(error.response.data));
            }
            throw error;
        }
    }
}

module.exports = SystemWriter;