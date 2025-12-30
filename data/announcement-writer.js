// data/announcement-writer.js

const BaseWriter = require('./base-writer');

class AnnouncementWriter extends BaseWriter {
    /**
     * @param {import('googleapis').google.sheets_v4.Sheets} sheets 
     * @param {import('./announcement-reader')} announcementReader 
     */
    constructor(sheets, announcementReader) {
        super(sheets);
        if (!announcementReader) {
            throw new Error('AnnouncementWriter 需要 AnnouncementReader 的實例');
        }
        this.announcementReader = announcementReader;
    }

    /**
     * 建立一則新公告
     * @param {object} data - 公告資料 { title, content, creator, status, isPinned }
     * @returns {Promise<object>}
     */
    async createAnnouncement(data) {
        const now = new Date().toISOString();
        const id = `ANNC${Date.now()}`;
        const F = this.config.ANNOUNCEMENT_FIELDS;
        
        const rowData = [];
        rowData[F.ID] = id;
        rowData[F.TITLE] = data.title;
        rowData[F.CONTENT] = data.content;
        rowData[F.CREATOR] = data.creator;
        rowData[F.CREATE_TIME] = now;
        rowData[F.LAST_UPDATE_TIME] = now;
        rowData[F.STATUS] = data.status || '已發布';
        rowData[F.IS_PINNED] = data.isPinned ? 'TRUE' : 'FALSE';

        await this.sheets.spreadsheets.values.append({
            spreadsheetId: this.config.SPREADSHEET_ID,
            range: `${this.config.SHEETS.ANNOUNCEMENTS}!A:H`,
            valueInputOption: 'USER_ENTERED',
            resource: { values: [rowData] }
        });

        this.announcementReader.invalidateCache('announcements');
        console.log(`📢 [AnnouncementWriter] 公告已建立: ${id}`);
        return { success: true, id };
    }

    /**
     * 更新一則現有公告
     * @param {string} id - 公告ID
     * @param {object} data - 要更新的公告資料
     * @returns {Promise<object>}
     */
    async updateAnnouncement(id, data) {
        const range = `${this.config.SHEETS.ANNOUNCEMENTS}!A:H`;
        const F = this.config.ANNOUNCEMENT_FIELDS;
        const announcementRow = await this.announcementReader.findRowByValue(range, F.ID, id);
        
        if (!announcementRow) {
            throw new Error(`找不到公告ID: ${id}`);
        }

        const { rowIndex, rowData: currentRow } = announcementRow;
        
        // 根據傳入的 data 更新欄位
        if (data.title !== undefined) currentRow[F.TITLE] = data.title;
        if (data.content !== undefined) currentRow[F.CONTENT] = data.content;
        if (data.status !== undefined) currentRow[F.STATUS] = data.status;
        if (data.isPinned !== undefined) currentRow[F.IS_PINNED] = data.isPinned ? 'TRUE' : 'FALSE';
        
        currentRow[F.LAST_UPDATE_TIME] = new Date().toISOString();
        // 建立者和建立時間通常不變

        await this.sheets.spreadsheets.values.update({
            spreadsheetId: this.config.SPREADSHEET_ID,
            range: `${this.config.SHEETS.ANNOUNCEMENTS}!A${rowIndex}:H${rowIndex}`,
            valueInputOption: 'USER_ENTERED',
            resource: { values: [currentRow] }
        });

        this.announcementReader.invalidateCache('announcements');
        console.log(`📢 [AnnouncementWriter] 公告已更新: ${id}`);
        return { success: true };
    }

    /**
     * 刪除一則公告
     * @param {string} id - 公告ID
     * @returns {Promise<object>}
     */
    async deleteAnnouncement(id) {
        const range = `${this.config.SHEETS.ANNOUNCEMENTS}!A:H`;
        const F = this.config.ANNOUNCEMENT_FIELDS;
        const announcementRow = await this.announcementReader.findRowByValue(range, F.ID, id);
        
        if (!announcementRow) {
            throw new Error(`找不到要刪除的公告ID: ${id}`);
        }
        
        await this._deleteRow(this.config.SHEETS.ANNOUNCEMENTS, announcementRow.rowIndex, this.announcementReader);

        console.log(`📢 [AnnouncementWriter] 公告已刪除: ${id}`);
        return { success: true };
    }
}

module.exports = AnnouncementWriter;