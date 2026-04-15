#!/bin/bash
# deploy.sh — Первоначальная настройка сервера Manjaro для BSUIR Nexus
# Запускать на сервере: bash deploy.sh
set -e

DOMAIN="busierhelper.at.by"
PROJECT_DIR="/opt/bsuir-nexus"
REPO_URL="https://github.com/Kabarab/bsuir_helper.git"

echo "============================================"
echo "  BSUIR Nexus — Настройка сервера Manjaro"
echo "  Домен: $DOMAIN"
echo "============================================"
echo ""

# ─── 1. Установка системных зависимостей ───
echo "📦 [1/9] Установка системных зависимостей..."
sudo pacman -Syu --noconfirm
sudo pacman -S --needed --noconfirm \
    python python-pip \
    nodejs npm \
    nginx \
    git \
    base-devel \
    certbot certbot-nginx

echo "✅ Зависимости установлены"

# ─── 2. Проверка проекта ───
echo ""
echo "📥 [2/9] Проверка файлов проекта..."
if [ -f "$PROJECT_DIR/backend/main.py" ]; then
    echo "✅ Файлы проекта найдены"
else
    echo "❌ Файлы проекта не найдены в $PROJECT_DIR"
    echo "   Скопируй проект с мака: rsync -avz ... admin@server:/opt/bsuir-nexus/"
    exit 1
fi

# ─── 3. Настройка бекенда ───
echo ""
echo "🐍 [3/9] Настройка Python бекенда..."
cd "$PROJECT_DIR/backend"

if [ ! -d "venv" ]; then
    python3 -m venv venv
fi
source venv/bin/activate
pip install -r requirements.txt --quiet
deactivate

echo "✅ Python бекенд настроен"

# ─── 4. Настройка .env ───
echo ""
echo "🔐 [4/9] Настройка .env..."
if [ ! -f "$PROJECT_DIR/backend/.env" ]; then
    echo "Создаю .env файл..."
    read -p "Введи BOT_TOKEN: " BOT_TOKEN
    cat > "$PROJECT_DIR/backend/.env" << EOF
BOT_TOKEN=$BOT_TOKEN
WEBAPP_URL=https://$DOMAIN
BACKEND_URL=https://$DOMAIN
EOF
    echo "✅ .env создан"
else
    # Обновляем URL'ы если .env уже существует
    if grep -q "WEBAPP_URL=" "$PROJECT_DIR/backend/.env"; then
        sed -i "s|WEBAPP_URL=.*|WEBAPP_URL=https://$DOMAIN|g" "$PROJECT_DIR/backend/.env"
    else
        echo "WEBAPP_URL=https://$DOMAIN" >> "$PROJECT_DIR/backend/.env"
    fi
    if grep -q "BACKEND_URL=" "$PROJECT_DIR/backend/.env"; then
        sed -i "s|BACKEND_URL=.*|BACKEND_URL=https://$DOMAIN|g" "$PROJECT_DIR/backend/.env"
    else
        echo "BACKEND_URL=https://$DOMAIN" >> "$PROJECT_DIR/backend/.env"
    fi
    echo "✅ .env обновлён с доменом $DOMAIN"
fi

# ─── 5. Сборка фронтенда ───
echo ""
echo "🔨 [5/9] Сборка фронтенда..."
cd "$PROJECT_DIR/frontend"
npm ci --silent 2>/dev/null || npm install --silent
npm run build
echo "✅ Фронтенд собран"

# ─── 6. Настройка Nginx ───
echo ""
echo "🌐 [6/9] Настройка Nginx..."

# Manjaro/Arch uses /etc/nginx/nginx.conf with http block
# We need to include our config
sudo mkdir -p /etc/nginx/sites-enabled /etc/nginx/sites-available
sudo cp "$PROJECT_DIR/server/nginx-bsuir-nexus.conf" /etc/nginx/sites-available/bsuir-nexus.conf
sudo ln -sf /etc/nginx/sites-available/bsuir-nexus.conf /etc/nginx/sites-enabled/bsuir-nexus.conf

