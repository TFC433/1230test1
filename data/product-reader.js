// data/product-reader.js
const BaseReader = require('./base-reader');
const config = require('../config');

class ProductReader extends BaseReader {
    constructor(sheets) {
        super(sheets);
        // 使用獨立的快取 Key，避免與主系統資料混淆
        this.cacheKey = 'marketProducts';
    }

    /**
     * 讀取所有市場商品資料
     * 覆寫 BaseReader 的行為，指定連線到 MARKET_PRODUCT_SHEET_ID
     */
    async getAllProducts() {
        if (!config.MARKET_PRODUCT_SHEET_ID) {
            console.error('❌ [ProductReader] 未設定 MARKET_PRODUCT_SHEET_ID');
            return [];
        }

        const range = `${config.SHEETS.MARKET_PRODUCTS}!A:V`; // A到V欄 (對應 Index 0-21)
        const cacheKey = this.cacheKey;
        const now = Date.now();

        // 1. 初始化快取
        if (!this.cache[cacheKey]) {
            this.cache[cacheKey] = { data: null, timestamp: 0 };
        }

        // 2. 讀取快取 (30秒內)
        if (this.cache[cacheKey].data && (now - this.cache[cacheKey].timestamp < this.CACHE_DURATION)) {
            return this.cache[cacheKey].data;
        }

        // 3. 請求合併
        if (this._pendingPromises[cacheKey]) {
            return this._pendingPromises[cacheKey];
        }

        console.log(`🔄 [ProductReader] 正在從外部 Sheet 讀取商品資料...`);

        // 4. 發起請求
        const fetchPromise = (async () => {
            try {
                // 使用 BaseReader 的 Retry 機制，但指定不同的 spreadsheetId
                const response = await this._executeWithRetry(() => 
                    this.sheets.spreadsheets.values.get({
                        spreadsheetId: config.MARKET_PRODUCT_SHEET_ID, // ★ 關鍵差異
                        range: range,
                    })
                );

                const rows = response.data.values || [];
                let data = [];

                if (rows.length > 1) {
                    // 跳過標題列，從第二列開始
                    data = rows.slice(1).map((row, index) => {
                        return this._parseRow(row, index);
                    }).filter(item => item !== null);
                }

                this.cache[cacheKey] = { data, timestamp: Date.now() };
                console.log(`✅ [ProductReader] 商品資料更新完成 (${data.length} 筆)`);
                return data;

            } catch (error) {
                console.error(`❌ [ProductReader] 讀取失敗:`, error.message);
                return this.cache[cacheKey].data || [];
            } finally {
                delete this._pendingPromises[cacheKey];
            }
        })();

        this._pendingPromises[cacheKey] = fetchPromise;
        return fetchPromise;
    }

    /**
     * 解析單一列資料
     */
    _parseRow(row, index) {
        const F = config.MARKET_PRODUCT_FIELDS;
        
        // 確保至少有 ID 和名稱
        if (!row[F.ID] && !row[F.NAME]) return null;

        return {
            rowIndex: index + 2,
            id: row[F.ID] || '',
            name: row[F.NAME] || '',
            category: row[F.CATEGORY] || '',
            group: row[F.GROUP] || '',
            combination: row[F.COMBINATION] || '',
            unit: row[F.UNIT] || '',
            spec: row[F.SPEC] || '',
            
            // --- 機敏資料 (後端正常讀取，由 Controller 或前端決定是否遮蔽) ---
            cost: row[F.COST] || '',
            priceMtb: row[F.PRICE_MTB] || '',
            priceSi: row[F.PRICE_SI] || '',
            priceMtu: row[F.PRICE_MTU] || '',
            
            supplier: row[F.SUPPLIER] || '',
            series: row[F.SERIES] || '',
            interface: row[F.INTERFACE] || '',
            property: row[F.PROPERTY] || '',
            aspect: row[F.ASPECT] || '',
            description: row[F.DESCRIPTION] || '',
            
            status: row[F.STATUS] || '上架', // 預設狀態
            creator: row[F.CREATOR] || '',
            createTime: row[F.CREATE_TIME] || '',
            lastModifier: row[F.LAST_MODIFIER] || '',
            lastUpdateTime: row[F.LAST_UPDATE_TIME] || ''
        };
    }
}

module.exports = ProductReader;