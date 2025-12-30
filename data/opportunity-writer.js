// data/opportunity-writer.js

const BaseWriter = require('./base-writer');

/**
 * 專門負責處理與「機會案件」及「關聯」相關的寫入/更新操作
 * 【重構】支援動態標題對映
 * 【更新】支援更新建立日期 (Created Time)
 */
class OpportunityWriter extends BaseWriter {
    /**
     * @param {import('googleapis').google.sheets_v4.Sheets} sheets 
     * @param {import('./opportunity-reader')} opportunityReader 
     * @param {import('./contact-reader')} contactReader 
     */
    constructor(sheets, opportunityReader, contactReader) {
        super(sheets);
        if (!opportunityReader || !contactReader) {
            throw new Error('OpportunityWriter 需要 OpportunityReader 和 ContactReader 的實例');
        }
        this.opportunityReader = opportunityReader;
        this.contactReader = contactReader;
    }

    async _getHeaderMapAndRow(rowIndex) {
        const headerRange = `${this.config.SHEETS.OPPORTUNITIES}!A1:ZZ1`;
        const dataRange = `${this.config.SHEETS.OPPORTUNITIES}!A${rowIndex}:ZZ${rowIndex}`;
        
        const response = await this.sheets.spreadsheets.values.batchGet({
            spreadsheetId: this.config.SPREADSHEET_ID,
            ranges: [headerRange, dataRange]
        });

        const headerValues = response.data.valueRanges[0].values ? response.data.valueRanges[0].values[0] : [];
        const rowValues = response.data.valueRanges[1].values ? response.data.valueRanges[1].values[0] : [];

        if (headerValues.length === 0) throw new Error('找不到標題列');
        
        const map = {};
        headerValues.forEach((title, index) => {
            if(title) map[title.trim()] = index;
        });

        return { map, currentRow: rowValues, headerLength: headerValues.length };
    }