# Ensure nginx.conf includes sites-enabled
if ! grep -q "sites-enabled" /etc/nginx/nginx.conf; then
    # Add include directive inside http block
    sudo sed -i '/http {/a\    include /etc/nginx/sites-enabled/*.conf;' /etc/nginx/nginx.conf
fi

# Comment out or remove default server block that might conflict
if [ -f "/etc/nginx/sites-enabled/default" ]; then
    sudo rm /etc/nginx/sites-enabled/default
fi

# Test config
sudo nginx -t
sudo systemctl enable nginx
sudo systemctl restart nginx
echo "✅ Nginx настроен и запущен"

# ─── 7. Установка systemd сервисов ───
echo ""
echo "⚙️  [7/9] Установка systemd сервисов..."

# Сделать скрипты исполняемыми
chmod +x "$PROJECT_DIR/server/update.sh"

# Копирование сервисов
sudo cp "$PROJECT_DIR/server/bsuir-backend.service" /etc/systemd/system/

# Разрешить admin перезапускать сервисы без пароля
echo "admin ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart bsuir-backend, /usr/bin/systemctl reload nginx, /usr/bin/systemctl restart nginx, /usr/bin/nginx" | sudo tee /etc/sudoers.d/bsuir-nexus > /dev/null

sudo systemctl daemon-reload
sudo systemctl enable bsuir-backend

echo "✅ Systemd сервисы установлены"

# ─── 8. Запуск бекенда ───
echo ""
echo "🚀 [8/9] Запуск бекенда..."
sudo systemctl start bsuir-backend
echo "✅ Бекенд запущен"

# Проверка
sleep 2
if curl -s http://localhost:8000/health | grep -q "ok"; then
    echo "✅ Backend health check passed"
else
    echo "⚠️  Backend health check failed — проверь логи: journalctl -u bsuir-backend"
fi

# ─── 9. SSL сертификат (Let's Encrypt) ───
echo ""
echo "🔒 [9/9] Получение SSL сертификата..."
echo ""
echo "⚠️  Перед этим шагом убедись, что:"
echo "   1. A-запись busierhelper.at.by → $(curl -s ifconfig.me) настроена на domain.by"
echo "   2. Порты 80 и 443 открыты (port forwarding на роутере)"
echo ""
read -p "A-запись настроена и порты открыты? (y/n): " READY

if [ "$READY" = "y" ]; then
    sudo certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --email admin@$DOMAIN --redirect
    echo "✅ SSL сертификат установлен!"
    
    # Certbot auto-renewal
    sudo systemctl enable certbot-renew.timer
    sudo systemctl start certbot-renew.timer
    echo "✅ Автообновление сертификата настроено"
else
    echo "⏭  SSL пропущен. Запусти позже:"
    echo "   sudo certbot --nginx -d $DOMAIN"
fi

echo ""
echo "============================================"
echo "  ✅ Деплой завершён!"
echo "============================================"
echo ""
echo "Публичный IP: $(curl -s ifconfig.me)"
echo "Домен: $DOMAIN"
echo ""
echo "📋 Настройка DNS на domain.by:"
echo "   1. Зайди в DNS-редактор на domain.by"
echo "   2. Добавь A-запись: busierhelper.at.by → $(curl -s ifconfig.me)"
echo "   3. Открой порты 80 и 443 на роутере (port forwarding)"
echo ""
echo "Полезные команды:"
echo "  sudo systemctl status bsuir-backend   — статус бекенда"
echo "  sudo journalctl -u bsuir-backend -f   — логи бекенда"
echo "  sudo nginx -t && sudo systemctl reload nginx — перезагрузить nginx"
echo "  bash /opt/bsuir-nexus/server/update.sh — обновить после git push"
echo "  sudo certbot --nginx -d $DOMAIN        — получить SSL"
