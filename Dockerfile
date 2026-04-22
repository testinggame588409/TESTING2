# 使用官方 Node.js 18 LTS（包含完整編譯工具）
FROM node:18-bullseye-slim

# 安裝 better-sqlite3 所需的編譯工具
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# 設定工作目錄
WORKDIR /app

# 先複製 package.json，利用 Docker 快取加速重複構建
COPY package.json ./

# 安裝 Node.js 依賴（包含編譯 better-sqlite3）
RUN npm install --production

# 複製所有項目文件
COPY . .

# Railway 會自動注入 PORT 環境變數
ENV PORT=3000

# 啟動服務
CMD ["node", "server/server.js"]