    async updateOpportunity(rowIndex, updateData, modifier) {
        if (isNaN(parseInt(rowIndex)) || rowIndex <= 1) throw new Error(`無效的 rowIndex: ${rowIndex}`);
        console.log(`📝 [OpportunityWriter] 更新機會案件 (動態欄位) - Row: ${rowIndex} by ${modifier}`);
        
        const now = new Date().toISOString();
        const FIELD_NAMES = this.config.OPPORTUNITY_FIELD_NAMES;

        const { map, currentRow, headerLength } = await this._getHeaderMapAndRow(rowIndex);
        if (currentRow.length === 0) throw new Error(`在 ${rowIndex} 列找不到資料`);

        while (currentRow.length < headerLength) {
            currentRow.push('');
        }

        const setValue = (fieldName, value) => {
            const index = map[fieldName];
            if (index !== undefined && index >= 0) {
                currentRow[index] = value;
            } else {
                console.warn(`⚠️ [OpportunityWriter] 警告: 找不到欄位標題 "${fieldName}"，更新略過。`);
            }
        };

        if(updateData.opportunityName !== undefined) setValue(FIELD_NAMES.NAME, updateData.opportunityName);
        if(updateData.customerCompany !== undefined) setValue(FIELD_NAMES.CUSTOMER, updateData.customerCompany);
        if(updateData.mainContact !== undefined) setValue(FIELD_NAMES.CONTACT, updateData.mainContact);
        
        if(updateData.assignee !== undefined) setValue(FIELD_NAMES.ASSIGNEE, updateData.assignee);
        if(updateData.opportunityType !== undefined) setValue(FIELD_NAMES.TYPE, updateData.opportunityType);
        if(updateData.opportunitySource !== undefined) setValue(FIELD_NAMES.SOURCE, updateData.opportunitySource);
        if(updateData.currentStage !== undefined) setValue(FIELD_NAMES.STAGE, updateData.currentStage);
        if(updateData.expectedCloseDate !== undefined) setValue(FIELD_NAMES.CLOSE_DATE, updateData.expectedCloseDate);
        if(updateData.opportunityValue !== undefined) setValue(FIELD_NAMES.VALUE, updateData.opportunityValue);
        if(updateData.currentStatus !== undefined) setValue(FIELD_NAMES.STATUS, updateData.currentStatus);
        if(updateData.notes !== undefined) setValue(FIELD_NAMES.NOTES, updateData.notes);
        
        if(updateData.stageHistory !== undefined) setValue(FIELD_NAMES.HISTORY, updateData.stageHistory);
        if(updateData.parentOpportunityId !== undefined) setValue(FIELD_NAMES.PARENT_ID, updateData.parentOpportunityId);
        
        if(updateData.orderProbability !== undefined) setValue(FIELD_NAMES.PROBABILITY, updateData.orderProbability);
        if(updateData.potentialSpecification !== undefined) setValue(FIELD_NAMES.PRODUCT_SPEC, updateData.potentialSpecification); 
        
        if(updateData.salesChannel !== undefined) setValue(FIELD_NAMES.CHANNEL, updateData.salesChannel);
        
        if(updateData.deviceScale !== undefined) setValue(FIELD_NAMES.DEVICE_SCALE, updateData.deviceScale);
        if(updateData.opportunityValueType !== undefined) setValue(FIELD_NAMES.VALUE_TYPE, updateData.opportunityValueType);

        if(updateData.salesModel !== undefined) setValue(FIELD_NAMES.SALES_MODEL, updateData.salesModel);
        if(updateData.channelDetails !== undefined) setValue(FIELD_NAMES.CHANNEL, updateData.channelDetails);
        if(updateData.channelContact !== undefined) setValue(FIELD_NAMES.CHANNEL_CONTACT, updateData.channelContact);

        if(updateData.createdTime !== undefined) setValue(FIELD_NAMES.CREATED_TIME, updateData.createdTime);

        setValue(FIELD_NAMES.LAST_UPDATE_TIME, now);
        setValue(FIELD_NAMES.LAST_MODIFIER, modifier);
        
        const range = `${this.config.SHEETS.OPPORTUNITIES}!A${rowIndex}:ZZ${rowIndex}`;
        
        await this.sheets.spreadsheets.values.update({
            spreadsheetId: this.config.SPREADSHEET_ID,
            range: range,
            valueInputOption: 'USER_ENTERED',
            resource: { values: [currentRow] }
        });

        this.opportunityReader.invalidateCache('opportunities');
        console.log('✅ [OpportunityWriter] 機會案件更新成功');

        return { success: true, data: { rowIndex, ...updateData } };
    }

    async batchUpdateOpportunities(updates) {
        console.log('📝 [OpportunityWriter] 執行高效批量更新機會案件...');
        const FIELD_NAMES = this.config.OPPORTUNITY_FIELD_NAMES;
        
        const headerRange = `${this.config.SHEETS.OPPORTUNITIES}!A1:ZZ1`;
        const headerResponse = await this.sheets.spreadsheets.values.get({
            spreadsheetId: this.config.SPREADSHEET_ID, range: headerRange
        });
        const headerValues = headerResponse.data.values ? headerResponse.data.values[0] : [];
        const map = {};
        headerValues.forEach((title, index) => { if(title) map[title.trim()] = index; });

        const now = new Date().toISOString();

        const data = await Promise.all(updates.map(async (update) => {
            const range = `${this.config.SHEETS.OPPORTUNITIES}!A${update.rowIndex}:ZZ${update.rowIndex}`;
            const response = await this.sheets.spreadsheets.values.get({ spreadsheetId: this.config.SPREADSHEET_ID, range });
            const currentRow = response.data.values ? response.data.values[0] : [];
            
            if (currentRow.length === 0) return null;
            while (currentRow.length < headerValues.length) currentRow.push('');

            const { data: updateData, modifier } = update;
            
            const setVal = (key, val) => {
                const idx = map[key];
                if (idx !== undefined && idx >= 0) currentRow[idx] = val;
            };

            // 【修改】擴充支援的批量更新欄位
            if (updateData.currentStage !== undefined) setVal(FIELD_NAMES.STAGE, updateData.currentStage);
            if (updateData.stageHistory !== undefined) setVal(FIELD_NAMES.HISTORY, updateData.stageHistory);
            // 支援更新客戶名稱 (for cascade update)
            if (updateData.customerCompany !== undefined) setVal(FIELD_NAMES.CUSTOMER, updateData.customerCompany);

            setVal(FIELD_NAMES.LAST_UPDATE_TIME, now);
            setVal(FIELD_NAMES.LAST_MODIFIER, modifier);
            
            return { range, values: [currentRow] };
        }));

        const validData = data.filter(d => d !== null);
        if (validData.length === 0) {
            return { success: true, successCount: 0, failCount: updates.length };
        }

        await this.sheets.spreadsheets.values.batchUpdate({
            spreadsheetId: this.config.SPREADSHEET_ID,
            resource: {
                valueInputOption: 'USER_ENTERED',
                data: validData
            }
        });

        this.opportunityReader.invalidateCache('opportunities');
        console.log(`✅ [OpportunityWriter] 批量更新完成`);
        return { success: true, successCount: validData.length, failCount: updates.length - validData.length };
    }
    
