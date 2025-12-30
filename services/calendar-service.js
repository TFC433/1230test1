// services/calendar-service.js - 日曆服務模組 (Phase 2: 快取與重試強化版)
const { google } = require('googleapis');
const config = require('../config');

class CalendarService {
    constructor(authClient) {
        if (!authClient) throw new Error('CalendarService 需要 authClient');
        this.calendar = google.calendar({ version: 'v3', auth: authClient });
        this.config = config;
        this.holidayCalendarId = 'zh-TW.taiwan#holiday@group.v.calendar.google.com';

        // 【Phase 2 新增】內部快取機制
        this._cache = {
            weekEvents: { data: null, timestamp: 0 }
        };
        // 快取時間設為 60 秒 (平衡 API 配額與即時性)
        this.CACHE_DURATION = 60 * 1000;
    }

    /**
     * 【Phase 2 新增】API 自動重試輔助函式
     * 專門處理 Google API 的 429 限流與 5xx 伺服器錯誤
     */
    async _executeWithRetry(apiCallFn, maxRetries = 3) {
        let attempt = 0;
        while (true) {
            try {
                return await apiCallFn();
            } catch (error) {
                attempt++;
                
                // 判斷是否為可重試的錯誤
                const isRateLimit = error.code === 429 || 
                                   (error.message && (
                                       error.message.includes('Quota exceeded') || 
                                       error.message.includes('Rate Limit Exceeded') ||
                                       error.message.includes('Too Many Requests')
                                   ));
                const isServerError = error.code >= 500 && error.code < 600;

                if ((isRateLimit || isServerError) && attempt <= maxRetries) {
                    // 指數退避: 1s -> 2s -> 4s ... + 隨機抖動
                    const delay = Math.pow(2, attempt - 1) * 1000 + Math.random() * 500;
                    console.warn(`⚠️ [Calendar API] 觸發重試機制 (${attempt}/${maxRetries}) - 等待 ${Math.round(delay)}ms...`);
                    
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue; 
                }
                
                throw error;
            }
        }
    }

    /**
     * 建立日曆事件 (支援全天事件)
     * 【更新】加入重試機制 & 成功後清除快取
     */
    async createCalendarEvent(eventData) {
        try {
            console.log(`📅 [CalendarService] 建立日曆事件: ${eventData.title} (全天: ${eventData.isAllDay})`);
            
            const event = {
                summary: eventData.title,
                description: eventData.description || '',
                location: eventData.location || '',
            };

            if (eventData.isAllDay) {
                const startDateStr = new Date(eventData.startTime).toLocaleDateString('en-CA', { 
                    timeZone: this.config.TIMEZONE 
                });
                
                const startDate = new Date(eventData.startTime);
                const endDateDate = new Date(startDate);
                endDateDate.setDate(endDateDate.getDate() + 1);
                
                const endDateStr = endDateDate.toLocaleDateString('en-CA', { 
                    timeZone: this.config.TIMEZONE 
                });

                event.start = { date: startDateStr };
                event.end = { date: endDateStr };
            } else {
                const startTime = new Date(eventData.startTime);
                let endTime = eventData.endTime ? new Date(eventData.endTime) : null;
                if (!endTime) {
                    const duration = eventData.duration || 60;
                    endTime = new Date(startTime.getTime() + duration * 60000);
                }

                event.start = { dateTime: startTime.toISOString(), timeZone: this.config.TIMEZONE };
                event.end = { dateTime: endTime.toISOString(), timeZone: this.config.TIMEZONE };
            }
    
            // 【Phase 2】使用重試機制包裹 API 呼叫
            const response = await this._executeWithRetry(() => 
                this.calendar.events.insert({
                    calendarId: this.config.CALENDAR_ID,
                    resource: event,
                })
            );
            
            console.log('✅ [CalendarService] 日曆事件建立成功:', response.data.id);
            
            // 【Phase 2】關鍵：建立成功後，立即讓讀取快取失效
            // 這樣使用者回到儀表板時，就會觸發重新抓取，看到最新的事件
            this._cache.weekEvents.data = null;

            return { success: true, eventId: response.data.id, eventUrl: response.data.htmlLink };
        } catch (error) {
            console.error('❌ [CalendarService] 建立Calendar事件失敗:', error.response ? error.response.data.error : error.message);
            throw error;
        }
    }

