const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');
const path = require('path');

const app = express();

// ✅ 关键修改：使用环境变量提供的端口，或默认 3000
const PORT = process.env.PORT || 3000;

// ✅ 关键修改：适配 Vercel 的无服务器环境
// 在 Vercel 上，__dirname 会变化，我们需要动态路径
const dbPath = process.env.NODE_ENV === 'production' 
  ? '/tmp/coupons.db'  // Vercel 的临时目录，可写
  : './coupons.db';

const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
  if (err) console.error('数据库连接错误:', err.message);
});

// 中间件
app.use(bodyParser.json());
app.use(express.static('public'));

// 建表
db.run(`CREATE TABLE IF NOT EXISTS coupons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  couponId TEXT UNIQUE NOT NULL,
  employeeId TEXT NOT NULL,
  employeeName TEXT NOT NULL,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  verified INTEGER DEFAULT 0
)`);

// 创建券
app.post('/api/create-coupon', (req, res) => {
  const { employeeId, employeeName } = req.body;
  const rawId = `${employeeId}-${Date.now()}`;
  const couponId = crypto.randomBytes(6).toString('hex'); // 更简单的生成方式
  
  // ✅ 关键修改：生成二维码时使用正确的公网域名
  // 注意：这里还不能确定最终域名，先留空，部署成功后再改
  const qrCodeData = couponId; // 暂时只用纯核销码，部署后可以改为完整URL
  
  db.run('INSERT INTO coupons (couponId, employeeId, employeeName) VALUES (?, ?, ?)',
    [couponId, employeeId, employeeName],
    function(err) {
      if (err) {
        console.error('插入数据库错误:', err);
        res.status(500).json({ error: '创建失败' });
      } else {
        res.json({ 
          success: true, 
          couponId, 
          qrCodeData: qrCodeData // 返回纯核销码
        });
      }
    }
  );
});

// 核销券
app.post('/api/verify-coupon', (req, res) => {
  const { couponId } = req.body;
  db.get('SELECT * FROM coupons WHERE couponId = ?', [couponId], (err, row) => {
    if (err || !row) {
      return res.json({ success: false, message: '核销码不存在' });
    }
    if (row.verified === 1) {
      return res.json({ success: false, message: '已核销' });
    }
    db.run('UPDATE coupons SET verified = 1 WHERE couponId = ?', [couponId], (err) => {
      res.json({ 
        success: !err, 
        message: !err ? '核销成功' : '核销失败', 
        employeeName: row.employeeName 
      });
    });
  });
});

// 健康检查
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString()
  });
});

// 只有不在 Vercel 环境时才监听端口
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`服务器运行: http://localhost:${PORT}`);
  });
}

module.exports = app;
