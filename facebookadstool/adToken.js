console.log('Facebook Token 监听器已启动');

// 标记内容脚本已加载
chrome.runtime.sendMessage({ 
  type: 'CONTENT_SCRIPT_LOADED',
  location: window.location.href 
});

// 监听来自扩展的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('收到消息:', message);
  
  if (message.type === 'GET_FB_TOKEN') {
    try {
      // 从页面中获取令牌
      const token = localStorage.getItem('_accessToken') || 
                   localStorage.getItem('act') ||
                   localStorage.getItem('fb_access_token') ||
                   document.cookie.match(/c_user=(\d+)/)?.[1]; // 尝试从cookie获取
      
      console.log('找到令牌:', token ? '是' : '否');
      
      if (token) {
        // 立即响应
        sendResponse({ 
          success: true, 
          token: token 
        });
      } else {
        sendResponse({ 
          success: false, 
          error: 'Token not found' 
        });
      }
    } catch (error) {
      console.error('获取令牌失败:', error);
      sendResponse({ 
        success: false, 
        error: error.message 
      });
    }
  }
  
  // 返回 true 表示我们会异步响应
  return true;
});

// 页面加载完成后尝试获取令牌
document.addEventListener('DOMContentLoaded', () => {
  const token = localStorage.getItem('_accessToken') || 
                localStorage.getItem('act') ||
                localStorage.getItem('fb_access_token');
  
  if (token) {
    chrome.runtime.sendMessage({
      type: 'FB_ACCESS_TOKEN',
      token: token
    });
  }
}); 