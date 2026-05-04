#!/usr/bin/env python3
"""
Diagnostic script for BSUIR Nexus bot issues.
Run on the server: python scripts/diagnose_bot.py

Checks:
1. Environment variables
2. Webhook status
3. Bot info
4. SSL certificate
"""
import os
import sys
import asyncio
import aiohttp

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env'))


async def main():
    token = os.getenv("BOT_TOKEN")
    backend_url = os.getenv("BACKEND_URL", "")
    webapp_url = os.getenv("WEBAPP_URL", "")
    
    print("=" * 60)
    print("  BSUIR Nexus Bot Diagnostics")
    print("=" * 60)
    
    # 1. Check env vars
    print("\n📋 Environment Variables:")
    print(f"  BOT_TOKEN: {'✅ Set (' + token[:10] + '...)' if token else '❌ NOT SET'}")
    print(f"  BACKEND_URL: {backend_url or '❌ NOT SET'}")
    print(f"  WEBAPP_URL: {webapp_url or '❌ NOT SET'}")
    
    expected_webhook = backend_url + "/api/bot/webhook" if backend_url else "N/A"
    print(f"  Expected webhook: {expected_webhook}")
    
    if not token:
        print("\n❌ BOT_TOKEN is not set. Cannot proceed.")
        return
    
    api_base = f"https://api.telegram.org/bot{token}"
    
    async with aiohttp.ClientSession() as session:
        # 2. Get bot info
        print("\n🤖 Bot Info:")
        async with session.get(f"{api_base}/getMe") as resp:
            data = await resp.json()
            if data.get("ok"):
                bot = data["result"]
                print(f"  Username: @{bot['username']}")
                print(f"  Name: {bot.get('first_name', '?')}")
                print(f"  ID: {bot['id']}")
            else:
                print(f"  ❌ Error: {data}")
                return
        
        # 3. Get webhook info
        print("\n🔗 Webhook Status:")
        async with session.get(f"{api_base}/getWebhookInfo") as resp:
            data = await resp.json()
            if data.get("ok"):
                wh = data["result"]
                wh_url = wh.get("url", "")
                print(f"  Current URL: {wh_url or '❌ NOT SET (polling mode)'}")
                print(f"  Expected URL: {expected_webhook}")
                
                if wh_url == expected_webhook:
                    print(f"  ✅ URL matches!")
                elif wh_url:
                    print(f"  ⚠️  URL MISMATCH! This is likely the problem.")
                    print(f"     Telegram is sending updates to: {wh_url}")
                    print(f"     But your server expects them at: {expected_webhook}")
                else:
                    print(f"  ❌ No webhook set! Bot is in polling mode.")
                
                print(f"  Pending updates: {wh.get('pending_update_count', 0)}")
                
                if wh.get("last_error_date"):
                    from datetime import datetime
                    err_time = datetime.fromtimestamp(wh["last_error_date"])
                    print(f"  ❌ Last error: {wh.get('last_error_message', '?')}")
                    print(f"     Error time: {err_time}")
                else:
                    print(f"  ✅ No recent errors")
                
                print(f"  Max connections: {wh.get('max_connections', '?')}")
                print(f"  Allowed updates: {wh.get('allowed_updates', 'all')}")
            else:
                print(f"  ❌ Error: {data}")
        
        # 4. Test webhook URL accessibility
        if backend_url:
            print(f"\n🌐 Testing server accessibility:")
            try:
                async with session.get(f"{backend_url}/health", timeout=aiohttp.ClientTimeout(total=10)) as resp:
                    if resp.status == 200:
                        health = await resp.json()
                        print(f"  ✅ Health check: {health}")
                    else:
                        print(f"  ❌ Health check failed: HTTP {resp.status}")
            except Exception as e:
                print(f"  ❌ Cannot reach {backend_url}: {e}")
            
            # Test webhook endpoint
            try:
                async with session.post(f"{expected_webhook}", json={"update_id": 0}, timeout=aiohttp.ClientTimeout(total=10)) as resp:
                    print(f"  Webhook endpoint response: HTTP {resp.status}")
                    if resp.status == 200:
                        print(f"  ✅ Webhook endpoint reachable")
                    elif resp.status == 422:
                        print(f"  ✅ Webhook endpoint reachable (422 is normal for dummy data)")
                    else:
                        text = await resp.text()
                        print(f"  ⚠️  Response: {text[:200]}")
            except Exception as e:
                print(f"  ❌ Cannot reach webhook endpoint: {e}")
    
    # 5. Recommendations
    print("\n" + "=" * 60)
    print("  Recommendations")
    print("=" * 60)
    print("""
1. If webhook URL is mismatched:
   - On the server, run: curl -X POST http://localhost:8000/api/debug/reset_webhook
   - Or restart the backend: sudo systemctl restart bsuir-backend

2. If webhook shows errors like 'SSL certificate problem':
   - Check: sudo certbot certificates
   - Renew: sudo certbot renew

3. If webhook URL points to trycloudflare.com:
   - Someone ran restart_all.sh on the Mac, which overwrote the webhook
   - Fix by restarting the server backend: sudo systemctl restart bsuir-backend

4. If there are pending_updates > 0:
   - Telegram has updates queued but can't deliver them
   - Check nginx: sudo nginx -t && sudo systemctl status nginx
   - Check backend: sudo systemctl status bsuir-backend
   - Check logs: sudo journalctl -u bsuir-backend -n 50
""")


if __name__ == "__main__":
    asyncio.run(main())
