// public/scripts/products/product-detail-modal.js

/**
 * [獨立模組] 商品詳細視窗管理器
 * 負責處理 Modal 的顯示、編輯模式切換、資料填入與儲存
 */
class ProductDetailModal {
    constructor() {
        this.modalId = 'product-detail-modal';
        this.currentProduct = null;
        this.isEditing = false;
        this.categories = [];
        this.onSaveCallback = null;

        this.elements = {
            modal: document.getElementById(this.modalId),
            form: document.getElementById('product-detail-form'),
            title: document.getElementById('modal-title'),
            categorySelect: document.getElementById('input-category-select'),
            
            // 成本顯示控制
            costDisplay: document.getElementById('input-cost-display'), // 顯示用 (******)
            costReal: document.getElementById('input-cost-real'),       // 編輯用 (真實數值)
            
            // 按鈕群組
            btnEdit: document.getElementById('btn-modal-edit'),
            btnSave: document.getElementById('btn-modal-save'),
            btnCancel: document.getElementById('btn-modal-cancel'),
            btnCloseBtns: document.querySelectorAll('.close-modal-btn')
        };

        this.bindEvents();
    }

    bindEvents() {
        // 確保元素存在才綁定，避免報錯
        if (this.elements.btnEdit) {
            this.elements.btnEdit.addEventListener('click', () => this.toggleEdit(true));
        }
        if (this.elements.btnCancel) {
            this.elements.btnCancel.addEventListener('click', () => this.toggleEdit(false));
        }
        if (this.elements.btnSave) {
            this.elements.btnSave.addEventListener('click', () => this.handleSave());
        }
        
        // 綁定所有關閉按鈕 (右上角 X 和其他可能的關閉鈕)
        this.elements.btnCloseBtns.forEach(btn => {
            btn.addEventListener('click', () => this.close());
        });
    }

    /**
     * 開啟視窗
     * @param {Object} product - 商品資料
     * @param {Array} allCategories - 供選單使用的分類列表
     * @param {Function} saveCallback - 儲存時的回呼函式
     */
    open(product, allCategories, saveCallback) {
        this.currentProduct = JSON.parse(JSON.stringify(product)); // Deep clone 防止汙染
        this.categories = allCategories || [];
        this.onSaveCallback = saveCallback;
        
        this.isEditing = false;
        
        this.populateForm();
        this.updateViewModeUI();
        
        if (this.elements.modal) {
            this.elements.modal.style.display = 'flex';
        }
    }

    close() {
        if (this.elements.modal) {
            this.elements.modal.style.display = 'none';
        }
        this.isEditing = false;
    }

    /**
     * 填入表單資料
     */
    populateForm() {
        const p = this.currentProduct;
        const form = this.elements.form;
        if (!form) return;

        // 1. 處理分類下拉選單
        if (this.elements.categorySelect) {
            this.elements.categorySelect.innerHTML = '';
            const cats = new Set([...this.categories]);
            if (p.category) cats.add(p.category);
            
            cats.forEach(cat => {
                const opt = document.createElement('option');
                opt.value = cat;
                opt.textContent = cat;
                if (cat === p.category) opt.selected = true;
                this.elements.categorySelect.appendChild(opt);
            });
        }

        // 2. 填入一般欄位 (移除了 interface 和 property)
        if(form.elements.id) form.elements.id.value = p.id || '';
        if(form.elements.name) form.elements.name.value = p.name || '';
        if(form.elements.spec) form.elements.spec.value = p.spec || '';
        if(form.elements.description) form.elements.description.value = p.description || '';
        
        // 3. 填入價格
        if(form.elements.priceMtb) form.elements.priceMtb.value = p.priceMtb || '';
        if(form.elements.priceSi) form.elements.priceSi.value = p.priceSi || '';
        if(form.elements.priceMtu) form.elements.priceMtu.value = p.priceMtu || '';
        
        // 4. 成本欄位 (數值填入 input，但不一定顯示)
        if(form.elements.cost) form.elements.cost.value = p.cost || '';
    }

    /**
     * 切換 編輯 / 檢視 模式
     */
    toggleEdit(active) {
        this.isEditing = active;
        const form = this.elements.form;
        if (!form) return;
        
        if (active) {
            // --- [編輯模式] ---
            if(this.elements.modal) this.elements.modal.classList.remove('view-mode');
            if(this.elements.title) this.elements.title.textContent = '編輯商品';
            
            // 啟用所有輸入框
            Array.from(form.elements).forEach(el => el.disabled = false);
            
            // 按鈕切換
            if(this.elements.btnEdit) this.elements.btnEdit.style.display = 'none';
            if(this.elements.btnSave) this.elements.btnSave.style.display = 'inline-flex';
            if(this.elements.btnCancel) this.elements.btnCancel.style.display = 'inline-flex';

            // ★ 關鍵邏輯：編輯時才顯示真實成本輸入框
            if(this.elements.costDisplay) this.elements.costDisplay.style.display = 'none';
            if(this.elements.costReal) {
                this.elements.costReal.style.display = 'block';
                this.elements.costReal.type = 'number';
            }
            
        } else {
            // --- [檢視模式] ---
            if(this.elements.modal) this.elements.modal.classList.add('view-mode');
            if(this.elements.title) this.elements.title.textContent = '商品詳細資訊';

            // 若取消編輯，還原資料
            if (!this.isEditing) this.populateForm();

            // 停用所有輸入框
            Array.from(form.elements).forEach(el => el.disabled = true);
            
            // 按鈕切換
            if(this.elements.btnEdit) this.elements.btnEdit.style.display = 'inline-flex';
            if(this.elements.btnSave) this.elements.btnSave.style.display = 'none';
            if(this.elements.btnCancel) this.elements.btnCancel.style.display = 'none';

            // ★ 關鍵邏輯：檢視時強制隱藏成本，顯示星號
            if(this.elements.costReal) this.elements.costReal.style.display = 'none';
            if(this.elements.costDisplay) {
                this.elements.costDisplay.style.display = 'block';
                this.elements.costDisplay.value = '******'; // 強制遮罩
            }
        }
    }

    updateViewModeUI() {
        this.toggleEdit(false);
    }

    /**
     * 處理儲存
     */
    async handleSave() {
        if (!this.onSaveCallback) return;

        const formData = new FormData(this.elements.form);
        const newData = Object.fromEntries(formData.entries());
        
        // 確保 ID 存在
        newData.id = this.currentProduct.id;

        // UI 鎖定防止重複提交
        if(this.elements.btnSave) this.elements.btnSave.disabled = true;
        
        try {
            await this.onSaveCallback(newData);
            
            // 更新本地暫存資料
            this.currentProduct = { ...this.currentProduct, ...newData };
            
            // 儲存成功後自動切回檢視模式
            this.toggleEdit(false);
            
            // 成功提示效果
            if (this.elements.title) {
                const titleOriginal = this.elements.title.textContent;
                this.elements.title.textContent = '✓ 儲存成功';
                this.elements.title.style.color = '#16a34a';
                setTimeout(() => {
                    this.elements.title.textContent = titleOriginal;
                    this.elements.title.style.color = '';
                }, 2000);
            }

        } catch (error) {
            alert('儲存失敗: ' + error.message);
        } finally {
            if(this.elements.btnSave) this.elements.btnSave.disabled = false;
        }
    }
}