// services/product-service.js
const { google } = require('googleapis');
const config = require('../config');
const AuthService = require('./auth-service');
const ProductReader = require('../data/product-reader');
const ProductWriter = require('../data/product-writer');

class ProductService {
    constructor() {
        this.reader = null;
        this.writer = null;
    }

    async _getReader() {
        if (!this.reader) {
            try {
                const authService = new AuthService();
                const auth = await authService.getOAuthClient();
                const sheets = google.sheets({ version: 'v4', auth });
                this.reader = new ProductReader(sheets);
            } catch (error) {
                console.error('[ProductService] 初始化 Reader 失敗:', error);
                throw error;
            }
        }
        return this.reader;
    }

    async _getWriter() {
        if (!this.writer) {
            try {
                const authService = new AuthService();
                const auth = await authService.getOAuthClient();
                const sheets = google.sheets({ version: 'v4', auth });
                this.writer = new ProductWriter(sheets);
            } catch (error) {
                console.error('[ProductService] 初始化 Writer 失敗:', error);
                throw error;
            }
        }
        return this.writer;
    }

    async getProducts(query = '') {
        try {
            const reader = await this._getReader();
            let products = await reader.getAllProducts();

            if (!Array.isArray(products)) {
                console.warn('[ProductService] 讀取到的資料異常 (非陣列):', products);
                return [];
            }

            if (query) {
                const q = query.trim().toLowerCase();
                products = products.filter(p => 
                    (p.name && p.name.toLowerCase().includes(q)) ||
                    (p.id && p.id.toLowerCase().includes(q)) ||
                    (p.spec && p.spec.toLowerCase().includes(q)) ||
                    (p.supplier && p.supplier.toLowerCase().includes(q))
                );
            }

            // 【修改】預設排序由 ID 遞增 (Ascending: A->Z, 1->9)
            // 使用 numeric: true 確保 P10 會排在 P2 後面，而不是 P1 後面
            products.sort((a, b) => (a.id || '').localeCompare(b.id || '', undefined, { numeric: true }));

            return products;
        } catch (error) {
            console.error('[ProductService] getProducts 執行錯誤:', error);
            throw error;
        }
    }

    async saveAll(products, user) {
        try {
            console.log(`[ProductService] 開始批次儲存 ${products.length} 筆資料...`);
            const writer = await this._getWriter();
            
            // 執行寫入
            const result = await writer.saveBatch(products, user);
            
            // 寫入成功後，清除快取以確保下次讀取是新的
            await this.refreshCache();
            
            return result;
        } catch (error) {
            console.error('[ProductService] saveAll 失敗:', error);
            throw error;
        }
    }

    async refreshCache() {
        const reader = await this._getReader();
        if (reader.cache && reader.cacheKey) {
            delete reader.cache[reader.cacheKey];
            console.log(`[ProductService] 已清除快取 Key: ${reader.cacheKey}`);
        }
        return await this.getProducts();
    }
}

module.exports = new ProductService();