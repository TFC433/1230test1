// data/weekly-business-reader.js

const BaseReader = require('./base-reader');

/**
 * 專門負責讀取所有與「週間業務」相關資料的類別 (已優化效能)
 */
class WeeklyBusinessReader extends BaseReader {
    constructor(sheets) {
        super(sheets);
        // 新增：用於快取摘要資料
        this.summaryCache = { data: null, timestamp: 0 };
    }

    /**
     * 【優化】取得所有週間業務紀錄的摘要資訊 (不含詳細內容)
     * @returns {Promise<Array<object>>} - 包含 { weekId, summaryCount } 的陣列
     */
    async getWeeklySummary() {
        const cacheKey = 'weeklyBusinessSummary'; // 使用新的快取鍵
        const now = Date.now();
        // 使用獨立的 summaryCache
        if (this.summaryCache.data && (now - this.summaryCache.timestamp < this.CACHE_DURATION)) {
            console.log(`✅ [Cache] 從快取讀取 ${cacheKey}...`);
            return this.summaryCache.data;
        }

        console.log(`🔄 [API] 從 Google Sheet 讀取 ${cacheKey}...`);
        try {
            // 只讀取 Week ID (B欄) 和重點摘要 (F欄) 來計算數量
            const range = `${this.config.SHEETS.WEEKLY_BUSINESS}!B:F`;
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.config.SPREADSHEET_ID,
                range: range,
            });

            const rows = response.data.values || [];
            if (rows.length <= 1) {
                 this.summaryCache = { data: [], timestamp: now };
                 return [];
            }

            const weekSummaryMap = new Map(); // 使用 Map 來聚合每週的紀錄數

            rows.slice(1).forEach(row => {
                const weekId = row[0]; // B欄是 Week ID
                const summaryContent = row[4]; // F欄是重點摘要

                if (weekId && /^\d{4}-W\d{2}$/.test(weekId)) {
                    if (!weekSummaryMap.has(weekId)) {
                        weekSummaryMap.set(weekId, { weekId: weekId, summaryCount: 0 });
                    }
                    // 只有當重點摘要非空時才計數
                    if (summaryContent && summaryContent.trim() !== '') {
                        weekSummaryMap.get(weekId).summaryCount++;
                    }
                }
            });

            const summaryData = Array.from(weekSummaryMap.values())
                .sort((a, b) => b.weekId.localeCompare(a.weekId)); // 按週次倒序排

            this.summaryCache = { data: summaryData, timestamp: now }; // 存入快取
            return summaryData;

        } catch (error) {
            console.error(`❌ [WeeklyBusinessReader] 讀取 ${cacheKey} 失敗:`, error);
            // 即使讀取失敗也回傳空陣列，避免中斷流程
            return [];
        }
    }


    /**
     * 【優化】根據 Week ID 取得該週的所有業務紀錄
     * @param {string} weekId - 週次 ID (e.g., "2023-W42")
     * @returns {Promise<Array<object>>} - 該週的紀錄陣列
     */
    async getEntriesForWeek(weekId) {
        // 先讀取所有紀錄 (會利用現有的快取機制)
        const allEntries = await this._getAllWeeklyBusinessEntriesWithCache();
        // 從記憶體中篩選出目標週次的紀錄
        return allEntries.filter(entry => entry.weekId === weekId);
    }


    /**
     * 【內部方法】取得所有週間業務紀錄 (會使用快取)
     * @private
     * @returns {Promise<Array<object>>}
     */
    async _getAllWeeklyBusinessEntriesWithCache() {
        const cacheKey = 'weeklyBusiness'; // 維持原本的快取鍵給完整資料
        const range = `${this.config.SHEETS.WEEKLY_BUSINESS}!A:K`;

        const fieldKeys = [
            '日期', 'weekId', 'category', '主題', '參與人員',
            '重點摘要', '待辦事項', 'createdTime', 'lastUpdateTime',
            '建立者', 'recordId'
        ];

        const rowParser = (row, index) => {
            const entry = { rowIndex: index + 2 };
            fieldKeys.forEach((key, i) => {
                entry[key] = row[i] || '';
            });
            // 增加 day 欄位計算 (與 service 層重複，但在此處計算可確保快取資料包含此欄位)
            try {
                const dateString = entry['日期'];
                 if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
                    const [year, month, day] = dateString.split('-').map(Number);
                    const entryDateUTC = new Date(Date.UTC(year, month - 1, day));
                    if (!isNaN(entryDateUTC.getTime())) {
                       entry.day = entryDateUTC.getUTCDay(); // 0 for Sunday, 1 for Monday, etc.
                    } else {
                       entry.day = -1; // 無效日期
                    }
                 } else {
                    entry.day = -1; // 格式不符
                 }
            } catch(e) {
                entry.day = -1; // 解析出錯
            }
            return entry;
        };

        // 雖然主要由 getEntriesForWeek 篩選，但保留基礎排序
        const sorter = (a, b) => new Date(b['日期']) - new Date(a['日期']);

        // 使用 BaseReader 的快取方法
        return this._fetchAndCache(cacheKey, range, rowParser, sorter);
    }

    /**
     * 【舊方法，保持不變供 writer 使用】使週間業務快取失效
     */
    invalidateCache() {
        super.invalidateCache('weeklyBusiness'); // 清除完整資料快取
        this.summaryCache = { data: null, timestamp: 0 }; // 同時清除摘要快取
        console.log('✅ [Cache] 週間業務摘要與完整資料快取已失效');
    }

    // --- 舊的 getAllWeeklyBusiness 方法已移除，因為前端不應直接呼叫它來分頁 ---
    // 前端的分頁和搜尋邏輯應基於 getWeeklySummary 獲取的週次列表來進行
}

module.exports = WeeklyBusinessReader;