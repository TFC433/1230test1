// data/interaction-reader.js

const BaseReader = require('./base-reader');

/**
 * 專門負責讀取所有與「互動紀錄」相關資料的類別
 */
class InteractionReader extends BaseReader {
    constructor(sheets) {
        super(sheets);
    }

    /**
     * 取得所有互動紀錄
     * @returns {Promise<Array<object>>}
     */
    async getInteractions() {
        const cacheKey = 'interactions';
        // 【修改】擴大讀取範圍到 M 欄，以包含新增的「公司ID」欄位
        const range = `${this.config.SHEETS.INTERACTIONS}!A:M`;

        const rowParser = (row, index) => ({
            rowIndex: index + 2,
            interactionId: row[0] || '',
            opportunityId: row[1] || '',
            interactionTime: row[2] || '',
            eventType: row[3] || '',
            eventTitle: row[4] || '',
            contentSummary: row[5] || '',
            participants: row[6] || '',
            nextAction: row[7] || '',
            attachmentLink: row[8] || '',
            calendarEventId: row[9] || '',
            recorder: row[10] || '',
            createdTime: row[11] || '',
            companyId: row[12] || '' // 【新增】解析公司ID欄位
        });

        const sorter = (a, b) => {
            const dateA = new Date(a.interactionTime);
            const dateB = new Date(b.interactionTime);
            if (isNaN(dateB)) return -1;
            if (isNaN(dateA)) return 1;
            return dateB - dateA;
        };

        return this._fetchAndCache(cacheKey, range, rowParser, sorter);
    }

    /**
     * 取得最新的幾筆互動紀錄
     * @param {{limit: number}} options
     * @returns {Promise<Array<object>>}
     */
    async getRecentInteractions({ limit = 10 }) {
        const allInteractions = await this.getInteractions();
        return allInteractions.slice(0, limit);
    }

    /**
     * 【已修正】搜尋所有互動紀錄，並支援 fetchAll 參數以繞過分頁
     * @param {string} query 
     * @param {number} [page=1] 
     * @param {boolean} [fetchAll=false] - 是否獲取所有紀錄
     * @returns {Promise<object>}
     */
    async searchAllInteractions(query, page = 1, fetchAll = false) {
        // --- 修正開始：同時獲取公司列表 ---
        const [allInteractions, allOpportunities, allCompanies] = await Promise.all([
            this.getInteractions(),
            this.getOpportunities(), // 依賴 OpportunityReader
            this.getCompanyList()     // 依賴 CompanyReader
        ]);

        const opportunityNameMap = new Map(allOpportunities.map(opp => [opp.opportunityId, opp.opportunityName]));
        const companyNameMap = new Map(allCompanies.map(comp => [comp.companyId, comp.companyName])); // 建立公司對照表

        let interactions = allInteractions.map(interaction => {
            let contextName = '未指定'; // 預設值

            if (interaction.opportunityId && opportunityNameMap.has(interaction.opportunityId)) {
                contextName = opportunityNameMap.get(interaction.opportunityId); // 優先使用機會名稱
            } else if (interaction.companyId && companyNameMap.has(interaction.companyId)) {
                contextName = companyNameMap.get(interaction.companyId); // 其次使用公司名稱
            } else if (interaction.opportunityId) {
                contextName = '未知機會'; // 保留舊的 fallback
            } else if (interaction.companyId) {
                contextName = '未知公司'; // 增加新的 fallback
            }

            return {
                ...interaction,
                opportunityName: contextName // 欄位名稱保持 opportunityName 以便相容前端
            };
        });
        // --- 修正結束 ---

        if (query) {
            const searchTerm = query.toLowerCase();
            interactions = interactions.filter(i =>
                (i.contentSummary && i.contentSummary.toLowerCase().includes(searchTerm)) ||
                (i.eventTitle && i.eventTitle.toLowerCase().includes(searchTerm)) ||
                (i.opportunityName && i.opportunityName.toLowerCase().includes(searchTerm)) ||
                (i.recorder && i.recorder.toLowerCase().includes(searchTerm))
            );
        }
        
        // 如果 fetchAll 為 true，則直接返回所有數據
        if (fetchAll) {
            return {
                data: interactions,
                pagination: {
                    current: 1,
                    total: 1,
                    totalItems: interactions.length,
                    hasNext: false,
                    hasPrev: false
                }
            };
        }

        const pageSize = this.config.PAGINATION.INTERACTIONS_PER_PAGE;
        const startIndex = (page - 1) * pageSize;
        const paginated = interactions.slice(startIndex, startIndex + pageSize);
        
        return {
            data: paginated,
            pagination: { 
                current: page, 
                total: Math.ceil(interactions.length / pageSize), 
                totalItems: interactions.length, 
                hasNext: (startIndex + pageSize) < interactions.length, 
                hasPrev: page > 1 
            }
        };
    }

    // Phase 2 中，這個方法會被移除，改為依賴注入
    async getOpportunities() {
        const OpportunityReader = require('./opportunity-reader'); // 臨時引用
        const opportunityReader = new OpportunityReader(this.sheets);
        return opportunityReader.getOpportunities();
    }

    // --- 新增：取得公司列表的輔助函式 ---
    async getCompanyList() {
        const CompanyReader = require('./company-reader'); // 臨時引用
        const companyReader = new CompanyReader(this.sheets);
        return companyReader.getCompanyList();
    }
}

module.exports = InteractionReader;