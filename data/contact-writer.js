// data/contact-writer.js

const BaseWriter = require('./base-writer');

/**
 * 專門負責處理與「聯絡人」相關的寫入/更新操作
 */
class ContactWriter extends BaseWriter {
    /**
     * @param {import('googleapis').google.sheets_v4.Sheets} sheets 
     * @param {import('./contact-reader')} contactReader 
     */
    constructor(sheets, contactReader) {
        super(sheets);
        if (!contactReader) {
            throw new Error('ContactWriter 需要 ContactReader 的實例');
        }
        this.contactReader = contactReader;
    }

    // ... (保留 getOrCreateContact, updateContact, updateContactStatus 方法，不需更動) ...
    // 請保留原檔案內容，並在最後新增 updateRawContact 方法

    /**
     * 取得或建立一位聯絡人
     */
    async getOrCreateContact(contactInfo, companyData, modifier) {
        const allContacts = await this.contactReader.getContactList();
        const existingContact = allContacts.find(c => c.name === contactInfo.name && c.companyId === companyData.id);
        
        if (existingContact) {
             console.log(`👤 [ContactWriter] 聯絡人已存在: ${contactInfo.name}`);
             return { id: existingContact.contactId, name: existingContact.name };
        }

        console.log(`👤 [ContactWriter] 建立新聯絡人: ${contactInfo.name} by ${modifier}`);
        const now = new Date().toISOString();
        const newContactId = `CON${Date.now()}`;
        const newRow = [
            newContactId,
            contactInfo.rowIndex ? `BC-${contactInfo.rowIndex}` : 'MANUAL',
            contactInfo.name || '',
            companyData.id,
            contactInfo.department || '', contactInfo.position || '',
            contactInfo.mobile || '', contactInfo.phone || '',
            contactInfo.email || '',
            now, now,
            modifier, modifier
        ];
        
        await this.sheets.spreadsheets.values.append({
            spreadsheetId: this.config.SPREADSHEET_ID,
            range: `${this.config.SHEETS.CONTACT_LIST}!A:M`,
            valueInputOption: 'USER_ENTERED',
            resource: { values: [newRow] }
        });

        this.contactReader.invalidateCache('contactList');
        return { id: newContactId, name: contactInfo.name };
    }

    /**
     * 更新已建檔聯絡人資料
     */
    async updateContact(contactId, updateData, modifier) {
        console.log(`👤 [ContactWriter] 更新聯絡人資料: ${contactId} by ${modifier}`);
        const range = `${this.config.SHEETS.CONTACT_LIST}!A:M`;
        const contactRow = await this.contactReader.findRowByValue(range, 0, contactId);
        if (!contactRow) throw new Error(`找不到聯絡人ID: ${contactId}`);

        const { rowIndex, rowData: currentRow } = contactRow;
        const now = new Date().toISOString();
        
        if(updateData.sourceId !== undefined) currentRow[1] = updateData.sourceId;
        if(updateData.name !== undefined) currentRow[2] = updateData.name;
        if(updateData.companyId !== undefined) currentRow[3] = updateData.companyId;
        if(updateData.department !== undefined) currentRow[4] = updateData.department;
        if(updateData.position !== undefined) currentRow[5] = updateData.position;
        if(updateData.mobile !== undefined) currentRow[6] = updateData.mobile;
        if(updateData.phone !== undefined) currentRow[7] = updateData.phone;
        if(updateData.email !== undefined) currentRow[8] = updateData.email;
        
        currentRow[10] = now; 
        currentRow[12] = modifier; 
        
        await this.sheets.spreadsheets.values.update({
            spreadsheetId: this.config.SPREADSHEET_ID,
            range: `${this.config.SHEETS.CONTACT_LIST}!A${rowIndex}:M${rowIndex}`,
            valueInputOption: 'USER_ENTERED',
            resource: { values: [currentRow] }
        });

        this.contactReader.invalidateCache('contactList');
        console.log('✅ [ContactWriter] 聯絡人資料更新成功');
        return { success: true };
    }

    /**
     * 更新潛在客戶的狀態欄位
     */
    async updateContactStatus(rowIndex, status) {
        if (isNaN(parseInt(rowIndex)) || rowIndex <= 1) throw new Error(`無效的 rowIndex: ${rowIndex}`);
        
        const range = `${this.config.SHEETS.CONTACTS}!Y${rowIndex}`;
        console.log(`📝 [ContactWriter] 更新潛在客戶狀態 - Row: ${rowIndex} -> ${status}`);
        
        await this.sheets.spreadsheets.values.update({
            spreadsheetId: this.config.SPREADSHEET_ID,
            range: range,
            valueInputOption: 'USER_ENTERED',
            resource: { values: [[status]] }
        });
        
        this.contactReader.invalidateCache('contacts');
        return { success: true };
    }

    /**
     * 【新增】更新原始名片資料 (用於 LIFF 簡易編輯)
     * @param {number} rowIndex - 原始名片資料的列索引 (1-based)
     * @param {object} updateData - 要更新的欄位 { name, company, position, mobile, email }
     * @param {string} modifier - 修改者 (LINE 暱稱)
     */
    async updateRawContact(rowIndex, updateData, modifier) {
        if (isNaN(parseInt(rowIndex)) || rowIndex <= 1) throw new Error(`無效的 rowIndex: ${rowIndex}`);
        
        console.log(`📝 [ContactWriter] LIFF 更新原始名片 - Row: ${rowIndex} by ${modifier}`);
        
        // 讀取整列資料以確保不覆蓋其他未修改的欄位
        const range = `${this.config.SHEETS.CONTACTS}!A${rowIndex}:Y${rowIndex}`;
        
        const response = await this.sheets.spreadsheets.values.get({
            spreadsheetId: this.config.SPREADSHEET_ID,
            range: range,
        });

        const currentRow = response.data.values ? response.data.values[0] : [];
        if (currentRow.length === 0) throw new Error(`在 "原始名片資料" Row ${rowIndex} 找不到資料`);

        const F = this.config.CONTACT_FIELDS;

        // 更新對應欄位 (如果 updateData 有提供)
        if (updateData.name !== undefined) currentRow[F.NAME] = updateData.name;
        if (updateData.company !== undefined) currentRow[F.COMPANY] = updateData.company;
        if (updateData.position !== undefined) currentRow[F.POSITION] = updateData.position;
        if (updateData.mobile !== undefined) currentRow[F.MOBILE] = updateData.mobile;
        if (updateData.email !== undefined) currentRow[F.EMAIL] = updateData.email;
        
        // 此處不覆蓋原始建立者，僅更新內容

        await this.sheets.spreadsheets.values.update({
            spreadsheetId: this.config.SPREADSHEET_ID,
            range: range,
            valueInputOption: 'USER_ENTERED',
            resource: { values: [currentRow] }
        });

        // 清除快取，讓前端能看到更新
        this.contactReader.invalidateCache('contacts');
        
        console.log('✅ [ContactWriter] 原始名片資料更新成功');
        return { success: true };
    }
}

module.exports = ContactWriter;