    /**
     * 取得本週事件 (儀表板專用)
     * 【更新】加入快取檢查 & 重試機制
     */
    async getThisWeekEvents() {
        const now = Date.now();

        // 1. 檢查快取 (減少 API 呼叫)
        if (this._cache.weekEvents.data && (now - this._cache.weekEvents.timestamp < this.CACHE_DURATION)) {
            // console.log('✅ [CalendarService] 使用快取資料 (WeekEvents)'); 
            return this._cache.weekEvents.data;
        }

        try {
            const nowTime = new Date();
            const startOfWeek = new Date(nowTime.getFullYear(), nowTime.getMonth(), nowTime.getDate() - nowTime.getDay());
            startOfWeek.setHours(0, 0, 0, 0);
            const endOfWeek = new Date(startOfWeek);
            endOfWeek.setDate(endOfWeek.getDate() + 6);
            endOfWeek.setHours(23, 59, 59, 999);
            
            // 2. 【Phase 2】使用重試機制包裹 API 呼叫
            const response = await this._executeWithRetry(() => 
                this.calendar.events.list({
                    calendarId: this.config.CALENDAR_ID,
                    timeMin: startOfWeek.toISOString(),
                    timeMax: endOfWeek.toISOString(),
                    singleEvents: true,
                    orderBy: 'startTime',
                })
            );
            
            const events = response.data.items || [];
            const today = new Date().toDateString();
            
            const todayEvents = events.filter(event => {
                const eventDate = new Date(event.start.dateTime || event.start.date);
                return eventDate.toDateString() === today;
            });
            
            const result = {
                todayCount: todayEvents.length,
                weekCount: events.length,
                todayEvents: todayEvents.slice(0, 3),
                allEvents: events
            };

            // 3. 寫入快取
            this._cache.weekEvents = { data: result, timestamp: now };
            
            return result;
        } catch (error) {
            console.error('❌ [CalendarService] 讀取Calendar事件失敗:', error.message);
            // 失敗時回傳空結構，且不寫入快取 (讓下次請求能重試)
            return { todayCount: 0, weekCount: 0, todayEvents: [], allEvents: [] };
        }
    }

    /**
     * 取得指定期間的所有日曆事件
     * 【更新】加入重試機制
     */
    async getEventsForPeriod(startDate, endDate, calendarId = null) {
        const targetCalendarId = calendarId || this.config.CALENDAR_ID;
        
        if (!targetCalendarId) {
            console.warn('⚠️ [CalendarService] 未設定 Calendar ID，跳過查詢。');
            return [];
        }

        try {
            // 【Phase 2】使用重試機制
            const response = await this._executeWithRetry(() => 
                this.calendar.events.list({
                    calendarId: targetCalendarId,
                    timeMin: startDate.toISOString(),
                    timeMax: endDate.toISOString(),
                    singleEvents: true,
                    orderBy: 'startTime',
                })
            );
            
            return response.data.items || [];
        } catch (error) {
            console.warn(`⚠️ [CalendarService] 讀取日曆 (${targetCalendarId}) 失敗:`, error.message);
            return [];
        }
    }

    /**
     * 取得國定假日
     * 【更新】加入重試機制
     */
    async getHolidaysForPeriod(startDate, endDate) {
        try {
            // 【Phase 2】使用重試機制
            const response = await this._executeWithRetry(() => 
                this.calendar.events.list({
                    calendarId: this.holidayCalendarId,
                    timeMin: startDate.toISOString(),
                    timeMax: endDate.toISOString(),
                    singleEvents: true,
                    orderBy: 'startTime',
                })
            );

            const holidays = new Map();
            if (response.data.items) {
                response.data.items.forEach(event => {
                    const holidayDate = event.start.date; 
                    if (holidayDate) {
                        holidays.set(holidayDate, event.summary);
                    }
                });
            }
            return holidays;
        } catch (error) {
            console.error('❌ [CalendarService] 獲取國定假日失敗:', error.message);
            return new Map();
        }
    }
}

module.exports = CalendarService;