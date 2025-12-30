// data/base-reader.js

const config = require('../config');

// 集中管理所有資料的快取狀態 (維持上一階段的請求合併結構)
const cache = {
    opportunities: { data: null, timestamp: 0 },
    contacts: { data: null, timestamp: 0 },
    interactions: { data: null, timestamp: 0 },
    eventLogs: { data: null, timestamp: 0 },
    systemConfig: { data: null, timestamp: 0 },
    companyList: { data: null, timestamp: 0 },
    contactList: { data: null, timestamp: 0 },
    users: { data: null, timestamp: 0 },
    weeklyBusiness: { data: null, timestamp: 0 },
    weeklyBusinessSummary: { data: null, timestamp: 0 },
    oppContactLinks: { data: null, timestamp: 0 },
    announcements: { data: null, timestamp: 0 },
    
    _globalLastWrite: { data: Date.now(), timestamp: 0 }
};

const CACHE_DURATION = 30 * 1000; 

/**
 * 所有 Reader 的基礎類別
 * 【階段一更新】：加入自動重試機制 (Auto Retry with Backoff)
 */
class BaseReader {
    constructor(sheets) {
        if (!sheets) throw new Error('BaseReader 需要 Sheets API 實例');
        this.sheets = sheets;
        this.config = config;
        this.cache = cache;
        this.CACHE_DURATION = CACHE_DURATION;
        
        // 請求去重用的 Promise 儲存區
        this._pendingPromises = {}; 
    }

    invalidateCache(key = null) {
        if (key && this.cache[key]) {
            this.cache[key].timestamp = 0;
            console.log(`✅ [Cache] 快取已失效: ${key}`);
        } else if (key === null) {
            Object.keys(this.cache).forEach(k => {
                if (this.cache[k]) this.cache[k].timestamp = 0;
            });
            console.log('✅ [Cache] 所有快取已失效');
        }
        this.cache._globalLastWrite.data = Date.now();
    }

    /**
     * 【新增】核心重試邏輯
     * 當遇到 429 (Too Many Requests) 或 5xx (Server Error) 時自動重試
     * @param {Function} apiCallFn - 要執行的 API 呼叫函式
     * @param {number} maxRetries - 最大重試次數 (預設 3 次)
     */
    async _executeWithRetry(apiCallFn, maxRetries = 3) {
        let attempt = 0;
        
        while (true) {
            try {
                return await apiCallFn();
            } catch (error) {
                attempt++;
                
                // 判斷是否為可重試的錯誤 (429 限流 或 5xx 伺服器錯誤)
                const isRateLimit = error.code === 429 || 
                                   (error.message && (
                                       error.message.includes('Quota exceeded') || 
                                       error.message.includes('Too Many Requests')
                                   ));
                const isServerError = error.code >= 500 && error.code < 600;

                if ((isRateLimit || isServerError) && attempt <= maxRetries) {
                    // 指數退避演算法：1秒 -> 2秒 -> 4秒... 加上隨機抖動 (Jitter) 避免同時撞擊
                    const delay = Math.pow(2, attempt - 1) * 1000 + Math.random() * 500;
                    
                    console.warn(`⚠️ [API] 觸發自動重試機制 (${attempt}/${maxRetries}) - 等待 ${Math.round(delay)}ms...`);
                    console.warn(`   原因: ${error.message}`);
                    
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue; // 重新進入迴圈嘗試
                }
                
                // 若不可重試或超過次數，直接拋出錯誤
                throw error;
            }
        }
    }

    async _fetchAndCache(cacheKey, range, rowParser, sorter = null) {
        const now = Date.now();

        // 1. 初始化
        if (!this.cache[cacheKey]) {
            this.cache[cacheKey] = { data: null, timestamp: 0 };
        }

        // 2. 讀快取
        if (this.cache[cacheKey].data && (now - this.cache[cacheKey].timestamp < this.CACHE_DURATION)) {
            return this.cache[cacheKey].data;
        }

        // 3. 請求合併 (搭便車)
        if (this._pendingPromises[cacheKey]) {
            console.log(`⏳ [API] 併發請求合併: ${cacheKey}`);
            return this._pendingPromises[cacheKey];
        }

        console.log(`🔄 [API] 準備讀取: ${cacheKey} (${range})...`);

        // 4. 發起請求 (包裹在 Retry 機制內)
        const fetchPromise = (async () => {
            try {
                // 【修改】使用 _executeWithRetry 包裹 API 呼叫
                const response = await this._executeWithRetry(() => 
                    this.sheets.spreadsheets.values.get({
                        spreadsheetId: this.config.SPREADSHEET_ID,
                        range: range,
                    })
                );

                const rows = response.data.values || [];
                let data = [];
                
                if (rows.length > 1) {
                    data = rows.slice(1).map((row, index) => {
                        const parsedRow = rowParser(row, index);
                        if (parsedRow && typeof parsedRow.rowIndex === 'undefined') {
                           parsedRow.rowIndex = index + 2;
                        }
                        return parsedRow;
                    }).filter(item => item !== null && item !== undefined);
                }

                if (sorter) data.sort(sorter);

                this.cache[cacheKey] = { data, timestamp: Date.now() };
                console.log(`[Cache] ${cacheKey} 更新完成 (${data.length} 筆)`);
                return data;

            } catch (error) {
                console.error(`❌ [DataReader] 讀取 ${range} 最終失敗:`, error.message);

                if (error.code === 400 && error.message.includes('Unable to parse range')) {
                     this.cache[cacheKey] = { data: [], timestamp: Date.now() };
                     return [];
                }

                // 最終失敗時，回傳舊快取或空陣列，保證前端不白屏
                return this.cache[cacheKey].data || [];
            } finally {
                delete this._pendingPromises[cacheKey];
            }
        })();

        this._pendingPromises[cacheKey] = fetchPromise;
        return fetchPromise;
    }

    async findRowByValue(range, columnIndex, value) {
        try {
            // 【修改】同樣為查找功能加上 Retry 保護
            const response = await this._executeWithRetry(() => 
                this.sheets.spreadsheets.values.get({
                    spreadsheetId: this.config.SPREADSHEET_ID,
                    range: range,
                })
            );

            const rows = response.data.values || [];
            if (rows.length > 0 && columnIndex >= rows[0].length) return null;
            
            for (let i = 1; i < rows.length; i++) { 
                if (rows[i] && rows[i][columnIndex] !== undefined && rows[i][columnIndex] !== null) {
                   if (String(rows[i][columnIndex]).toLowerCase() === String(value).toLowerCase()) {
                        return { rowData: rows[i], rowIndex: i + 1 }; 
                   }
                }
            }
            return null;
        } catch (error) {
            console.error(`❌ [DataReader] 查找值失敗:`, error.message);
            if (error.code === 400) return null;
            throw error; 
        }
    }
}

module.exports = BaseReader;