// services/opportunity-service.js

/**
 * 專門負責處理與「機會案件」相關的複雜業務邏輯
 */
class OpportunityService {
    /**
     * @param {object} services - 包含所有已初始化服務的容器
     */
    constructor(services) {
        this.config = services.config;
        // Readers
        this.opportunityReader = services.opportunityReader;
        this.interactionReader = services.interactionReader;
        this.eventLogReader = services.eventLogReader;
        this.contactReader = services.contactReader;
        this.systemReader = services.systemReader;
        // Writer 模組
        this.companyWriter = services.companyWriter;
        this.contactWriter = services.contactWriter;
        this.opportunityWriter = services.opportunityWriter;
        this.interactionWriter = services.interactionWriter;
    }

    /**
     * 標準化公司名稱的輔助函式
     * @param {string} name - 公司名稱
     * @returns {string} - 標準化後的名稱
     */
    _normalizeCompanyName(name) {
        if (!name) return '';
        return name
            .toLowerCase()
            .trim()
            .replace(/股份有限公司|有限公司|公司/g, '') // 移除常見後綴
            .replace(/\(.*\)/g, '') // 移除括號內容
            .trim();
    }

    /**
     * 輔助函式：建立一筆機會互動日誌
     * @private
     */
    async _logOpportunityInteraction(opportunityId, title, summary, modifier) {
        try {
            await this.interactionWriter.createInteraction({
                opportunityId: opportunityId,
                eventType: '系統事件',
                eventTitle: title,
                contentSummary: summary,
                recorder: modifier,
            });
        } catch (logError) {
            console.warn(`[OpportunityService] 寫入機會日誌失敗 (OppID: ${opportunityId}): ${logError.message}`);
        }
    }


    /**
     * 高效獲取機會案件的完整詳細資料
     * 【修正】增加自動查找並補全聯絡人職稱 (Job Title) 的邏輯
     * @param {string} opportunityId 
     * @returns {Promise<object>}
     */
    async getOpportunityDetails(opportunityId) {
        const [
            allOpportunities, 
            interactionsFromCache, 
            eventLogsFromCache, 
            linkedContactsFromCache,
            allPotentialContacts
        ] = await Promise.all([
            this.opportunityReader.getOpportunities(),
            this.interactionReader.getInteractions(),
            this.eventLogReader.getEventLogs(),
            this.contactReader.getLinkedContacts(opportunityId),
            this.contactReader.getContacts()
        ]);
        
        const opportunityInfo = allOpportunities.find(opp => opp.opportunityId === opportunityId);
        if (!opportunityInfo) {
            throw new Error(`找不到機會ID為 ${opportunityId} 的案件`);
        }
        
        // 互動紀錄排序
        const interactions = interactionsFromCache
            .filter(i => i.opportunityId === opportunityId)
            .sort((a, b) => new Date(b.interactionTime || b.createdTime) - new Date(a.interactionTime || a.createdTime));

        // 事件報告排序 (依 createdTime)
        const eventLogs = eventLogsFromCache
            .filter(log => log.opportunityId === opportunityId)
            .sort((a, b) => new Date(b.createdTime || 0) - new Date(a.createdTime || 0));

        const normalizedOppCompany = this._normalizeCompanyName(opportunityInfo.customerCompany);
        
        // 篩選同公司的潛在聯絡人
        const potentialContacts = allPotentialContacts.filter(pc => {
            const normalizedPcCompany = this._normalizeCompanyName(pc.company);
            return normalizedPcCompany && normalizedOppCompany && normalizedPcCompany === normalizedOppCompany;
        });

        // =================================================================
        // 【新增功能】自動補全主要聯絡人的職稱 (Job Title Resolution)
        // 解決前端 View 模式因時序問題抓不到職稱的 Bug
        // =================================================================
        let mainContactJobTitle = '';
        const targetName = (opportunityInfo.mainContact || '').trim();
        
        if (targetName) {
            // 策略 1: 優先從「已關聯的聯絡人」中尋找 (最準確，因為這是已經確認過關係的人)
            const linkedMatch = linkedContactsFromCache.find(c => c.name === targetName);
            if (linkedMatch && linkedMatch.position) {
                mainContactJobTitle = linkedMatch.position;
            } 
            // 策略 2: 若找不到，嘗試從「潛在客戶 (原始名片)」中尋找
            else {
                // 嘗試尋找同公司且同姓名的潛在客戶
                const potentialMatch = potentialContacts.find(pc => pc.name === targetName); 
                
                if (potentialMatch && potentialMatch.position) {
                    mainContactJobTitle = potentialMatch.position;
                } else {
                    // 策略 3: 放寬標準，從所有潛在客戶找 (避免公司名稱正規化差異導致漏掉)
                    const fallbackMatch = allPotentialContacts.find(pc => 
                        pc.name === targetName && 
                        this._normalizeCompanyName(pc.company) === normalizedOppCompany
                    );
                    if (fallbackMatch && fallbackMatch.position) {
                        mainContactJobTitle = fallbackMatch.position;
                    }
                }
            }
        }
        // 將職稱注入到回傳的 opportunityInfo 物件中
        opportunityInfo.mainContactJobTitle = mainContactJobTitle;
        // =================================================================

        let parentOpportunity = null;
        if (opportunityInfo.parentOpportunityId) {
            parentOpportunity = allOpportunities.find(opp => opp.opportunityId === opportunityInfo.parentOpportunityId) || null;
        }
        const childOpportunities = allOpportunities.filter(opp => opp.parentOpportunityId === opportunityId);

        console.log(`✅ [OpportunityService] 機會資料整合完畢: ${interactions.length} 筆互動, ${eventLogs.length} 筆事件, ${linkedContactsFromCache.length} 位聯絡人 (職稱補全: ${mainContactJobTitle || '無'})`);
        
        return {
            opportunityInfo,
            interactions,
            eventLogs,
            linkedContacts: linkedContactsFromCache,
            potentialContacts,
            parentOpportunity,
            childOpportunities
        };
    }

