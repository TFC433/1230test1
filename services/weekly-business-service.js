// services/weekly-business-service.js (已優化效能 & 實作雙日曆過濾邏輯)

/**
 * 專門負責處理與「週間業務」相關的業務邏輯
 */
class WeeklyBusinessService {
    constructor(services) {
        this.weeklyBusinessReader = services.weeklyBusinessReader;
        this.weeklyBusinessWriter = services.weeklyBusinessWriter;
        this.dateHelpers = services.dateHelpers;
        this.calendarService = services.calendarService;
        this.systemReader = services.systemReader; // 【新增】注入 systemReader 以讀取篩選規則
        this.config = services.config; 
    }

    async getWeeklyBusinessSummaryList() {
        const summaryData = await this.weeklyBusinessReader.getWeeklySummary();
        const weeksList = summaryData.map(summary => {
            const weekInfo = this.dateHelpers.getWeekInfo(summary.weekId);
            return {
                id: summary.weekId,
                title: weekInfo.title,
                dateRange: weekInfo.dateRange,
                summaryCount: summary.summaryCount
            };
        });

        if (weeksList.length === 0) {
            const currentWeekId = this.dateHelpers.getWeekId(new Date());
            const currentWeekInfo = this.dateHelpers.getWeekInfo(currentWeekId);
             weeksList.push({
                 id: currentWeekId,
                 title: currentWeekInfo.title,
                 dateRange: currentWeekInfo.dateRange,
                 summaryCount: 0
             });
        }

        return weeksList.sort((a, b) => b.id.localeCompare(a.id)); 
    }

