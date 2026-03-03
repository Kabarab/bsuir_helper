import requests
import os
from dotenv import load_dotenv

load_dotenv()
token = os.getenv("BOT_TOKEN")
if token:
    res = requests.get(f"https://api.telegram.org/bot{token}/getWebhookInfo")
    print(res.json())
else:
    print("NO TOKEN")
