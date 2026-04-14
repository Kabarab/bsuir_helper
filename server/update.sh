#!/bin/bash
# update.sh — обновление проекта на сервере после git push
set -e

PROJECT_DIR="/opt/bsuir-nexus"
cd "$PROJECT_DIR"

echo "=== Обновление BSUIR Nexus ==="
echo "$(date '+%Y-%m-%d %H:%M:%S')"

# 1. Pull latest changes
echo "📥 Pulling latest changes..."
git pull origin main

# 2. Update backend dependencies
echo "📦 Updating backend dependencies..."
cd backend
source venv/bin/activate
pip install -r requirements.txt --quiet
deactivate
cd ..

# 3. Rebuild frontend
echo "🔨 Building frontend..."
cd frontend
npm ci --silent 2>/dev/null || npm install --silent
npm run build
cd ..

# 4. Restart services
echo "🔄 Restarting services..."
sudo systemctl restart bsuir-backend
echo "✅ Backend restarted"

# Nginx reload (in case config changed)
sudo nginx -t && sudo systemctl reload nginx
echo "✅ Nginx reloaded"

# 5. Health check
sleep 2
if curl -s http://localhost:8000/health | grep -q "ok"; then
    echo "✅ Health check passed"
else
    echo "⚠️  Health check failed — check logs: journalctl -u bsuir-backend -n 50"
fi

echo "=== Обновление завершено ==="
