// 使用 async/await 简化代码
async function initializeAccountManager() {
  try {
    const { default: accountManager } = await import('./account-manager.js');
    const { default: AccountUI } = await import('./account-ui.js');
    
    if (typeof AccountUI !== 'function') {
      throw new Error('AccountUI is not a constructor');
    }
    
    const ui = new AccountUI();
    await ui.initialize();
    
    console.log('账号管理初始化成功');
  } catch (error) {
    console.error('初始化账号管理失败:', error);
    // 显示错误信息
    const errorElement = document.getElementById('errorMessage');
    if (errorElement) {
      errorElement.textContent = '初始化失败: ' + error.message;
      errorElement.style.display = 'block';
    }
  }
}

// 检查当前页面是否是账号管理页面
if (window.location.pathname.includes('account.html')) {
  // 等待 DOM 加载完成后初始化
  document.addEventListener('DOMContentLoaded', () => {
    initializeAccountManager();
  });
} 