    /**
     * 更新機會案件，並自動新增多種互動紀錄
     */
    async updateOpportunity(rowIndex, updateData, modifier) {
        const opportunities = await this.opportunityReader.getOpportunities();
        const originalOpportunity = opportunities.find(o => o.rowIndex === rowIndex);
        
        if (!originalOpportunity) {
            throw new Error(`找不到要更新的機會 (Row: ${rowIndex})`);
        }
        
        const oldStage = originalOpportunity.currentStage;
        const opportunityId = originalOpportunity.opportunityId;

        // --- 獲取對照表以供日誌使用 ---
        const systemConfig = await this.systemReader.getSystemConfig();
        const getNote = (configKey, value) => (systemConfig[configKey] || []).find(i => i.value === value)?.note || value || 'N/A';
        const stageMapping = new Map((systemConfig['機會階段'] || []).map(item => [item.value, item.note]));
        
        const logs = [];

        // 1. 檢查階段變更
        const newStage = updateData.currentStage;
        if (newStage && oldStage && newStage !== oldStage) {
            const oldStageName = stageMapping.get(oldStage) || oldStage;
            const newStageName = stageMapping.get(newStage) || newStage;
            logs.push(`階段從【${oldStageName}】更新為【${newStageName}】`);
        }
        
        // 2. 檢查機會價值變更
        if (updateData.opportunityValue !== undefined && updateData.opportunityValue !== originalOpportunity.opportunityValue) {
            logs.push(`機會價值從 [${originalOpportunity.opportunityValue || '未設定'}] 更新為 [${updateData.opportunityValue || '未設定'}]`);
        }

        // 3. 檢查負責業務變更
        if (updateData.assignee !== undefined && updateData.assignee !== originalOpportunity.assignee) {
            logs.push(`負責業務從 [${getNote('團隊成員', originalOpportunity.assignee)}] 變更為 [${getNote('團隊成員', updateData.assignee)}]`);
        }
        
        // 4. 檢查結案日期變更
        if (updateData.expectedCloseDate !== undefined && updateData.expectedCloseDate !== originalOpportunity.expectedCloseDate) {
            logs.push(`預計結案日從 [${originalOpportunity.expectedCloseDate || '未設定'}] 更新為 [${updateData.expectedCloseDate || '未設定'}]`);
        }

        // --- 執行更新 ---
        const updateResult = await this.opportunityWriter.updateOpportunity(rowIndex, updateData, modifier);
        
        // --- 寫入日誌 ---
        if (logs.length > 0) {
            try {
                await this._logOpportunityInteraction(
                    opportunityId,
                    '機會資料更新',
                    logs.join('； '),
                    modifier
                );
            } catch (interactionError) {
                console.warn('⚠️ [OpportunityService] 建立機會更新的互動紀錄失敗:', interactionError);
            }
        }
        
        return updateResult;
    }
    
