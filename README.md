# 摸鱼计算器 · 🐂 精神股东变现神器

上班拉磨看变现，带薪摸鱼白嫖爽 💸
采用前后端分离架构，支持用户登录注册、设备长效免密登录、打工与摸鱼实时云端同步、每日工资表流水自动归档，以及波普/新野兽派风格的管理监控看板。

---

## 📁 目录结构

```
moyu/
├── frontend/               # 前端项目 (React 19 + Vite + TypeScript)
│   ├── src/
│   │   ├── api/            # API 客户端封装 (Token + 设备ID)
│   │   ├── components/     # UI 组件 (TimePicker 时间滚轮选择器等)
│   │   ├── pages/
│   │   │   ├── Home.tsx    # 摸鱼计算器主站 (牛马时钟、摸鱼分类打卡、物价换算)
│   │   │   ├── Login.tsx   # 登录与注册 (图形防机器人验证码、长效免密绑定)
│   │   │   └── Admin.tsx   # 老板/管理监控后台 (多维统计看板、工资表流水、员工档案)
│   │   └── App.tsx         # 路由配置 (/, /login, /admin)
│   ├── package.json
│   └── vite.config.ts
├── backend/                # 后端项目 (Python FastAPI + SQLAlchemy + MySQL)
│   ├── app/
│   │   ├── api/            # API 路由 (auth, profile, records, salary, admin)
│   │   ├── core/           # 核心配置 (config, database, security)
│   │   ├── models/         # 数据库模型 (users, user_profiles, slack_records, daily_salaries)
│   │   └── schemas/        # Pydantic 数据校验模型
│   ├── .env.example        # 环境变量配置模板
│   ├── requirements.txt    # Python 依赖清单
│   └── main.py             # FastAPI 服务入口 (端口 8080)
└── .gitignore
```

---

## 🛠️ 本地运行指南

### 1. 后端启动 (FastAPI)
```bash
cd backend

# 安装依赖
pip install -r requirements.txt

# 配置环境变量 (首次启动请参考 .env.example 创建 .env，配置 MySQL 8.0 连接参数)
# 启动服务 (默认端口 8080)
python main.py
```
> 后端启动时会自动在 MySQL 中创建所需的数据表，并初始化超级管理员账号：`admin` / `admin123`。
> 访问交互式 API 文档：`http://localhost:8080/docs`

### 2. 前端启动 (Vite)
```bash
cd frontend

# 安装依赖
npm install

# 启动开发服务器 (端口 3000)
npm run dev

# 编译打包生产产物
npm run build
```

---

## 🚀 宝塔服务器部署指南

### 1. 数据库准备
在宝塔面板的【数据库】中新建 MySQL 数据库 `moyu_db`，字符集选择 `utf8mb4`。

### 2. 后端部署 (Python 项目管理器 / 宝塔面板)
1. 将 `backend` 目录上传到宝塔服务器。
2. 复制 `.env.example` 为 `.env`，修改其中的 `DATABASE_URL` 为服务器实际的 MySQL 账号密码：
   ```env
   DATABASE_URL=mysql+pymysql://数据库用户:数据库密码@127.0.0.1:3306/moyu_db?charset=utf8mb4
   ```
3. 在宝塔【网站】->【Python 项目】中添加项目：
   - 启动文件：`main.py`
   - 运行端口：`8080`
   - 勾选自动安装 `requirements.txt` 依赖。

### 3. 前端部署 (Nginx 静态网站)
1. 在本地或宝塔执行 `npm run build` 生成 `frontend/dist` 静态资源目录。
2. 在宝塔中新建静态网站，将网站根目录指向 `dist` 目录。
3. 配置 Nginx 反向代理与前端路由回退：
   ```nginx
   # 支持 SPA 页面路由
   location / {
       try_files $uri $uri/ /index.html;
   }

   # 后端 API 接口反向代理至 8080
   location /api/ {
       proxy_pass http://127.0.0.1:8080/api/;
       proxy_set_header Host $host;
       proxy_set_header X-Real-IP $remote_addr;
       proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
   }
   ```
