class AdAssistantUI {
  constructor() {
    this.currentTab = 'trends';
    this.charts = {};
    this.data = null;
    this.ads = [];
    this.currentTool = 'adCapture';
    this.searchQuery = '';
    this.searchFilter = 'all';
    this.MAX_DISPLAY_ADS = 100; // 修改显示广告数量限制

    // 改进消息监听
    chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
      try {
        console.log('Popup收到消息:', message);
        
        switch (message.type) {
          case 'AD_CAPTURED':
          case 'UPDATE_ADS':
            if (message.data) {
              await this.handleNewAd(message.data);
              console.log('广告数据已更新');
            }
            break;
          default:
            console.log('未知的消息类型:', message.type);
        }
      } catch (error) {
        console.error('处理消息时出错:', error);
      }
    });
  }

  async initialize() {
    try {
      // 检查 Chart.js 是否加载
      if (typeof Chart === 'undefined') {
        throw new Error('图表库未加载，请检查扩展配置');
      }

      // 确保 escapeHtml 方法存在
      if (typeof this.escapeHtml !== 'function') {
        this.escapeHtml = function(str) {
          if (!str) return '';
          const div = document.createElement('div');
          div.textContent = str;
          return div.innerHTML;
        };
      }

      this.initializeEventListeners();
      await this.loadData();
      this.initializeCharts();
      this.updateUI();
      this.renderAdsList();
      console.log('界面初始化完成');
    } catch (error) {
      console.error('初始化失败:', error);
      this.showError('初始化失败: ' + error.message);
    }
  }

  initializeEventListeners() {
    // 时间范围选择
    document.getElementById('timeRange').addEventListener('change', async (e) => {
      await this.loadData(e.target.value);
      this.updateUI();
    });

    // 刷新按钮
    document.getElementById('refreshBtn').addEventListener('click', async () => {
      await this.loadData();
      this.updateUI();
    });

    // 标签页切换
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.switchTab(e.target.dataset.tab);
      });
    });

    // 导出按钮
    document.getElementById('exportBtn').addEventListener('click', () => {
      const format = document.querySelector('input[name="format"]:checked').value;
      this.exportData(format);
    });

    // 添加工具切换监听
    document.getElementById('toolSelector').addEventListener('change', (e) => {
      this.switchTool(e.target.value);
    });

    // 广告库工具事件
    document.getElementById('searchBtn')?.addEventListener('click', () => {
      this.searchAds();
    });

    document.getElementById('downloadBtn')?.addEventListener('click', () => {
      this.downloadSelectedAds();
    });

    // 账号管理工具事件
    document.getElementById('addAccountBtn')?.addEventListener('click', () => {
      this.showAddAccountModal();
    });

    document.getElementById('refreshAccountBtn')?.addEventListener('click', () => {
      this.refreshAccountData();
    });

    document.getElementById('exportAccountBtn')?.addEventListener('click', () => {
      this.exportAccountReport();
    });

    // 添加搜索相关事件监听
    document.getElementById('adSearchInput')?.addEventListener('input', (e) => {
      this.searchQuery = e.target.value;
    });

    document.getElementById('searchFilter')?.addEventListener('change', (e) => {
      this.searchFilter = e.target.value;
    });

    document.getElementById('searchAdsBtn')?.addEventListener('click', () => {
      this.searchAds();
    });

    // 添加账号管理器按钮事件
    document.getElementById('openAccountManager')?.addEventListener('click', () => {
      this.openAccountManager();
    });
  }

  async loadData(timeRange = '24h') {
    try {
      this.showStatus('正在加载数据...');
      
      // 加载广告数据
      const { ads = [] } = await chrome.storage.local.get('ads');
      this.ads = Array.isArray(ads) ? ads : [];
      
      // 按时间排序
      this.ads.sort((a, b) => b.timestamp - a.timestamp);
      
      console.log('已加载广告数据:', this.ads.length);
      
      // 确保DOM元素存在
      await this.waitForChartContainers();
      
      // 更新UI
      this.updateStats();
      this.updateCharts();
      this.renderAdsList();
      
      this.showStatus('数据加载成功');
    } catch (error) {
      console.error('加载数据失败:', error);
      this.showError('加载数据失败: ' + error.message);
    }
  }

  // 等待图表容器加载
  async waitForChartContainers() {
    return new Promise((resolve) => {
      const checkContainers = () => {
        const containers = [
          'trendChart',
          'ageChart',
          'genderChart',
          'interestsChart',
          'effectivenessChart'
        ];
        
        const allExist = containers.every(id => document.getElementById(id));
        
        if (allExist) {
          resolve();
        } else {
          setTimeout(checkContainers, 100);
        }
      };
      
      checkContainers();
    });
  }

  updateStats() {
    // 更新统计数据
    const totalAdsElement = document.getElementById('totalAds');
    const totalAdvertisersElement = document.getElementById('totalAdvertisers');

    if (totalAdsElement) {
      totalAdsElement.textContent = this.ads.length;
    }

    if (totalAdvertisersElement) {
      const uniqueAdvertisers = new Set(
        this.ads.map(ad => ad.advertiser?.name)
      ).size;
      totalAdvertisersElement.textContent = uniqueAdvertisers;
    }
  }

  renderAdsList() {
    const recentAdsContainer = document.getElementById('recent-ads');
    if (!recentAdsContainer || !this.ads) return;

    // 清空现有内容
    recentAdsContainer.innerHTML = '';

    if (this.ads.length === 0) {
      recentAdsContainer.innerHTML = '<div class="no-ads">暂无捕获的广告</div>';
      return;
    }

    // 按时间排序并显示广告
    const sortedAds = [...this.ads].sort((a, b) => b.timestamp - a.timestamp);
    
    // 显示所有广告，最多显示 MAX_DISPLAY_ADS 条
    sortedAds.slice(0, this.MAX_DISPLAY_ADS).forEach(ad => {
      const adElement = this.createAdElement(ad);
      recentAdsContainer.appendChild(adElement);
    });

    // 添加加载更多按钮（如果有更多广告）
    if (sortedAds.length > this.MAX_DISPLAY_ADS) {
      const loadMoreBtn = document.createElement('button');
      loadMoreBtn.className = 'load-more-btn';
      loadMoreBtn.textContent = '加载更多';
      loadMoreBtn.onclick = () => this.loadMoreAds();
      recentAdsContainer.appendChild(loadMoreBtn);
    }
  }

  createAdElement(ad) {
    const adDiv = document.createElement('div');
    adDiv.className = 'ad-item';
    
    const timestamp = new Date(ad.timestamp).toLocaleString();
    const advertiser = this.formatAdvertiser(ad.advertiser);
    
    console.log('广告主信息:', advertiser); // 添加调试日志
    
    adDiv.innerHTML = `
      <div class="ad-item-header">
        <div class="advertiser-info">
          <div class="advertiser-name">
            <span class="page-name">${advertiser.name}</span>
            ${advertiser.verified ? '<span class="verified-badge" title="已验证">✓</span>' : ''}
          </div>
          ${advertiser.category ? 
            `<span class="page-category">${advertiser.category}</span>` : 
            ''
          }
          ${advertiser.followers ? 
            `<span class="followers-count">${advertiser.followers}</span>` : 
            ''
          }
        </div>
        <span class="ad-timestamp">${timestamp}</span>
      </div>
      
      <div class="ad-content">
        ${this.escapeHtml(ad.content.text || '').slice(0, 100)}${ad.content.text?.length > 100 ? '...' : ''}
      </div>
      
      ${this.renderAdMedia(ad.content)}
      
      <div class="ad-meta">
        <div class="ad-types">
          ${ad.analysis.contentType.map(type => 
            `<span class="ad-type">${type}</span>`
          ).join('')}
        </div>
        
        <div class="engagement-stats">
          <span class="engagement-stat" title="点赞">
            ${ICONS.like}
            ${this.formatNumber(ad.analysis.engagement.likes)}
          </span>
          <span class="engagement-stat" title="评论">
            ${ICONS.comment}
            ${this.formatNumber(ad.analysis.engagement.comments)}
          </span>
          <span class="engagement-stat" title="分享">
            ${ICONS.share}
            ${this.formatNumber(ad.analysis.engagement.shares)}
          </span>
        </div>
      </div>
    `;
    
    adDiv.addEventListener('click', () => this.showAdDetail(ad));
    
    // 添加视频部分
    if (ad.content.videos && ad.content.videos.length > 0) {
      const videoSection = document.createElement('div');
      videoSection.className = 'ad-videos';
      
      ad.content.videos.forEach(video => {
        const videoElement = document.createElement('div');
        videoElement.className = 'video-item';
        videoElement.innerHTML = `
          <div class="video-info">
            <span class="video-quality">${video.quality}</span>
            <span class="video-type">${video.type}</span>
          </div>
          <div class="video-actions">
            <button class="download-btn" data-url="${video.url}">
              下载视频
            </button>
          </div>
        `;
        
        // 添加下载事件
        const downloadBtn = videoElement.querySelector('.download-btn');
        downloadBtn.addEventListener('click', () => {
          this.downloadVideo(video);
        });
        
        videoSection.appendChild(videoElement);
      });
      
      adDiv.appendChild(videoSection);
    }
    
    return adDiv;
  }

  formatAdvertiser(advertiser) {
    if (!advertiser || typeof advertiser !== 'object') {
      console.warn('无效的广告主数据:', advertiser);
      return {
        name: '未知广告主',
        verified: false,
        badge: '',
        category: '',
        followers: ''
      };
    }

    const escapeHtml = this.escapeHtml.bind(this); // 确保 this 绑定正确

    return {
      name: escapeHtml(advertiser.name || '未知广告主'),
      verified: !!advertiser.verified,
      badge: advertiser.verified ? 
        '<span class="verified-badge" title="已验证">✓</span>' : 
        '',
      category: escapeHtml(advertiser.category || ''),
      followers: this.formatFollowers(advertiser.followers)
    };
  }

  formatFollowers(followers) {
    if (!followers) return '';
    
    // 处理不同格式的关注者数量
    const text = followers.toLowerCase();
    if (text.includes('萬') || text.includes('万')) {
      return followers;
    }
    
    const num = parseInt(followers.replace(/[^0-9]/g, ''));
    if (isNaN(num)) return followers;
    
    if (num >= 10000) {
      return `${Math.floor(num / 10000)}萬 位追蹤者`;
    }
    return `${num.toLocaleString()} 位追蹤者`;
  }

  formatEngagement(engagement) {
    const formatNumber = num => {
      if (num >= 10000) {
        return (num / 10000).toFixed(1) + '万';
      }
      return num.toLocaleString();
    };

    return `
      <span title="点赞数">
        <i class="icon-like"></i>${formatNumber(engagement.likes)}
      </span>
      <span title="评论数">
        <i class="icon-comment"></i>${formatNumber(engagement.comments)}
      </span>
      <span title="分享数">
        <i class="icon-share"></i>${formatNumber(engagement.shares)}
      </span>
    `;
  }

  renderAdMedia(content) {
    if (!content) return '';

    let mediaHtml = '<div class="media-grid">';

    // 处理图片
    if (content.images && content.images.length > 0) {
      mediaHtml += `
        <div class="images-container ${content.images.length > 1 ? 'multiple' : ''}">
          ${content.images.map(image => `
            <div class="image-item">
              <img src="${image.src}" alt="${this.escapeHtml(image.alt || '')}" 
                   loading="lazy" onclick="window.open('${image.src}', '_blank')">
            </div>
          `).join('')}
        </div>
      `;
    }

    // 处理视频
    if (content.videos && content.videos.length > 0) {
      // 只显示质量最高的视频
      const bestVideo = this.getBestQualityVideo(content.videos);
      if (bestVideo) {
        mediaHtml += `
          <div class="video-container">
            <div class="video-info">
              <span class="video-quality">${bestVideo.quality}</span>
              <span class="video-type">${bestVideo.type}</span>
            </div>
            <button class="download-btn" data-url="${bestVideo.url}">
              下载视频
            </button>
          </div>
        `;
      }
    }

    mediaHtml += '</div>';
    return mediaHtml;
  }

  getBestQualityVideo(videos) {
    if (!videos || videos.length === 0) return null;
    
    const qualityScores = {
      '1080p': 4,
      '720p': 3,
      '480p': 2,
      '360p': 1
    };

    return videos.reduce((best, current) => {
      const bestScore = qualityScores[best?.quality] || 0;
      const currentScore = qualityScores[current.quality] || 0;
      return currentScore > bestScore ? current : best;
    }, null);
  }

  renderAdLinks(links) {
    if (!links || !links.length) {
      return '<p class="no-links">无链接信息</p>';
    }

    // 过滤并去重链接
    const uniqueLinks = this.deduplicateLinks(links);
    
    // 只保留 Facebook 跳转链接
    const fbLinks = uniqueLinks.filter(link => 
      link.url && link.url.startsWith('https://l.facebook.com/l.php?')
    );

    if (fbLinks.length === 0) {
      return '<p class="no-links">无有效链接</p>';
    }

    return `
      <div class="links-list">
        ${fbLinks.map(link => {
          const linkText = this.extractLinkText(link);
          return `
            <div class="link-item">
              <div class="link-icon">🔗</div>
              <div class="link-content">
                <a href="${link.url}" target="_blank" rel="noopener noreferrer" class="link-url">
                  ${this.escapeHtml(linkText)}
                </a>
                <button class="copy-btn" data-url="${link.url}">复制</button>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  deduplicateLinks(links) {
    const seen = new Set();
    return links.filter(link => {
      if (!link.url) return false;
      const normalized = this.normalizeUrl(link.url);
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });
  }

  normalizeUrl(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.origin + urlObj.pathname;
    } catch {
      return url;
    }
  }

  extractLinkText(link) {
    if (link.text) return link.text;
    
    try {
      const url = new URL(link.url);
      if (url.hostname.includes('facebook.com')) {
        const targetUrl = url.searchParams.get('u');
        if (targetUrl) {
          const domain = new URL(decodeURIComponent(targetUrl)).hostname;
          return domain.replace(/^www\./, '');
        }
      }
      return url.hostname;
    } catch {
      return '未知链接';
    }
  }

  showAdDetail(ad) {
    // 创建模态框
    const modal = document.createElement('div');
    modal.className = 'ad-detail-modal';
    
    // 广告详情内容
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <div class="header-info">
            <h3>广告详情</h3>
            <span class="ad-time">${new Date(ad.timestamp).toLocaleString()}</span>
          </div>
          <button class="close-btn">&times;</button>
        </div>
        <div class="modal-body">
          <div class="ad-detail-main">
            <div class="ad-detail-section">
              <div class="advertiser-info">
                <div class="advertiser-name">
                  ${ad.advertiser.name}
                  ${ad.advertiser.verified ? '<span class="verified-badge">✓</span>' : ''}
                </div>
                ${ad.advertiser.category ? 
                  `<span class="page-category">${ad.advertiser.category}</span>` : 
                  ''
                }
                ${ad.advertiser.followers ? 
                  `<span class="followers-count">${ad.advertiser.followers}</span>` : 
                  ''
                }
              </div>
            </div>

            <div class="ad-detail-section">
              <div class="ad-content">
                <p class="ad-text">${ad.content.text || '无文字内容'}</p>
                ${this.renderDetailMedia(ad.content)}
              </div>
            </div>
          </div>

          <div class="ad-detail-sidebar">
            <div class="analysis-section">
              <h4>数据分析</h4>
              <div class="analysis-grid">
                <div class="analysis-item">
                  <h5>年龄分布</h5>
                  <div class="chart-container mini-chart">
                    <canvas id="adDetailAgeChart"></canvas>
                  </div>
                </div>
                <div class="analysis-item">
                  <h5>性别分布</h5>
                  <div class="chart-container mini-chart">
                    <canvas id="adDetailGenderChart"></canvas>
                  </div>
                </div>
              </div>
            </div>

            <div class="metrics-section">
              <h4>效果指标</h4>
              <div class="metrics-grid">
                <div class="metric-item">
                  <span class="metric-label">参与率</span>
                  <span class="metric-value">${ad.analysis.engagement.rate}%</span>
                </div>
                <div class="metric-item">
                  <span class="metric-label">互动质量</span>
                  <span class="metric-value">${(ad.analysis.engagement.quality * 100).toFixed(1)}%</span>
                </div>
              </div>
            </div>

            <div class="links-section">
              <h4>链接信息</h4>
              <div class="ad-links">
                ${this.renderAdLinks(ad.content.links)}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    // 添加关闭事件
    const closeBtn = modal.querySelector('.close-btn');
    closeBtn.onclick = () => {
      document.body.removeChild(modal);
    };

    // 点击模态框外部关闭
    modal.onclick = (e) => {
      if (e.target === modal) {
        document.body.removeChild(modal);
      }
    };

    // 添加到页面
    document.body.appendChild(modal);

    // 初始化详情页的图表
    setTimeout(() => {
      this.initializeDetailCharts(ad);
    }, 100);

    // 在模态框创建后添加复制按钮事件
    modal.querySelectorAll('.copy-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const url = e.target.dataset.url;
        navigator.clipboard.writeText(url)
          .then(() => {
            // 显示复制成功提示
            const originalText = e.target.textContent;
            e.target.textContent = '已复制';
            e.target.classList.add('copied');
            
            setTimeout(() => {
              e.target.textContent = originalText;
              e.target.classList.remove('copied');
            }, 1500);
          })
          .catch(err => console.error('复制失败:', err));
      });
    });
  }

  initializeDetailCharts(ad) {
    // 年龄分布图表
    const ageCtx = document.getElementById('adDetailAgeChart');
    if (ageCtx) {
      new Chart(ageCtx, {
        type: 'bar',
        data: {
          labels: ['13-17', '18-24', '25-34', '35-44', '45-54', '55-64', '65+'],
          datasets: [{
            label: '年龄分布',
            data: Object.values(ad.analysis.demographics.age),
            backgroundColor: '#1877f2'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: false
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              max: 100,
              ticks: {
                callback: value => value + '%'
              }
            }
          }
        }
      });
    }

    // 性别分布图表
    const genderCtx = document.getElementById('adDetailGenderChart');
    if (genderCtx) {
      new Chart(genderCtx, {
        type: 'doughnut',
        data: {
          labels: ['男性', '女性'],
          datasets: [{
            data: [
              ad.analysis.demographics.gender.male,
              ad.analysis.demographics.gender.female
            ],
            backgroundColor: ['#1877f2', '#e4405f']
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'bottom'
            }
          }
        }
      });
    }
  }

  updateUI() {
    if (!this.data) return;

    // 更新统计数据
    this.updateStats();

    // 更新图表
    this.updateCharts();
  }

  initializeCharts() {
    try {
      // 检查图表容器
      const containers = {
        trend: document.getElementById('trendChart'),
        age: document.getElementById('ageChart'),
        gender: document.getElementById('genderChart'),
        interests: document.getElementById('interestsChart'),
        effectiveness: document.getElementById('effectivenessChart')
      };

      // 验证容器
      Object.entries(containers).forEach(([key, container]) => {
        if (!container) {
          console.error(`找不到图表容器: ${key}Chart`);
        }
      });

      this.charts = {};

      // 趋势分析图表
      if (containers.trend) {
        this.charts.trend = new Chart(containers.trend, {
          type: 'line',
          data: {
            labels: [],
            datasets: [{
              label: '广告数量',
              data: [],
              borderColor: '#1877F2',
              tension: 0.4,
              fill: true,
              backgroundColor: 'rgba(24, 119, 242, 0.1)'
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              title: {
                display: true,
                text: '广告发布趋势'
              }
            }
          }
        });
      }

      // 年龄分布图表
      if (containers.age) {
        this.charts.age = new Chart(containers.age, {
          type: 'bar',
          data: {
            labels: ['13-17', '18-24', '25-34', '35-44', '45-54', '55-64', '65+'],
            datasets: [{
              label: '年龄分布',
              data: [],
              backgroundColor: '#1877F2'
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              title: {
                display: true,
                text: '受众年龄分布'
              }
            }
          }
        });
      }

      // 性别分布图表
      if (containers.gender) {
        this.charts.gender = new Chart(containers.gender, {
          type: 'doughnut',
          data: {
            labels: ['男性', '女性'],
            datasets: [{
              data: [],
              backgroundColor: ['#1877F2', '#E4405F']
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              title: {
                display: true,
                text: '受众性别分布'
              }
            }
          }
        });
      }

      // 兴趣分布图表
      if (containers.interests) {
        this.charts.interests = new Chart(containers.interests, {
          type: 'radar',
          data: {
            labels: [],
            datasets: [{
              label: '兴趣分布',
              data: [],
              borderColor: '#1877F2',
              backgroundColor: 'rgba(24, 119, 242, 0.2)',
              pointBackgroundColor: '#1877F2'
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              title: {
                display: true,
                text: '受众兴趣分布'
              }
            }
          }
        });
      }

      // 效果分析图表
      if (containers.effectiveness) {
        this.charts.effectiveness = new Chart(containers.effectiveness, {
          type: 'bar',
          data: {
            labels: ['参与率', '转化率', '互动质量'],
            datasets: [{
              label: '效果指标',
              data: [],
              backgroundColor: '#1877F2'
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              title: {
                display: true,
                text: '广告效果分析'
              }
            },
            scales: {
              y: {
                beginAtZero: true,
                max: 100,
                title: {
                  display: true,
                  text: '百分比 (%)'
                }
              }
            }
          }
        });
      }

      console.log('图表初始化完成');
    } catch (error) {
      console.error('初始化图表失败:', error);
    }
  }

  updateCharts() {
    try {
      if (!this.ads || !this.ads.length) {
        console.log('没有广告数据可供分析');
        return;
      }

      // 更新趋势分析
      const trendData = this.analyzeTrends(this.ads);
      if (this.charts.trend) {
        this.charts.trend.data.labels = trendData.labels;
        this.charts.trend.data.datasets[0].data = trendData.data;
        this.charts.trend.update();
      }

      // 更新年龄分布
      const ageData = this.analyzeAgeDistribution(this.ads);
      if (this.charts.age) {
        this.charts.age.data.datasets[0].data = ageData;
        this.charts.age.update();
      }

      // 更新性别分布
      const genderData = this.analyzeGenderDistribution(this.ads);
      if (this.charts.gender) {
        this.charts.gender.data.datasets[0].data = genderData;
        this.charts.gender.update();
      }

      // 更新兴趣分布
      const interestsData = this.analyzeInterests(this.ads);
      if (this.charts.interests) {
        this.charts.interests.data.labels = interestsData.labels;
        this.charts.interests.data.datasets[0].data = interestsData.data;
        this.charts.interests.update();
      }

      // 更新效果分析
      const effectivenessData = this.analyzeEffectiveness(this.ads);
      if (this.charts.effectiveness) {
        this.charts.effectiveness.data.datasets[0].data = effectivenessData;
        this.charts.effectiveness.update();
      }

      console.log('图表更新完成');
    } catch (error) {
      console.error('更新图表失败:', error);
    }
  }

  analyzeTrends(ads) {
    if (!Array.isArray(ads)) {
      console.warn('无效的广告数据:', ads);
      return { labels: [], data: [] };
    }

    // 按日期分组统计广告数量
    const dateGroups = {};
    ads.forEach(ad => {
      if (ad && ad.timestamp) {
        const date = new Date(ad.timestamp).toLocaleDateString();
        dateGroups[date] = (dateGroups[date] || 0) + 1;
      }
    });

    return {
      labels: Object.keys(dateGroups),
      data: Object.values(dateGroups)
    };
  }

  analyzeAgeDistribution(ads) {
    if (!Array.isArray(ads)) return Array(7).fill(0);
    
    const ageGroups = ['13-17', '18-24', '25-34', '35-44', '45-54', '55-64', '65+'];
    return ageGroups.map(group => {
      const values = ads
        .filter(ad => ad?.analysis?.demographics?.age?.[group])
        .map(ad => ad.analysis.demographics.age[group]);
      return values.length ? 
        values.reduce((sum, val) => sum + val, 0) / values.length : 
        0;
    });
  }

  analyzeGenderDistribution(ads) {
    // 计算平均性别分布
    const genderData = ads
      .filter(ad => ad.analysis?.demographics?.gender)
      .map(ad => ad.analysis.demographics.gender);

    if (!genderData.length) return [50, 50];

    const avgMale = genderData.reduce((sum, gender) => sum + gender.male, 0) / genderData.length;
    const avgFemale = genderData.reduce((sum, gender) => sum + gender.female, 0) / genderData.length;

    return [avgMale, avgFemale];
  }

  analyzeInterests(ads) {
    // 统计所有兴趣及其平均权重
    const interestsMap = {};
    ads.forEach(ad => {
      if (!ad.analysis?.interests) return;
      Object.entries(ad.analysis.interests).forEach(([interest, weight]) => {
        if (!interestsMap[interest]) {
          interestsMap[interest] = { sum: 0, count: 0 };
        }
        interestsMap[interest].sum += weight;
        interestsMap[interest].count++;
      });
    });

    // 计算平均值并排序
    const sortedInterests = Object.entries(interestsMap)
      .map(([interest, { sum, count }]) => ({
        interest,
        avg: sum / count
      }))
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 8); // 取前8个兴趣

    return {
      labels: sortedInterests.map(item => item.interest),
      data: sortedInterests.map(item => item.avg)
    };
  }

  analyzeEffectiveness(ads) {
    // 计算平均效果指标
    const metrics = ads
      .filter(ad => ad.analysis?.engagement)
      .map(ad => ad.analysis.engagement);

    if (!metrics.length) return [0, 0, 0];

    const avgRate = metrics.reduce((sum, m) => sum + parseFloat(m.rate), 0) / metrics.length;
    const avgQuality = metrics.reduce((sum, m) => sum + parseFloat(m.quality), 0) / metrics.length * 100;

    // 计算转化率（示例：使用互动率的70%作为转化率）
    const conversionRate = avgRate * 0.7;

    return [avgRate, conversionRate, avgQuality];
  }

  switchTab(tabName) {
    // 切换标签页
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    document.querySelectorAll('.tab-pane').forEach(pane => {
      pane.classList.toggle('active', pane.id === tabName);
    });

    this.currentTab = tabName;
    this.updateCharts();
  }

  async exportData(format) {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'EXPORT_DATA',
        format
      });

      if (response) {
        this.downloadData(response, format);
        this.showStatus('数据导出成功');
      } else {
        this.showError('导出数据失败');
      }
    } catch (error) {
      this.showError('导出数据失败: ' + error.message);
    }
  }

  downloadData(data, format) {
    const blob = new Blob([data], { 
      type: format === 'json' ? 'application/json' : 'text/csv' 
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `facebook_ads_${new Date().toISOString()}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  showStatus(message) {
    const status = document.getElementById('status');
    status.textContent = message;
    status.style.color = '#65676b';
  }

  showError(message) {
    const status = document.getElementById('status');
    status.textContent = message;
    status.style.color = '#dc3545';
  }

  async handleNewAd(adData) {
    try {
      console.log('处理新广告:', adData);
      
      // 更新本地数据
      if (!this.ads.some(ad => ad.id === adData.id)) {
        this.ads.unshift(adData); // 添加到开头
        
        // 限制本地缓存数量
        if (this.ads.length > this.MAX_DISPLAY_ADS) {
          this.ads = this.ads.slice(0, this.MAX_DISPLAY_ADS);
        }
      }
      
      // 更新UI
      this.updateStats();
      this.updateCharts();
      this.renderAdsList();
      
      console.log('广告数据已更新，当前广告数量:', this.ads.length);
    } catch (error) {
      console.error('处理新广告时出错:', error);
    }
  }

  // 添加数据格式化方法
  formatNumber(num) {
    if (!num) return '0';
    if (num >= 10000) {
      return (num / 10000).toFixed(1) + '万';
    }
    return num.toLocaleString();
  }

  switchTool(toolName) {
    // 隐藏所有工具页面
    document.querySelectorAll('.tool-page').forEach(page => {
      page.classList.remove('active');
    });

    // 显示选中的工具页面
    const selectedTool = document.getElementById(`${toolName}Tool`);
    if (selectedTool) {
      selectedTool.classList.add('active');
    }

    // 根据工具类型初始化
    switch (toolName) {
      case 'adCapture':
        this.initializeAdCapture();
        break;
      case 'accountManager':
        // 账号管理工具会在 iframe 中自动初始化
        break;
    }

    this.currentTool = toolName;
  }

  // 广告库工具方法
  async initializeAdLibrary() {
    // 初始化广告库搜索界面
  }

  searchAds() {
    if (!this.ads) return;

    const query = this.searchQuery.toLowerCase();
    let filteredAds = this.ads;

    if (query) {
      filteredAds = this.ads.filter(ad => {
        switch (this.searchFilter) {
          case 'content':
            return ad.content.text?.toLowerCase().includes(query);
          case 'advertiser':
            return ad.advertiser.name?.toLowerCase().includes(query);
          case 'type':
            return ad.analysis.contentType.some(type => 
              type.toLowerCase().includes(query)
            );
          default:
            return (
              ad.content.text?.toLowerCase().includes(query) ||
              ad.advertiser.name?.toLowerCase().includes(query) ||
              ad.analysis.contentType.some(type => 
                type.toLowerCase().includes(query)
              )
            );
        }
      });
    }

    this.renderFilteredAds(filteredAds);
  }

  renderFilteredAds(filteredAds) {
    const recentAdsContainer = document.getElementById('recent-ads');
    if (!recentAdsContainer) return;

    recentAdsContainer.innerHTML = '';

    if (filteredAds.length === 0) {
      recentAdsContainer.innerHTML = '<div class="no-ads">未找到匹配的广告</div>';
      return;
    }

    // 按时间排序
    const sortedAds = [...filteredAds].sort((a, b) => b.timestamp - a.timestamp);
    
    sortedAds.forEach(ad => {
      const adElement = this.createAdElement(ad);
      recentAdsContainer.appendChild(adElement);
    });

    // 更新显示的广告数量
    document.getElementById('totalAds').textContent = filteredAds.length;
  }

  async downloadSelectedAds() {
    try {
      this.showStatus('正在下载...');
      // 实现下载逻辑
    } catch (error) {
      this.showError('下载失败: ' + error.message);
    }
  }

  // 账号管理工具方法
  async initializeAdAccount() {
    try {
      // 加载账号列表
      await this.loadAccounts();
      // 加载账号数据
      await this.loadAccountMetrics();
    } catch (error) {
      this.showError('加载账号数据失败: ' + error.message);
    }
  }

  async loadAccounts() {
    // 实现加载账号列表逻辑
  }

  async loadAccountMetrics() {
    // 实现加载账号指标逻辑
  }

  async refreshAccountData() {
    try {
      this.showStatus('正在刷新数据...');
      await this.loadAccountMetrics();
      this.showStatus('数据已更新');
    } catch (error) {
      this.showError('刷新数据失败: ' + error.message);
    }
  }

  async exportAccountReport() {
    try {
      this.showStatus('正在生成报告...');
      // 实现导出报告逻辑
    } catch (error) {
      this.showError('导出报告失败: ' + error.message);
    }
  }

  showAddAccountModal() {
    // 实现添加账号弹窗
  }

  // 添加视频下载方法
  async downloadVideo(video) {
    try {
      // 检查视频 URL 是否有效
      if (!video.url) {
        throw new Error('无效的视频链接');
      }

      // 显示下载状态
      const btn = document.querySelector(`[data-url="${video.url}"]`);
      if (btn) {
        btn.textContent = '下载中...';
        btn.disabled = true;
      }

      // 尝试下载视频
      const response = await fetch(video.url);
      if (!response.ok) {
        throw new Error('无法访问视频');
      }

      // 获取视频数据
      const blob = await response.blob();
      
      // 创建下载链接
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `fb_ad_video_${Date.now()}.${this.getVideoExtension(video.type)}`;
      
      // 触发下载
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      // 清理
      URL.revokeObjectURL(a.href);

      // 恢复按钮状态
      if (btn) {
        btn.textContent = '下载视频';
        btn.disabled = false;
      }
    } catch (error) {
      console.error('下载视频时出错:', error);
      this.showError('下载视频失败: ' + error.message);
      
      // 恢复按钮状态
      const btn = document.querySelector(`[data-url="${video.url}"]`);
      if (btn) {
        btn.textContent = '重试下载';
        btn.disabled = false;
      }
    }
  }

  getVideoExtension(mimeType) {
    const extensions = {
      'video/mp4': 'mp4',
      'video/webm': 'webm',
      'video/ogg': 'ogv',
      'application/x-mpegURL': 'm3u8',
      'video/mp2t': 'ts'
    };
    return extensions[mimeType] || 'mp4';
  }

  // 添加 escapeHtml 方法
  escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // 添加错误处理的辅助方法
  handleError(error, context) {
    console.error(`${context}:`, error);
    this.showError(`${context}: ${error.message}`);
  }

  // 添加新的媒体渲染方法专门用于详情页
  renderDetailMedia(content) {
    if (!content) return '';

    let mediaHtml = '<div class="detail-media">';

    // 处理图片
    if (content.images && content.images.length > 0) {
      mediaHtml += `
        <div class="detail-images ${content.images.length > 1 ? 'multiple' : ''}">
          ${content.images.map(image => `
            <div class="detail-image-item">
              <img 
                src="${this.escapeHtml(image.src)}" 
                alt="${this.escapeHtml(image.alt || '')}"
                onerror="this.onerror=null; this.src='images/image-placeholder.png';"
                loading="lazy"
                onclick="window.open('${this.escapeHtml(image.src)}', '_blank')"
              />
            </div>
          `).join('')}
        </div>
      `;
    }

    // 处理视频
    if (content.videos && content.videos.length > 0) {
      const bestVideo = this.getBestQualityVideo(content.videos);
      if (bestVideo) {
        mediaHtml += `
          <div class="detail-video">
            <div class="video-info">
              <span class="video-quality">${bestVideo.quality}</span>
              <span class="video-type">${bestVideo.type}</span>
            </div>
            <button class="download-btn" data-url="${bestVideo.url}">
              下载视频
            </button>
          </div>
        `;
      }
    }

    mediaHtml += '</div>';
    return mediaHtml;
  }

  async openAccountManager() {
    try {
      // 创建新标签页打开账号管理器
      const url = chrome.runtime.getURL('account.html');
      await chrome.tabs.create({ url });
      
      // 关闭弹出窗口
      window.close();
    } catch (error) {
      console.error('打开账号管理器失败:', error);
      this.showStatus('打开账号管理器失败: ' + error.message, 'error');
    }
  }
}

// 确保在 DOM 加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
  const ui = new AdAssistantUI();
  ui.initialize().catch(error => {
    console.error('初始化UI失败:', error);
  });
});

class AdLibraryTool {
  constructor() {
    this.initializeUI();
    this.loadDownloadHistory();
  }

  initializeUI() {
    // 绑定按钮事件
    document.getElementById('openAdLibrary').addEventListener('click', () => {
      this.openAdLibrary();
    });

    document.getElementById('clearHistory').addEventListener('click', () => {
      this.clearHistory();
    });

    // 监听下载进度消息
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'DOWNLOAD_PROGRESS') {
        this.updateDownloadProgress(message.data);
      }
    });
  }

  async loadDownloadHistory() {
    try {
      const { downloadHistory = [] } = await chrome.storage.local.get('downloadHistory');
      this.renderHistory(downloadHistory);
    } catch (error) {
      console.error('加载下载历史失败:', error);
    }
  }

  renderHistory(history) {
    const historyContainer = document.getElementById('downloadHistory');
    historyContainer.innerHTML = history.length ? '' : '<div class="no-history">暂无下载记录</div>';

    history.forEach(item => {
      const historyItem = document.createElement('div');
      historyItem.className = 'history-item';
      historyItem.innerHTML = `
        <div class="history-info">
          <div class="history-title">${item.title || '未命名视频'}</div>
          <div class="history-meta">
            ${new Date(item.completedAt).toLocaleString()} · ${item.quality}
          </div>
        </div>
        <div class="history-status status-${item.status}">
          ${this.getStatusText(item.status)}
        </div>
      `;
      historyContainer.appendChild(historyItem);
    });
  }

  getStatusText(status) {
    const statusMap = {
      'completed': '已完成',
      'failed': '失败',
      'cancelled': '已取消',
      'downloading': '下载中',
      'pending': '等待中'
    };
    return statusMap[status] || status;
  }

  updateDownloadProgress(data) {
    // 更新下载进度显示
    const { taskId, status, progress } = data;
    // ... 更新进度显示
    this.loadDownloadHistory(); // 刷新历史记录
  }

  async openAdLibrary() {
    const url = 'https://www.facebook.com/ads/library';
    await chrome.tabs.create({ url });
    window.close();
  }

  async clearHistory() {
    try {
      await chrome.storage.local.set({ downloadHistory: [] });
      this.loadDownloadHistory();
    } catch (error) {
      console.error('清除历史记录失败:', error);
    }
  }
}

// 初始化工具
document.addEventListener('DOMContentLoaded', () => {
  const adLibraryTool = new AdLibraryTool();
}); 