    /**
     * 將一個聯絡人關聯到機會案件的工作流（增加日誌）
     */
    async addContactToOpportunity(opportunityId, contactData, modifier) {
        let contactToLink;
        let logTitle = '關聯聯絡人';

        if (contactData.contactId) {
            contactToLink = { id: contactData.contactId, name: contactData.name };
        } else {
            if (!contactData.company) throw new Error("無法關聯聯絡人：缺少公司名稱。");
            
            logTitle = '建立並關聯新聯絡人';
            const contactCompanyData = await this.companyWriter.getOrCreateCompany(contactData.company, contactData, modifier, {});
            contactToLink = await this.contactWriter.getOrCreateContact(contactData, contactCompanyData, modifier);

            if (contactData.rowIndex) {
                logTitle = '從潛在客戶關聯';
                await this.contactWriter.updateContactStatus(
                    contactData.rowIndex,
                    this.config.CONSTANTS.CONTACT_STATUS.UPGRADED
                );
            }
        }

        const linkResult = await this.opportunityWriter.linkContactToOpportunity(opportunityId, contactToLink.id, modifier);
        
        // --- 新增日誌 ---
        await this._logOpportunityInteraction(
            opportunityId,
            logTitle,
            `將聯絡人 "${contactToLink.name}" 關聯至此機會。`,
            modifier
        );

        return { success: true, message: '聯絡人關聯成功', data: { contact: contactToLink, link: linkResult } };
    }

    /**
     * 刪除機會與聯絡人的關聯（增加日誌）
     */
    async deleteContactLink(opportunityId, contactId, modifier) {
        // 1. 獲取聯絡人名稱以便記錄
        const allContacts = await this.contactReader.getContactList();
        const contact = allContacts.find(c => c.contactId === contactId);
        const contactName = contact ? contact.name : `ID ${contactId}`;

        // 2. 執行刪除
        const deleteResult = await this.opportunityWriter.deleteContactLink(opportunityId, contactId);

        // 3. 寫入日誌
        if (deleteResult.success) {
            await this._logOpportunityInteraction(
                opportunityId,
                '解除聯絡人關聯',
                `將聯絡人 "${contactName}" 從此機會移除。`,
                modifier
            );
        }

        return deleteResult;
    }

    /**
     * 刪除一筆機會案件（增加日誌到所屬公司）
     */
    async deleteOpportunity(rowIndex, modifier) {
        // 1. 獲取機會資料，以便刪除後還能記錄
        const opportunities = await this.opportunityReader.getOpportunities();
        const opportunity = opportunities.find(o => o.rowIndex === rowIndex);
        
        if (!opportunity) {
            throw new Error(`找不到要刪除的機會 (Row: ${rowIndex})`);
        }

        // 2. 執行刪除
        const deleteResult = await this.opportunityWriter.deleteOpportunity(rowIndex, modifier);
        
        // 3. 寫入日誌到所屬公司
        if (deleteResult.success && opportunity.customerCompany) {
            try {
                // 查找 Company ID
                const allCompanies = await this.companyReader.getCompanyList();
                const company = allCompanies.find(c => c.companyName.toLowerCase().trim() === opportunity.customerCompany.toLowerCase().trim());
                
                if (company) {
                    await this.interactionWriter.createInteraction({
                        companyId: company.companyId,
                        eventType: '系統事件',
                        eventTitle: '刪除機會案件',
                        contentSummary: `機會案件 "${opportunity.opportunityName}" (ID: ${opportunity.opportunityId}) 已被 ${modifier} 刪除。`,
                        recorder: modifier,
                    });
                } else {
                     console.warn(`[OpportunityService] 找不到公司 "${opportunity.customerCompany}" 來記錄刪除日誌。`);
                }
            } catch (logError) {
                 console.warn(`[OpportunityService] 寫入公司日誌失敗 (刪除機會時): ${logError.message}`);
            }
        }
        
        return deleteResult;
    }
}

module.exports = OpportunityService;