#!/bin/bash
# start-tunnel.sh — запускает localhost.run SSH туннель и обновляет .env
# Используется как ExecStart в systemd сервисе

ENV_FILE="/opt/bsuir-nexus/backend/.env"
LOG_FILE="/tmp/lhr-tunnel.log"

echo "Starting localhost.run SSH Tunnel..."

# Start ssh tunnel in background, capture output
ssh -R 80:localhost:80 nokey@localhost.run -o StrictHostKeyChecking=no 2>&1 | tee "$LOG_FILE" &
TUNNEL_PID=$!

# Wait for URL to appear in output (up to 30 seconds)
for i in $(seq 1 30); do
    sleep 1
    NEW_URL=$(grep -oP 'https://[a-zA-Z0-9-]+\.lhr\.life' "$LOG_FILE" | head -n 1)
    if [ -n "$NEW_URL" ]; then
        echo "✅ Tunnel URL: $NEW_URL"
        break
    fi
    echo "⏳ Waiting for tunnel URL... ($i/30)"
done

if [ -z "$NEW_URL" ]; then
    echo "❌ Could not get tunnel URL after 30 seconds"
    echo "Log contents:"
    cat "$LOG_FILE"
    # Still keep ssh running
    wait $TUNNEL_PID
    exit 1
fi

# Save URL
echo "$NEW_URL" > /tmp/cloudflare-tunnel-url.txt

# Update .env
if grep -q "WEBAPP_URL=" "$ENV_FILE"; then
    sed -i "s|WEBAPP_URL=.*|WEBAPP_URL=$NEW_URL|g" "$ENV_FILE"
else
    echo "WEBAPP_URL=$NEW_URL" >> "$ENV_FILE"
fi

if grep -q "BACKEND_URL=" "$ENV_FILE"; then
    sed -i "s|BACKEND_URL=.*|BACKEND_URL=$NEW_URL|g" "$ENV_FILE"
else
    echo "BACKEND_URL=$NEW_URL" >> "$ENV_FILE"
fi

echo "✅ Updated .env with: $NEW_URL"

# Restart backend to pick up new URL
sudo systemctl restart bsuir-backend
echo "✅ Backend restarted"

# Keep running (wait for tunnel to exit)
wait $TUNNEL_PID