    async deleteOpportunity(rowIndex, modifier) {
        if (isNaN(parseInt(rowIndex)) || rowIndex <= 1) throw new Error(`無效的 rowIndex: ${rowIndex}`);
        console.log(`🗑️ [OpportunityWriter] 刪除機會案件 - Row: ${rowIndex} by ${modifier}`);
        
        await this._deleteRow(this.config.SHEETS.OPPORTUNITIES, rowIndex, this.opportunityReader);
        
        console.log('✅ [OpportunityWriter] 機會案件刪除成功');
        return { success: true };
    }

    async linkContactToOpportunity(opportunityId, contactId, modifier) {
        console.log(`🔗 [OpportunityWriter] 建立關聯: 機會 ${opportunityId} <-> 聯絡人 ${contactId}`);
        const now = new Date().toISOString();
        const linkId = `LNK${Date.now()}`;
        
        const rowData = [linkId, opportunityId, contactId, now, 'active', modifier];
        
        await this.sheets.spreadsheets.values.append({
            spreadsheetId: this.config.SPREADSHEET_ID,
            range: `${this.config.SHEETS.OPPORTUNITY_CONTACT_LINK}!A:F`,
            valueInputOption: 'USER_ENTERED',
            resource: { values: [rowData] }
        });
        
        this.contactReader.invalidateCache('oppContactLinks');
        return { success: true, linkId: linkId };
    }

    async deleteContactLink(opportunityId, contactId) {
        console.log(`🗑️ [OpportunityWriter] 永久刪除關聯: 機會 ${opportunityId} <-> 聯絡人 ${contactId}`);
        const range = `${this.config.SHEETS.OPPORTUNITY_CONTACT_LINK}!A:F`;
        
        const allLinks = await this.contactReader.getAllOppContactLinks();
        const linkRowsResponse = await this.sheets.spreadsheets.values.get({
            spreadsheetId: this.config.SPREADSHEET_ID,
            range: range,
        });

        const rows = linkRowsResponse.data.values || [];
        for (let i = 1; i < rows.length; i++) { 
            const rowOppId = rows[i][this.config.OPP_CONTACT_LINK_FIELDS.OPPORTUNITY_ID];
            const rowContactId = rows[i][this.config.OPP_CONTACT_LINK_FIELDS.CONTACT_ID];
            
            if (rowOppId === opportunityId && rowContactId === contactId) {
                const rowIndexToDelete = i + 1;
                await this._deleteRow(this.config.SHEETS.OPPORTUNITY_CONTACT_LINK, rowIndexToDelete, this.contactReader);
                return { success: true, rowIndex: rowIndexToDelete };
            }
        }
        throw new Error('找不到對應的關聯紀錄');
    }
}

module.exports = OpportunityWriter;