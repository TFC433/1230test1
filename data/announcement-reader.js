// data/announcement-reader.js

const BaseReader = require('./base-reader');

/**
 * 專門負責讀取所有與「佈告欄」相關資料的類別
 */
class AnnouncementReader extends BaseReader {
    constructor(sheets) {
        super(sheets);
    }

    /**
     * 取得所有公告，並依置頂與時間排序
     * @returns {Promise<Array<object>>}
     */
    async getAnnouncements() {
        const cacheKey = 'announcements';
        const range = `${this.config.SHEETS.ANNOUNCEMENTS}!A:H`;
        const F = this.config.ANNOUNCEMENT_FIELDS;

        const rowParser = (row, index) => ({
            rowIndex: index + 2, // 實際列數
            id: row[F.ID] || '',
            title: row[F.TITLE] || '',
            content: row[F.CONTENT] || '',
            creator: row[F.CREATOR] || '',
            createTime: row[F.CREATE_TIME] || '',
            lastUpdateTime: row[F.LAST_UPDATE_TIME] || '',
            status: row[F.STATUS] || '',
            isPinned: row[F.IS_PINNED] === 'TRUE'
        });

        // 排序邏輯：置頂的優先，然後按最後更新時間倒序
        const sorter = (a, b) => {
            if (a.isPinned && !b.isPinned) return -1;
            if (!a.isPinned && b.isPinned) return 1;
            return new Date(b.lastUpdateTime) - new Date(a.lastUpdateTime);
        };
        
        const allData = await this._fetchAndCache(cacheKey, range, rowParser, sorter);
        
        // 只回傳狀態為「已發布」的公告
        return allData.filter(item => item.status === '已發布');
    }
}

module.exports = AnnouncementReader;