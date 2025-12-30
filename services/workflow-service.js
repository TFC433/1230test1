// services/workflow-service.js
// 核心業務流程模組 (已重構為動態欄位對映，解決新增機會時欄位錯位問題)

const config = require('../config');

class WorkflowService {
    /**
     * @param {object} writers - 包含所有 writer 實例的物件
     * @param {object} readers - 包含所有 reader 實例的物件
     * @param {import('googleapis').google.sheets_v4.Sheets} sheets - 已認證的 Google Sheets API 實例
     */
    constructor(writers, readers, sheets) {
        if (!writers || !readers || !sheets) {
            throw new Error('WorkflowService 需要 writers, readers, 和 Sheets API 的實例');
        }
        this.companyWriter = writers.companyWriter;
        this.contactWriter = writers.contactWriter;
        this.opportunityWriter = writers.opportunityWriter;
        this.interactionWriter = writers.interactionWriter;
        
        this.contactReader = readers.contactReader;
        this.systemReader = readers.systemReader; 

        this.sheets = sheets;
        this.config = config;
    }

    /**
     * 【新增】將潛在客戶建檔的流程
     */
    async fileContact(contactRowIndex, modifier) {
        console.log(`🗂️ [WorkflowService] **啟動[建檔]流程... (Row: ${contactRowIndex})**`);

        const allSourceContacts = await this.contactReader.getContacts(9999);
        const sourceContact = allSourceContacts.find(c => c.rowIndex === contactRowIndex);

        if (!sourceContact) {
            throw new Error(`在 "原始名片資料" 中找不到指定的聯絡人 (rowIndex: ${contactRowIndex})`);
        }
        if (!sourceContact.company || !sourceContact.name) {
            throw new Error('無法建檔：該潛在客戶缺少姓名或公司名稱。');
        }

        // 1. 確保公司存在
        const companyData = await this.companyWriter.getOrCreateCompany(sourceContact.company, sourceContact, modifier, {});
        console.log(`   - 步驟 1/3: 公司資料處理完畢 (ID: ${companyData.id})`);

        // 2. 確保聯絡人存在
        const contactData = await this.contactWriter.getOrCreateContact(sourceContact, companyData, modifier);
        console.log(`   - 步驟 2/3: 聯絡人資料處理完畢 (ID: ${contactData.id})`);

        // 3. 回寫原始名片狀態
        await this.contactWriter.updateContactStatus(
            sourceContact.rowIndex, 
            '已建檔'
        );
        console.log(`   - 步驟 3/3: 已回寫原始名片狀態為 "已建檔"`);

        return {
            success: true,
            message: '潛在客戶已成功建檔。',
            data: { company: companyData, contact: contactData }
        };
    }
    
    /**
     * 【新增】將名片資料歸檔並連結到一個已存在的手動建立聯絡人
     */
    async linkBusinessCardToContact(contactId, businessCardRowIndex, modifier) {
        console.log(`🔗 [WorkflowService] **啟動[名片歸檔]流程... (ContactID: ${contactId} -> CardRow: ${businessCardRowIndex})**`);

        // 1. 獲取目標聯絡人和名片資料
        const [allContacts, allBusinessCards] = await Promise.all([
            this.contactReader.getContactList(),
            this.contactReader.getContacts(9999)
        ]);

        const targetContact = allContacts.find(c => c.contactId === contactId);
        const businessCard = allBusinessCards.find(c => c.rowIndex === businessCardRowIndex);

        if (!targetContact) {
            throw new Error(`在「聯絡人總表」中找不到指定的聯絡人 (ID: ${contactId})`);
        }
        if (!businessCard) {
            throw new Error(`在「原始名片資料」中找不到指定的名片 (rowIndex: ${businessCardRowIndex})`);
        }
        if (targetContact.sourceId !== 'MANUAL') {
            throw new Error('此聯絡人不是手動建立的，無法歸檔新名片。');
        }

        // 2. 處理公司ID
        const companyData = await this.companyWriter.getOrCreateCompany(businessCard.company, businessCard, modifier, {});
        
        // 3. 準備包含姓名和公司ID在內的完整更新資料
        const updatedData = {
            sourceId: `BC-${businessCard.rowIndex}`,
            name: businessCard.name || '',
            companyId: companyData.id,
            department: businessCard.department || '',
            position: businessCard.position || '',
            mobile: businessCard.mobile || '',
            phone: businessCard.phone || '',
            email: businessCard.email || '',
        };

        // 4. 更新「聯絡人總表」中的紀錄
        await this.contactWriter.updateContact(contactId, updatedData, modifier);
        console.log(`   - 步驟 1/2: 已更新聯絡人總表，資料已覆蓋並連結來源 ID。`);

        // 5. 更新「原始名片資料」的狀態
        await this.contactWriter.updateContactStatus(businessCard.rowIndex, '已歸檔');
        console.log(`   - 步驟 2/2: 已回寫原始名片狀態為 "已歸檔"`);

        return {
            success: true,
            message: '名片已成功歸檔並連結至現有聯絡人。',
            data: { contactId: contactId, updatedFields: updatedData }
        };
    }