    async getWeeklyDetails(weekId) {
        console.log(`📊 [WeeklyBusinessService] 獲取週次 ${weekId} 的詳細資料...`);
        const weekInfo = this.dateHelpers.getWeekInfo(weekId);
        const entriesForWeek = await this.weeklyBusinessReader.getEntriesForWeek(weekId);
        console.log(`   - 從 Reader 獲取了 ${entriesForWeek.length} 筆 ${weekId} 的紀錄`);

        const firstDay = new Date(weekInfo.days[0].date + 'T00:00:00Z'); 
        const lastDay = new Date(weekInfo.days[weekInfo.days.length - 1].date + 'T00:00:00Z'); 
        const endQueryDate = new Date(lastDay.getTime() + 24 * 60 * 60 * 1000); 

        // --- 1. 準備並行查詢 ---
        const queries = [
            this.calendarService.getHolidaysForPeriod(firstDay, endQueryDate), // 0: 國定假日
            this.systemReader.getSystemConfig() // 1: 系統設定 (包含篩選規則)
        ];

        // DX 日曆 (原 Personal)
        if (this.config.PERSONAL_CALENDAR_ID) {
            queries.push(
                this.calendarService.getEventsForPeriod(firstDay, endQueryDate, this.config.PERSONAL_CALENDAR_ID)
            );
        } else {
            queries.push(Promise.resolve([]));
        }

        // AT 日曆 (原 System)
        if (this.config.CALENDAR_ID) {
            queries.push(
                this.calendarService.getEventsForPeriod(firstDay, endQueryDate, this.config.CALENDAR_ID)
            );
        } else {
            queries.push(Promise.resolve([]));
        }

        const results = await Promise.all(queries);
        const holidays = results[0];
        const systemConfig = results[1] || {};
        const rawDxEvents = results[2] || []; 
        const rawAtEvents = results[3] || [];

        // --- 2. 讀取篩選規則 ---
        const rules = systemConfig['日曆篩選規則'] || [];
        
        // 解析 DX 屏蔽關鍵字 (預設值為空，完全依賴 Sheet)
        const dxBlockRule = rules.find(r => r.value === 'DX_屏蔽關鍵字');
        // *** 修正：如果不設定，預設為空字串，即不屏蔽任何資料 ***
        const dxBlockKeywords = (dxBlockRule ? dxBlockRule.note : '').split(',').map(s => s.trim()).filter(Boolean);

        // 解析 AT 轉移關鍵字
        const atTransferRule = rules.find(r => r.value === 'AT_轉移關鍵字');
        // *** 修正：如果不設定，預設為空字串，即不轉移任何資料 ***
        const atTransferKeywords = (atTransferRule ? atTransferRule.note : '').split(',').map(s => s.trim()).filter(Boolean);

        console.log(`   - 日曆規則: DX屏蔽[${dxBlockKeywords}], AT轉移[${atTransferKeywords}]`);

        // --- 3. 執行過濾與分流 ---
        const finalDxList = [];
        const finalAtList = [];

        // 處理 DX 來源 (Personal)
        rawDxEvents.forEach(evt => {
            const summary = evt.summary || '';
            // 檢查是否包含屏蔽關鍵字
            const shouldBlock = dxBlockKeywords.some(kw => summary.includes(kw));
            if (!shouldBlock) {
                finalDxList.push(evt);
            }
        });

        // 處理 AT 來源 (System)
        rawAtEvents.forEach(evt => {
            const summary = evt.summary || '';
            // 檢查是否包含轉移關鍵字
            const shouldTransfer = atTransferKeywords.some(kw => summary.includes(kw));
            if (shouldTransfer) {
                finalDxList.push(evt); // 移到 DX 列表
            } else {
                finalAtList.push(evt); // 留在 AT 列表
            }
        });

        console.log(`   - 處理後: DX日曆(${finalDxList.length}), AT日曆(${finalAtList.length})`);

        // --- 4. 整理日曆事件到日期 ---
        // 定義一個通用的整理函式
        const organizeEventsByDay = (events) => {
            const map = {};
            events.forEach(event => {
                const startVal = event.start.dateTime || event.start.date;
                if (!startVal) return;

                const eventDate = new Date(startVal);
                const dateKey = eventDate.toLocaleDateString('en-CA', { timeZone: this.config.TIMEZONE });

                if (!map[dateKey]) map[dateKey] = [];
                
                const isAllDay = !!event.start.date;
                const timeStr = isAllDay 
                    ? '全天' 
                    : eventDate.toLocaleTimeString('zh-TW', { 
                        timeZone: this.config.TIMEZONE, 
                        hour: '2-digit', 
                        minute: '2-digit', 
                        hour12: false 
                      });

                map[dateKey].push({
                    summary: event.summary,
                    isAllDay: isAllDay,
                    time: timeStr,
                    htmlLink: event.htmlLink
                });
            });
            
            // 排序
            Object.keys(map).forEach(key => {
                map[key].sort((a, b) => {
                    if (a.isAllDay && !b.isAllDay) return -1;
                    if (!a.isAllDay && b.isAllDay) return 1;
                    return a.time.localeCompare(b.time);
                });
            });
            return map;
        };

        const dxEventsByDay = organizeEventsByDay(finalDxList);
        const atEventsByDay = organizeEventsByDay(finalAtList);

        // --- 5. 注入資料到 weekInfo ---
        weekInfo.days.forEach(day => {
            if (holidays.has(day.date)) {
                day.holidayName = holidays.get(day.date);
            }
            // 分別注入兩個列表
            day.dxCalendarEvents = dxEventsByDay[day.date] || [];
            day.atCalendarEvents = atEventsByDay[day.date] || [];
        });

        const weekData = {
            id: weekId,
            ...weekInfo, 
            entries: entriesForWeek 
        };

        return weekData;
    }

    async getWeekOptions() {
        const today = new Date();
        const prevWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
        const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

        const allWeeks = await this.getWeeklyBusinessSummaryList();
        const existingWeekIds = new Set(allWeeks.map(w => w.id));

        const options = [
            { id: this.dateHelpers.getWeekId(prevWeek), label: '上一週' },
            { id: this.dateHelpers.getWeekId(today),    label: '本週' },
            { id: this.dateHelpers.getWeekId(nextWeek), label: '下一週' }
        ];

        options.forEach(opt => {
            opt.disabled = existingWeekIds.has(opt.id);
        });

        return options;
    }

    async createWeeklyBusinessEntry(data) {
        const entryDate = new Date(data.date);
        const weekId = this.dateHelpers.getWeekId(entryDate);
        const fullData = { ...data, weekId };
        return this.weeklyBusinessWriter.createWeeklyBusinessEntry(fullData);
    }

    async updateWeeklyBusinessEntry(recordId, data) {
        const entryDate = new Date(data.date);
        const weekId = this.dateHelpers.getWeekId(entryDate);
        const fullData = { ...data, weekId };
        return this.weeklyBusinessWriter.updateWeeklyBusinessEntry(recordId, fullData);
    }
}

module.exports = WeeklyBusinessService;