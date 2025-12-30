// data/product-writer.js
const BaseWriter = require('./base-writer');
const config = require('../config');

class ProductWriter extends BaseWriter {
    constructor(sheets) {
        super(sheets);
    }

    /**
     * 批次儲存商品 (包含更新與新增)
     * @param {Array} products - 準備寫入的商品物件陣列
     * @param {Object} user - 操作者資訊 { name: 'User' }
     */
    async saveBatch(products, user) {
        if (!products || products.length === 0) return { updated: 0, appended: 0 };

        const spreadsheetId = config.MARKET_PRODUCT_SHEET_ID;
        const sheetName = config.SHEETS.MARKET_PRODUCTS;
        
        // 1. 先讀取目前所有的 ID，用來判斷哪些是更新(Update)，哪些是新增(Append)
        // 假設 ID 在第一欄 (Column A)
        const idRange = `${sheetName}!A:A`;
        const idResponse = await this.sheets.spreadsheets.values.get({
            spreadsheetId,
            range: idRange,
        });

        const existingIds = (idResponse.data.values || []).flat(); // ['ID', 'P001', 'P002'...]
        
        // 建立 ID 對應 Row Index 的 Map (注意：Google Sheet Row Index 從 1 開始)
        // existingIds[0] 是標題 'ID'，所以資料從 index 1 (Row 2) 開始
        const idRowMap = new Map();
        existingIds.forEach((id, index) => {
            if (index > 0 && id) idRowMap.set(id, index + 1);
        });

        const updates = [];
        const appends = [];
        const timestamp = new Date().toISOString();
        const modifier = user.name || 'System';

        // 2. 分類資料
        for (const p of products) {
            // 轉換為 Sheet 格式的陣列 (對應 A-V 欄)
            const rowData = this._formatRow(p, modifier, timestamp);
            
            if (idRowMap.has(p.id)) {
                // 更新：找到對應的 Row Index
                const rowIndex = idRowMap.get(p.id);
                updates.push({
                    range: `${sheetName}!A${rowIndex}:V${rowIndex}`,
                    values: [rowData]
                });
            } else {
                // 新增：如果是全新的 ID
                appends.push(rowData);
            }
        }

        // 3. 執行批次更新 (Updates)
        if (updates.length > 0) {
            await this.sheets.spreadsheets.values.batchUpdate({
                spreadsheetId,
                resource: {
                    valueInputOption: 'USER_ENTERED',
                    data: updates
                }
            });
        }

        // 4. 執行批次新增 (Appends)
        if (appends.length > 0) {
            await this.sheets.spreadsheets.values.append({
                spreadsheetId,
                range: `${sheetName}!A:V`,
                valueInputOption: 'USER_ENTERED',
                resource: {
                    values: appends
                }
            });
        }

        return { updated: updates.length, appended: appends.length };
    }

    /**
     * 將物件轉為陣列格式 (Mapping)
     * 欄位順序必須與 ProductReader / Sheet 嚴格一致 (Index 0 - 21)
     */
    _formatRow(p, modifier, timestamp) {
        // 若是新增資料，部分欄位可能是空的，給予預設值
        const status = p.status || '上架';
        const creator = p.creator || modifier;
        const createTime = p.createTime || timestamp;

        return [
            p.id,               // 0: ID
            p.name,             // 1: Name
            p.category,         // 2: Category
            p.group,            // 3: Group
            p.combination,      // 4: Combination
            p.unit,             // 5: Unit
            p.spec,             // 6: Spec
            p.cost,             // 7: Cost
            p.priceMtb,         // 8: Price MTB
            p.priceSi,          // 9: Price SI
            p.priceMtu,         // 10: Price MTU
            p.supplier,         // 11: Supplier
            p.series,           // 12: Series
            p.interface,        // 13: Interface
            p.property,         // 14: Property
            p.aspect,           // 15: Aspect
            p.description,      // 16: Description
            status,             // 17: Status
            creator,            // 18: Creator
            createTime,         // 19: Create Time
            modifier,           // 20: Last Modifier
            timestamp           // 21: Last Update Time
        ];
    }
}

module.exports = ProductWriter;