class AdAccountManager {
  constructor() {
    this.accounts = [];
    this.currentAccount = null;
    this.initialized = false;
    this.accessToken = null;
    this.loadedTabs = new Set();

    // 监听内容脚本加载消息
    chrome.runtime.onMessage.addListener((message, sender) => {
      if (message.type === 'CONTENT_SCRIPT_LOADED' && sender.tab) {
        this.loadedTabs.add(sender.tab.id);
      }
      if (message.type === 'FB_ACCESS_TOKEN' && message.token) {
        this.accessToken = message.token;
      }
    });
  }

  async initialize() {
    if (this.initialized) return;

    try {
      // 初始化存储
      const { accounts } = await chrome.storage.local.get('accounts') || { accounts: [] };
      this.accounts = accounts || [];
      
      // 初始化当前账号
      const { currentAccount } = await chrome.storage.local.get('currentAccount');
      this.currentAccount = currentAccount || null;

      // 获取访问令牌
      await this.getAccessToken();

      this.initialized = true;
      console.log('广告账号管理器初始化完成');
    } catch (error) {
      console.error('初始化广告账号管理器失败:', error);
      throw error;
    }
  }

  async getAccessToken() {
    try {
      // 如果已有令牌，直接返回
      if (this.accessToken) {
        return this.accessToken;
      }

      // 获取所有 Facebook 标签页
      const tabs = await chrome.tabs.query({
        url: [
          "*://*.facebook.com/*",
          "*://business.facebook.com/*"
        ]
      });

      if (tabs.length === 0) {
        throw new Error('请先登录 Facebook');
      }

      console.log('找到Facebook标签页:', tabs.length);

      // 等待内容脚本加载
      const waitForContentScript = async (tabId) => {
        if (this.loadedTabs.has(tabId)) {
          return true;
        }
        
        // 等待最多5秒
        for (let i = 0; i < 10; i++) {
          await new Promise(resolve => setTimeout(resolve, 500));
          if (this.loadedTabs.has(tabId)) {
            return true;
          }
        }
        return false;
      };

      // 尝试从每个标签页获取令牌
      for (const tab of tabs) {
        try {
          console.log('检查标签页:', tab.id);
          
          // 等待内容脚本加载
          const isLoaded = await waitForContentScript(tab.id);
          if (!isLoaded) {
            console.log(`标签页 ${tab.id} 内容脚本未加载`);
            continue;
          }

          // 发送获取令牌请求
          const response = await new Promise((resolve) => {
            chrome.tabs.sendMessage(tab.id, { type: 'GET_FB_TOKEN' }, resolve);
          });

          if (response?.success && response.token) {
            this.accessToken = response.token;
            break;
          }
        } catch (error) {
          console.warn(`标签页 ${tab.id} 获取令牌失败:`, error);
        }
      }

      if (!this.accessToken) {
        throw new Error('无法获取访问令牌，请确保已登录 Facebook');
      }

      return this.accessToken;
    } catch (error) {
      console.error('获取访问令牌失败:', error);
      throw error;
    }
  }

  async fetchAccounts() {
    try {
      // 获取所有 Facebook 标签页
      const tabs = await chrome.tabs.query({
        url: ["*://*.facebook.com/*", "*://business.facebook.com/*"]
      });

      if (tabs.length === 0) {
        throw new Error('请先登录 Facebook');
      }

      // 向所有标签页发送获取账户请求
      for (const tab of tabs) {
        try {
          await chrome.tabs.sendMessage(tab.id, { 
            type: 'GET_AD_ACCOUNTS'
          });
        } catch (error) {
          console.warn(`标签页 ${tab.id} 未响应:`, error);
        }
      }

      // 等待账户数据
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('获取账户超时'));
        }, 10000);

        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
          if (message.type === 'AD_ACCOUNTS_DATA' && message.accounts) {
            clearTimeout(timeout);
            const accounts = this.parseAccountsData(message.accounts);
            this.saveAccounts(accounts).then(() => {
              resolve(accounts);
            });
            return true;
          }
        });
      });
    } catch (error) {
      console.error('获取广告账户失败:', error);
      throw error;
    }
  }

  parseAccountsData(accounts) {
    return accounts.map(account => ({
      id: account.id,
      name: account.name,
      accountId: account.account_id,
      status: this.getAccountStatus(account.status),
      currency: account.currency,
      balance: account.balance,
      spendCap: account.spend_cap,
      insights: null,
      updatedAt: Date.now()
    }));
  }

  getAccountStatus(status) {
    const statusMap = {
      1: '活跃',
      2: '已禁用',
      3: '未发布',
      7: '暂停',
      8: '关闭',
      9: '待定',
      100: '暂时受限',
      101: '永久受限'
    };
    return statusMap[status] || '未知';
  }

  async fetchAccountInsights(accountId) {
    try {
      // 从广告管理器API获取数据
      const response = await fetch(`https://business.facebook.com/api/graphql/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
        },
        body: new URLSearchParams({
          doc_id: '4962533717169678', // Facebook的广告洞察查询ID
          variables: JSON.stringify({
            accountId: accountId,
            datePreset: "LAST_30_DAYS",
            topLevelMetrics: [
              "SPEND",
              "IMPRESSIONS",
              "CLICKS",
              "CTR",
              "CPC",
              "REACH",
              "FREQUENCY"
            ]
          }),
        }),
        credentials: 'include'
      });

      const data = await response.json();
      return this.parseGraphQLInsights(data);
    } catch (error) {
      console.error('获取账户洞察数据失败:', error);
      throw error;
    }
  }

  parseGraphQLInsights(data) {
    try {
      const insights = data.data.account.insights;
      return {
        spend: insights.spend || '0',
        impressions: insights.impressions || '0',
        clicks: insights.clicks || '0',
        ctr: insights.ctr || '0',
        cpc: insights.cpc || '0',
        reach: insights.reach || '0',
        frequency: insights.frequency || '0',
        updatedAt: Date.now()
      };
    } catch (error) {
      console.error('解析GraphQL洞察数据失败:', error);
      return null;
    }
  }

  async saveAccounts(accounts) {
    try {
      await chrome.storage.local.set({ accounts });
      this.accounts = accounts;
      console.log('保存账户数据成功');
    } catch (error) {
      console.error('保存账户数据失败:', error);
      throw error;
    }
  }

  async setCurrentAccount(accountId) {
    try {
      const account = this.accounts.find(acc => acc.id === accountId);
      if (!account) {
        throw new Error('账户不存在');
      }

      await chrome.storage.local.set({ currentAccount: account });
      this.currentAccount = account;
      
      return account;
    } catch (error) {
      console.error('设置当前账户失败:', error);
      throw error;
    }
  }

  async refreshAccountData(accountId) {
    try {
      const insights = await this.fetchAccountInsights(accountId);
      if (!insights) return null;

      // 更新账户数据
      const accountIndex = this.accounts.findIndex(acc => acc.id === accountId);
      if (accountIndex === -1) return null;

      this.accounts[accountIndex] = {
        ...this.accounts[accountIndex],
        insights,
        updatedAt: Date.now()
      };

      // 保存更新后的数据
      await this.saveAccounts(this.accounts);
      
      return this.accounts[accountIndex];
    } catch (error) {
      console.error('刷新账户数据失败:', error);
      throw error;
    }
  }
}

// 创建并导出实例
const accountManager = new AdAccountManager();
export default accountManager; 