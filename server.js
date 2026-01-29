const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');

const app = express();

// 中间件
app.use(express.json());
// ✅ 核心修复：静态文件服务，必须放在最前面
app.use(express.static(path.join(__dirname, 'public')));

// 数据库连接（Vercel 环境使用临时目录）
const dbPath = process.env.NODE_ENV === 'production' ? '/tmp/coupons.db' : './coupons.db';
const db = new sqlite3.Database(dbPath);

// 建表
db.run(`CREATE TABLE IF NOT EXISTS coupons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    couponId TEXT UNIQUE NOT NULL,
    employeeId TEXT NOT NULL,
    employeeName TEXT NOT NULL,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    verified INTEGER DEFAULT 0
)`);

// ✅ 核心修复：显式定义根路由，确保能打开首页
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 创建核销券API
app.post('/api/create-coupon', (req, res) => {
    const { employeeId, employeeName } = req.body;
    const couponId = crypto.randomBytes(6).toString('hex');
    // 使用你的真实域名
    const qrCodeData = `https://coupon-system.vercel.app/verify.html?code=${couponId}`;

    db.run('INSERT INTO coupons (couponId, employeeId, employeeName) VALUES (?, ?, ?)',
        [couponId, employeeId, employeeName],
        function (err) {
            if (err) {
                res.status(500).json({ error: '创建失败' });
            } else {
                res.json({ success: true, couponId, qrCodeData });
            }
        }
    );
});

// 核销券API
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
    res.json({ status: 'ok', message: '礼盒核销系统运行正常' });
});

// ✅ 核心修复：移除之前那个返回 “Invalid endpoint” 的兜底错误路由
// 确保上面没有这个：app.use((req, res) => { ... });

// 导出给 Vercel
module.exports = app;