    /**
     * 從潛在客戶升級為機會案件的完整流程
     * 【修正】接收 modifier，若無負責人則操作者自動成為負責人
     */
    async upgradeContactToOpportunity(contactRowIndex, opportunityData, modifier) {
        console.log(`📈 [WorkflowService] **啟動[升級]流程... (操作者: ${modifier})**`);
        
        const allSourceContacts = await this.contactReader.getContacts(9999);
        const sourceContact = allSourceContacts.find(c => c.rowIndex === contactRowIndex);

        if (!sourceContact) {
            throw new Error(`在 "原始名片資料" 中找不到指定的聯絡人 (rowIndex: ${contactRowIndex})`);
        }
        
        const completeOpportunityData = {
            ...opportunityData, 
            customerCompany: sourceContact.company,
            mainContact: sourceContact.name,
            contactPhone: sourceContact.mobile || sourceContact.phone,
        };

        // 【邏輯實作】若未指定負責人，操作者自動成為負責人
        if (!completeOpportunityData.assignee) {
            completeOpportunityData.assignee = modifier;
        }
        
        const contactSourceInfo = {
            name: sourceContact.name,
            company: sourceContact.company,
            phone: sourceContact.phone,
            mobile: sourceContact.mobile,
            email: sourceContact.email,
            position: sourceContact.position,
            department: sourceContact.department,
            address: sourceContact.address,
            rowIndex: sourceContact.rowIndex
        };
        
        // 確保操作者有值
        const currentOperator = modifier || completeOpportunityData.assignee || '系統';

        const createdOpportunity = await this._createFullOpportunityWorkflow(completeOpportunityData, contactSourceInfo, currentOperator);

        return {
            success: true,
            message: '客戶升級成功，並已同步更新所有相關資料表。',
            data: createdOpportunity
        };
    }
    
    /**
     * 手動建立新機會案件的完整流程
     * 【修正】接收 modifier，若無負責人則操作者自動成為負責人
     */
    async createOpportunity(opportunityData, modifier) {
        console.log(`🎯 [WorkflowService] **啟動[新增]流程... (操作者: ${modifier})**`);
        
        // 【邏輯實作】若未指定負責人，操作者自動成為負責人
        if (!opportunityData.assignee) {
            opportunityData.assignee = modifier;
        }
        
        const contactSourceInfo = {
            name: opportunityData.mainContact,
            company: opportunityData.customerCompany,
            phone: opportunityData.contactPhone,
            email: '', 
            position: '', 
        };

        const createdOpportunity = await this._createFullOpportunityWorkflow(opportunityData, contactSourceInfo, modifier);
        
        return {
            success: true,
            message: '機會建立成功，並已同步更新所有相關資料表。',
            data: createdOpportunity
        };
    }

