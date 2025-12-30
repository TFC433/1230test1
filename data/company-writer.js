// data/company-writer.js

const BaseWriter = require('./base-writer');

/**
 * 專門負責處理與「公司總表」相關的寫入/更新操作
 */
class CompanyWriter extends BaseWriter {
    /**
     * @param {import('googleapis').google.sheets_v4.Sheets} sheets 
     * @param {import('./company-reader')} companyReader 
     */
    constructor(sheets, companyReader) {
        super(sheets);
        if (!companyReader) {
            throw new Error('CompanyWriter 需要 CompanyReader 的實例');
        }
        this.companyReader = companyReader;
    }

    /**
     * 取得或建立一間公司
     * @param {string} companyName - 公司名稱
     * @param {object} contactInfo - 聯絡人資訊 (用於填充)
     * @param {string} modifier - 操作者
     * @param {object} opportunityData - 機會資料 (用於填充縣市)
     * @returns {Promise<object>}
     */
    async getOrCreateCompany(companyName, contactInfo, modifier, opportunityData) {
        const range = `${this.config.SHEETS.COMPANY_LIST}!A:M`;
        const existingCompany = await this.companyReader.findRowByValue(range, 1, companyName);

        if (existingCompany) {
            console.log(`🏢 [CompanyWriter] 公司已存在: ${companyName}`);
            return {
                id: existingCompany.rowData[0],
                name: existingCompany.rowData[1],
                rowIndex: existingCompany.rowIndex
            };
        }

        const county = opportunityData.county || '';
        console.log(`🏢 [CompanyWriter] 建立新公司: ${companyName} 位於 ${county} by ${modifier}`);
        const now = new Date().toISOString();
        const newCompanyId = `COM${Date.now()}`;
        
        const newRow = [
            newCompanyId, companyName,
            contactInfo.phone || contactInfo.mobile || '',
            contactInfo.address || '',
            now, now, county,
            modifier,
            modifier,
            '', // 公司簡介初始為空
            '', // 公司類型
            '', // 客戶階段
            ''  // 互動評級
        ];

        const response = await this.sheets.spreadsheets.values.append({
            spreadsheetId: this.config.SPREADSHEET_ID,
            range: range,
            valueInputOption: 'USER_ENTERED',
            resource: { values: [newRow] }
        });
        
        this.companyReader.invalidateCache('companyList');

        const updatedRange = response.data.updates.updatedRange;
        const match = updatedRange.match(/!A(\d+)/);
        const newRowIndex = match ? parseInt(match[1]) : null;

        return { id: newCompanyId, name: companyName, rowIndex: newRowIndex };
    }

    /**
     * 更新公司資料
     * @param {string} companyName - (舊)公司名稱，用來尋找列
     * @param {object} updateData - 要更新的資料物件 (若包含 companyName 則表示要改名)
     * @param {string} modifier - 操作者
     * @returns {Promise<object>}
     */
    async updateCompany(companyName, updateData, modifier) {
        console.log(`🏢 [CompanyWriter] 更新公司資料: ${companyName} by ${modifier}`);
        const range = `${this.config.SHEETS.COMPANY_LIST}!A:M`;
        const companyRow = await this.companyReader.findRowByValue(range, 1, companyName);
        if (!companyRow) throw new Error(`找不到公司: ${companyName}`);

        const { rowIndex, rowData: currentRow } = companyRow;
        const now = new Date().toISOString();

        // 【修正】這裡加入了對公司名稱 (Column Index 1) 的更新支援
        if(updateData.companyName !== undefined) currentRow[1] = updateData.companyName;

        if(updateData.phone !== undefined) currentRow[2] = updateData.phone;
        if(updateData.address !== undefined) currentRow[3] = updateData.address;
        if(updateData.county !== undefined) currentRow[6] = updateData.county;
        if(updateData.introduction !== undefined) currentRow[9] = updateData.introduction;
        
        if(updateData.companyType !== undefined) currentRow[10] = updateData.companyType;
        if(updateData.customerStage !== undefined) currentRow[11] = updateData.customerStage;
        if(updateData.engagementRating !== undefined) currentRow[12] = updateData.engagementRating;

        currentRow[5] = now; // 最後更新時間
        currentRow[8] = modifier; // 最後變更者

        await this.sheets.spreadsheets.values.update({
            spreadsheetId: this.config.SPREADSHEET_ID,
            range: `${this.config.SHEETS.COMPANY_LIST}!A${rowIndex}:M${rowIndex}`,
            valueInputOption: 'USER_ENTERED',
            resource: { values: [currentRow] }
        });

        this.companyReader.invalidateCache('companyList');
        console.log('✅ [CompanyWriter] 公司資料更新成功');
        return { success: true };
    }

    /**
     * 刪除一間公司
     * @param {string} companyName - 要刪除的公司名稱
     * @returns {Promise<object>}
     */
    async deleteCompany(companyName) {
        console.log(`🗑️ [CompanyWriter] 準備刪除公司: ${companyName}`);
        const range = `${this.config.SHEETS.COMPANY_LIST}!A:M`;
        
        const companyRow = await this.companyReader.findRowByValue(range, 1, companyName);
        if (!companyRow) {
            throw new Error(`找不到公司: ${companyName}`);
        }

        const { rowIndex } = companyRow;

        await this._deleteRow(
            this.config.SHEETS.COMPANY_LIST,
            rowIndex,
            this.companyReader 
        );

        console.log(`✅ [CompanyWriter] 公司 "${companyName}" (Row: ${rowIndex}) 已被刪除`);
        return { success: true, deletedCompanyId: companyRow.rowData[0] };
    }
}

module.exports = CompanyWriter;