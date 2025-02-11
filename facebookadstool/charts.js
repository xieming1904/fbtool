// 基础图表类
class BaseChart {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.chart = null;

    // 检查 Chart.js 是否可用
    if (typeof Chart === 'undefined') {
      console.error('Chart.js 未加载');
      this.showError('图表库加载失败，请检查扩展配置');
      return;
    }
  }

  clear() {
    try {
      if (this.chart) {
        this.chart.destroy();
      }
      this.container.innerHTML = '';
    } catch (error) {
      console.error('清除图表时出错:', error);
    }
  }

  showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'chart-error';
    errorDiv.textContent = message;
    this.container.appendChild(errorDiv);
  }

  showNoData() {
    const message = document.createElement('div');
    message.className = 'no-data-message';
    message.textContent = '暂无数据';
    this.container.appendChild(message);
  }

  createChart(type, data, options = {}) {
    try {
      if (typeof Chart === 'undefined') {
        throw new Error('Chart.js 未加载');
      }

      const canvas = document.createElement('canvas');
      this.container.appendChild(canvas);
      const ctx = canvas.getContext('2d');
      
      this.chart = new Chart(ctx, {
        type,
        data,
        options: {
          responsive: true,
          maintainAspectRatio: false,
          ...options
        }
      });
    } catch (error) {
      console.error('创建图表失败:', error);
      this.showError('创建图表失败');
    }
  }
}

// 内容类型图表
class ContentTypeChart extends BaseChart {
  update(data) {
    this.clear();
    
    const chartData = {
      labels: Object.keys(data),
      datasets: [{
        data: Object.values(data),
        backgroundColor: [
          '#1877F2',
          '#42B72A',
          '#F7B928',
          '#E94F4F'
        ]
      }]
    };

    this.createChart('pie', chartData, {
      plugins: {
        legend: {
          position: 'right'
        }
      }
    });
  }
}

// 情感分析图表
class SentimentChart extends BaseChart {
  update(data) {
    this.clear();
    
    const chartData = {
      labels: ['积极', '中性', '消极'],
      datasets: [{
        data: [data.positive, data.neutral, data.negative],
        backgroundColor: ['#42B72A', '#687684', '#E94F4F']
      }]
    };

    this.createChart('bar', chartData);
  }
}

// 趋势图表
class TrendChart extends BaseChart {
  update(data) {
    this.clear();
    
    const chartData = {
      labels: data.map(item => item.period.label),
      datasets: [{
        label: '广告数量',
        data: data.map(item => item.count),
        borderColor: '#1877F2',
        fill: false
      }]
    };

    this.createChart('line', chartData);
  }
}

// 年龄分布图表
class AgeChart extends BaseChart {
  update(data) {
    this.clear();
    console.log('年龄图表数据:', data);
    
    if (!data || !data.demographics || !data.demographics.age) {
      console.warn('缺少年龄数据');
      this.showNoData();
      return;
    }

    const ageGroups = {
      youth: '青少年',
      youngAdult: '青年',
      adult: '中年',
      senior: '老年'
    };

    const chartData = {
      labels: Object.values(ageGroups),
      datasets: [{
        label: '年龄分布',
        data: Object.keys(ageGroups).map(key => 
          data.demographics?.age?.[key] || 0
        ),
        backgroundColor: '#1877F2',
        borderRadius: 5
      }]
    };

    this.createChart('bar', chartData, {
      plugins: {
        title: {
          display: true,
          text: '目标受众年龄分布'
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          max: 1,
          ticks: {
            callback: value => `${Math.round(value * 100)}%`
          }
        }
      }
    });
  }
}

// 性别分布图表
class GenderChart extends BaseChart {
  update(data) {
    this.clear();
    
    const genderData = data.demographics?.gender || { male: 0, female: 0 };
    const chartData = {
      labels: ['男性', '女性'],
      datasets: [{
        data: [genderData.male || 0, genderData.female || 0],
        backgroundColor: ['#1877F2', '#E4405F']
      }]
    };

    this.createChart('doughnut', chartData, {
      plugins: {
        title: {
          display: true,
          text: '性别分布'
        }
      }
    });
  }
}

