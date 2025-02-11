import accountManager from './account-manager.js';

export default class AccountUI {
  constructor() {
    this.initialized = false;
    this.searchQuery = '';
    this.statusFilter = 'all';
    this.loadingIndicator = document.getElementById('loadingIndicator');
    this.initializeEventListeners();
  }

  showLoading() {
    if (this.loadingIndicator) {
      this.loadingIndicator.style.display = 'flex';
    }
  }

  hideLoading() {
    if (this.loadingIndicator) {
      this.loadingIndicator.style.display = 'none';
    }
  }

  async initialize() {
    if (this.initialized) return;

    try {
      this.showLoading();
      await accountManager.initialize();
      await this.loadAccounts();
      this.initialized = true;
    } catch (error) {
      console.error('初始化账号界面失败:', error);
      this.showError('初始化失败: ' + error.message);
    } finally {
      this.hideLoading();
    }
  }

  initializeEventListeners() {
    // 刷新按钮
    document.getElementById('refreshBtn').addEventListener('click', () => {
      this.refreshData();
    });

    // 导出按钮
    document.getElementById('exportBtn').addEventListener('click', () => {
      this.exportReport();
    });

    // 添加账号按钮
    document.getElementById('addAccountBtn').addEventListener('click', () => {
      this.showAddAccountModal();
    });

    // 添加搜索功能
    document.getElementById('searchInput').addEventListener('input', (e) => {
      this.searchQuery = e.target.value;
      this.filterAccounts();
    });

    // 添加状态过滤
    document.getElementById('statusFilter').addEventListener('change', (e) => {
      this.statusFilter = e.target.value;
      this.filterAccounts();
    });
  }

  async loadAccounts() {
    try {
      const accounts = await accountManager.fetchAccounts();
      this.renderAccountsList(accounts);
    } catch (error) {
      console.error('加载账号失败:', error);
      this.showError('加载账号失败: ' + error.message);
    }
  }

  filterAccounts() {
    const accounts = accountManager.accounts;
    let filtered = accounts;

    // 应用搜索过滤
    if (this.searchQuery) {
      const query = this.searchQuery.toLowerCase();
      filtered = filtered.filter(account => 
        account.name.toLowerCase().includes(query) ||
        account.accountId.includes(query)
      );
    }

    // 应用状态过滤
    if (this.statusFilter !== 'all') {
      filtered = filtered.filter(account => 
        account.status.toLowerCase() === this.statusFilter
      );
    }

    this.renderAccountsList(filtered);
  }

  renderAccountsList(accounts) {
    const container = document.getElementById('accountsList');
    if (!container) return;

    if (accounts.length === 0) {
      container.innerHTML = `
        <div class="no-accounts">
          <p>没有找到匹配的账号</p>
        </div>
      `;
      return;
    }

    container.innerHTML = accounts.map(account => `
      <div class="account-card ${account.id === accountManager.currentAccount?.id ? 'active' : ''}"
           data-account-id="${account.id}">
        <div class="account-name">${account.name}</div>
        <div class="account-id">账号: ${account.accountId}</div>
        <div class="account-status">
          <span class="status-indicator ${account.status.toLowerCase() === 'active' ? 'status-active' : 'status-inactive'}"></span>
          状态: ${account.status}
        </div>
      </div>
    `).join('');

    // 添加点击事件
    container.querySelectorAll('.account-card').forEach(card => {
      card.addEventListener('click', () => {
        this.selectAccount(card.dataset.accountId);
      });
    });
  }

  async selectAccount(accountId) {
    try {
      const account = await accountManager.setCurrentAccount(accountId);
      if (!account) return;

      // 更新选中状态
      document.querySelectorAll('.account-card').forEach(card => {
        card.classList.toggle('active', card.dataset.accountId === accountId);
      });

      // 加载账号详情
      await this.loadAccountDetails(account);
    } catch (error) {
      console.error('选择账号失败:', error);
      this.showError('选择账号失败: ' + error.message);
    }
  }

  async loadAccountDetails(account) {
    try {
      const insights = await accountManager.fetchAccountInsights(account.id);
      this.renderAccountDetails(account, insights);
    } catch (error) {
      console.error('加载账号详情失败:', error);
      this.showError('加载账号详情失败: ' + error.message);
    }
  }

  renderAccountDetails(account, insights) {
    const infoContainer = document.getElementById('accountInfo');
    const insightsContainer = document.getElementById('accountInsights');

    if (infoContainer) {
      infoContainer.innerHTML = `
        <h2>账号信息</h2>
        <div class="info-grid">
          <div class="info-item">
            <label>账号名称</label>
            <span>${account.name}</span>
          </div>
          <div class="info-item">
            <label>账号ID</label>
            <span>${account.accountId}</span>
          </div>
          <div class="info-item">
            <label>状态</label>
            <span>${account.status}</span>
          </div>
          <div class="info-item">
            <label>币种</label>
            <span>${account.currency}</span>
          </div>
          <div class="info-item">
            <label>时区</label>
            <span>${account.timezone}</span>
          </div>
          <div class="info-item">
            <label>余额</label>
            <span>${account.balance}</span>
          </div>
        </div>
      `;
    }

    if (insightsContainer && insights) {
      insightsContainer.innerHTML = `
        <h2>账号数据</h2>
        <div class="insights-grid">
          <div class="insight-item">
            <label>花费</label>
            <span>${insights.spend}</span>
          </div>
          <div class="insight-item">
            <label>展示次数</label>
            <span>${insights.impressions}</span>
          </div>
          <div class="insight-item">
            <label>点击次数</label>
            <span>${insights.clicks}</span>
          </div>
          <div class="insight-item">
            <label>点击率</label>
            <span>${insights.ctr}%</span>
          </div>
          <div class="insight-item">
            <label>平均点击成本</label>
            <span>${insights.cpc}</span>
          </div>
          <div class="insight-item">
            <label>覆盖人数</label>
            <span>${insights.reach}</span>
          </div>
        </div>
      `;
    }

    this.updateMetricCards(insights);
  }

  updateMetricCards(insights) {
    if (!insights) return;

    document.getElementById('totalSpend').textContent = insights.spend;
    document.getElementById('totalImpressions').textContent = this.formatNumber(insights.impressions);
    document.getElementById('avgCTR').textContent = insights.ctr + '%';
  }

  formatNumber(num) {
    if (!num) return '0';
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    }
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num.toLocaleString();
  }

  showError(message) {
    const errorElement = document.getElementById('errorMessage');
    if (!errorElement) return;

    errorElement.textContent = message;
    errorElement.style.display = 'block';

    setTimeout(() => {
      errorElement.style.display = 'none';
    }, 5000);
  }

  async refreshData() {
    try {
      this.showLoading();
      await this.loadAccounts();
      if (accountManager.currentAccount) {
        await this.loadAccountDetails(accountManager.currentAccount);
      }
      console.log('数据刷新成功');
    } catch (error) {
      console.error('刷新数据失败:', error);
      this.showError('刷新失败: ' + error.message);
    } finally {
      this.hideLoading();
    }
  }

  async exportReport() {
    try {
      const data = {
        accounts: accountManager.accounts,
        currentAccount: accountManager.currentAccount,
        exportTime: new Date().toISOString()
      };

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `facebook_accounts_report_${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('导出报告失败:', error);
      this.showError('导出失败: ' + error.message);
    }
  }

  // ... 其他方法 ...
} 