    /**
     * 內部使用的核心機會建立工作流程
     * 【修正】接收 modifier 作為互動紀錄的 Recorder
     */
    async _createFullOpportunityWorkflow(opportunityData, contactSourceInfo, modifier) {
        // 確保有操作者，若無則 fallback
        const currentOperator = modifier || '系統';
        
        console.log(`⚙️ [WorkflowService] **執行統一的核心機會建立流程 (操作者: ${currentOperator})...**`);
        
        // 1. 建立公司與聯絡人 (使用當前操作者紀錄)
        const companyData = await this.companyWriter.getOrCreateCompany(opportunityData.customerCompany, contactSourceInfo, currentOperator, opportunityData);
        console.log(`   - 步驟 1/6: 公司資料處理完畢 (ID: ${companyData.id})`);

        const contactData = await this.contactWriter.getOrCreateContact(contactSourceInfo, companyData, currentOperator);
        console.log(`   - 步驟 2/6: 聯絡人資料處理完畢 (ID: ${contactData.id})`);

        console.log('   - 步驟 3/6: 準備寫入機會案件...');
        const now = new Date().toISOString();
        const opportunityId = `OPP${Date.now()}`;
        
        let currentStage = opportunityData.currentStage;
        if (!currentStage) {
            console.log('   - 正在從系統設定中獲取預設機會階段...');
            const systemConfig = await this.systemReader.getSystemConfig();
            const opportunityStages = systemConfig['機會階段'];
            if (opportunityStages && opportunityStages.length > 0) {
                currentStage = opportunityStages[0].value;
                console.log(`   - 已設定預設階段為: ${currentStage}`);
            } else {
                currentStage = '未分類'; 
                console.warn('   - 警告: 在系統設定中找不到任何「機會階段」，使用 "未分類" 作為備用。');
            }
        }

        // =========================================================================
        // 【動態欄位對映邏輯】
        // 1. 讀取目前的 Sheet 標題列 (A1:ZZ1)
        // =========================================================================
        const headerRange = `${this.config.SHEETS.OPPORTUNITIES}!A1:ZZ1`;
        const headerResponse = await this.sheets.spreadsheets.values.get({
            spreadsheetId: this.config.SPREADSHEET_ID,
            range: headerRange
        });
        
        const headerValues = headerResponse.data.values ? headerResponse.data.values[0] : [];
        if (headerValues.length === 0) {
            throw new Error('無法讀取機會案件工作表的標題列，無法執行寫入。');
        }

        // 2. 建立 標題 -> 索引 的 Map
        const headerMap = {};
        headerValues.forEach((title, index) => {
            if (title) headerMap[title.trim()] = index;
        });

        // 3. 建立空陣列 (長度等於標題列長度)
        const rowData = new Array(headerValues.length).fill('');

        // 4. 定義 Helper 來填值 (對照 config.OPPORTUNITY_FIELD_NAMES)
        const F = this.config.OPPORTUNITY_FIELD_NAMES;
        
        const setVal = (fieldName, value) => {
            const index = headerMap[fieldName];
            if (index !== undefined && index >= 0) {
                rowData[index] = value;
            } else {
                // 如果 Sheet 裡找不到這個欄位 (例如 "聯絡人電話" 被移除了)，就略過不填
                // console.warn(`標題 "${fieldName}" 不存在於工作表中，略過寫入。`);
            }
        };

        // 5. 填入資料 (依據 Config 定義的欄位名稱)
        setVal(F.ID, opportunityId);
        setVal(F.NAME, opportunityData.opportunityName || '');
        setVal(F.CUSTOMER, opportunityData.customerCompany || '');
        
        // 商流/通路相關
        setVal(F.SALES_MODEL, opportunityData.salesModel || '直接販售'); // 預設值
        setVal(F.CHANNEL, opportunityData.salesChannel || ''); 
        setVal(F.CHANNEL_CONTACT, ''); // 新增時通常還沒有通路窗口

        // 聯絡人
        setVal(F.CONTACT, opportunityData.mainContact || ''); 
        // 注意：config 提到 [移除] 聯絡人電話，所以如果不存，這裡就不呼叫 setVal，
        // 但如果 Sheet 裡還有這個欄位且你想存，可以把 config 裡的註解拿掉並在此處 setVal。
        
        setVal(F.ASSIGNEE, opportunityData.assignee || '');
        setVal(F.TYPE, opportunityData.opportunityType || '');
        setVal(F.SOURCE, opportunityData.opportunitySource || '');
        setVal(F.STAGE, currentStage);
        
        setVal(F.CREATED_TIME, now);
        setVal(F.CLOSE_DATE, opportunityData.expectedCloseDate || '');
        setVal(F.VALUE, opportunityData.opportunityValue || '');
        setVal(F.VALUE_TYPE, opportunityData.opportunityValueType || 'auto');
        
        setVal(F.STATUS, this.config.CONSTANTS.DEFAULT_VALUES.OPPORTUNITY_STATUS);
        setVal(F.DRIVE_LINK, ''); // Drive 連結通常由後續程序補上
        setVal(F.LAST_UPDATE_TIME, now);
        setVal(F.NOTES, opportunityData.notes || '');
        setVal(F.LAST_MODIFIER, currentOperator); // 使用實際操作者作為最後修改者
        
        setVal(F.HISTORY, ''); // 階段歷程初始為空
        setVal(F.PARENT_ID, opportunityData.parentOpportunityId || '');
        
        setVal(F.PROBABILITY, opportunityData.orderProbability || '');
        setVal(F.PRODUCT_SPEC, opportunityData.potentialSpecification || '');
        setVal(F.DEVICE_SCALE, opportunityData.deviceScale || '');
        
        // -------------------------------------------------------------------------

        const response = await this.sheets.spreadsheets.values.append({
            spreadsheetId: this.config.SPREADSHEET_ID, 
            range: `${this.config.SHEETS.OPPORTUNITIES}!A:A`, // 只要指定起始欄即可，API 會自動對齊
            valueInputOption: 'USER_ENTERED', 
            resource: { values: [rowData] }
        });

        this.opportunityWriter.opportunityReader.invalidateCache('opportunities');

        const updatedRange = response.data.updates.updatedRange;
        const match = updatedRange.match(/!A(\d+)/);
        const newRowIndex = match ? parseInt(match[1]) : null;

        // 建構回傳物件
        const createdOpportunity = {
            rowIndex: newRowIndex, 
            opportunityId: opportunityId, 
            opportunityName: opportunityData.opportunityName,
            customerCompany: opportunityData.customerCompany, 
            mainContact: opportunityData.mainContact, 
            assignee: opportunityData.assignee, 
            opportunityType: opportunityData.opportunityType, 
            currentStage: currentStage, 
            createdTime: now,
        };
        console.log(`   - 步驟 3/6: 機會案件資料已寫入 (ID: ${opportunityId}, Row: ${newRowIndex})`);

        // 【修正】互動紀錄：明確指出負責人，且 recorder 使用實際操作者
        const interactionData = {
            opportunityId: opportunityId,
            eventType: '系統事件',
            eventTitle: contactSourceInfo.rowIndex ? '從潛在客戶升級為機會' : '手動建立新機會',
            contentSummary: contactSourceInfo.rowIndex ?
                `將 "原始名片資料" 中的 ${contactSourceInfo.name} (${contactSourceInfo.company}) 升級為正式機會。 (負責人: ${opportunityData.assignee})` :
                `手動建立新的機會案件 "${opportunityData.opportunityName}"。 (負責人: ${opportunityData.assignee})`,
            recorder: currentOperator, // 關鍵：使用傳入的操作者 B
        };
        await this.interactionWriter.createInteraction(interactionData);
        console.log(`   - 步驟 4/6: 初始互動紀錄已建立`);

        await this.opportunityWriter.linkContactToOpportunity(
            opportunityId,
            contactData.id,
            currentOperator // 使用實際操作者
        );
        console.log(`   - 步驟 5/6: 主要聯絡人關聯已建立`);
        
        if (contactSourceInfo.rowIndex) {
            await this.contactWriter.updateContactStatus(
                contactSourceInfo.rowIndex, 
                this.config.CONSTANTS.CONTACT_STATUS.UPGRADED
            );
            console.log(`   - 步驟 6/6: 已回寫原始名片狀態為 "已升級"`);
        }

        console.log('✅ [WorkflowService] **核心機會建立流程執行成功!**');
        return createdOpportunity;
    }
}

module.exports = WorkflowService;