// 兴趣分布图表
class InterestsChart extends BaseChart {
  update(data) {
    this.clear();
    
    const interests = data.interests || {};
    const labels = {
      shopping: '购物',
      technology: '科技',
      fashion: '时尚',
      food: '美食',
      travel: '旅游',
      education: '教育',
      finance: '金融'
    };

    const chartData = {
      labels: Object.values(labels),
      datasets: [{
        label: '兴趣倾向',
        data: Object.keys(labels).map(key => interests[key] || 0),
        fill: true,
        backgroundColor: 'rgba(24, 119, 242, 0.2)',
        borderColor: '#1877F2',
        pointBackgroundColor: '#1877F2',
        pointBorderColor: '#fff',
        pointHoverBackgroundColor: '#fff',
        pointHoverBorderColor: '#1877F2'
      }]
    };

    this.createChart('radar', chartData, {
      scales: {
        r: {
          beginAtZero: true,
          max: 1,
          ticks: {
            callback: value => `${Math.round(value * 100)}%`
          }
        }
      }
    });
  }
}

// 关键词云图
class KeywordCloud extends BaseChart {
  update(data) {
    this.clear();
    
    // 创建词云容器
    const cloudContainer = document.createElement('div');
    cloudContainer.style.width = '100%';
    cloudContainer.style.height = '100%';
    this.container.appendChild(cloudContainer);

    // 处理关键词数据
    const words = Object.entries(data).map(([text, value]) => ({
      text,
      value: Math.log(value + 1) * 20, // 对数缩放
      color: this.getRandomColor()
    }));

    // 创建关键词元素
    words.forEach(word => {
      const span = document.createElement('span');
      span.textContent = word.text;
      span.style.fontSize = `${word.value}px`;
      span.style.color = word.color;
      span.style.margin = '5px';
      span.style.display = 'inline-block';
      cloudContainer.appendChild(span);
    });
  }

  getRandomColor() {
    const colors = ['#1877F2', '#42B72A', '#F7B928', '#E94F4F', '#4267B2'];
    return colors[Math.floor(Math.random() * colors.length)];
  }
}

// 互动指标图表
class EngagementChart extends BaseChart {
  update(data) {
    this.clear();
    
    const metrics = {
      likes: '点赞',
      comments: '评论',
      shares: '分享'
    };

    const chartData = {
      labels: Object.values(metrics),
      datasets: [
        {
          label: '平均数',
          data: Object.keys(metrics).map(key => 
            data.engagement?.average?.[key] || 0
          ),
          backgroundColor: '#1877F2'
        },
        {
          label: '总数',
          data: Object.keys(metrics).map(key => 
            data.engagement?.total?.[key] || 0
          ),
          backgroundColor: '#42B72A'
        }
      ]
    };

    this.createChart('bar', chartData, {
      plugins: {
        title: {
          display: true,
          text: '互动指标分析'
        }
      },
      scales: {
        y: {
          beginAtZero: true
        }
      }
    });
  }
}

// 效果分析图表
class EffectivenessChart extends BaseChart {
  update(data) {
    this.clear();
    
    const contentTypes = Object.keys(data);
    const metrics = ['likes', 'comments', 'shares'];
    const chartData = {
      labels: contentTypes,
      datasets: metrics.map((metric, index) => ({
        label: this.getMetricLabel(metric),
        data: contentTypes.map(type => 
          data[type]?.engagement?.[metric] || 0
        ),
        backgroundColor: this.getMetricColor(metric)
      }))
    };

    this.createChart('bar', chartData, {
      plugins: {
        title: {
          display: true,
          text: '内容类型效果分析'
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: '平均互动数'
          }
        }
      }
    });
  }

  getMetricLabel(metric) {
    const labels = {
      likes: '点赞',
      comments: '评论',
      shares: '分享'
    };
    return labels[metric] || metric;
  }

  getMetricColor(metric) {
    const colors = {
      likes: '#1877F2',
      comments: '#42B72A',
      shares: '#F7B928'
    };
    return colors[metric] || '#000000';
  }
} 