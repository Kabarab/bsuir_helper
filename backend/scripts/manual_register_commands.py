import asyncio
import os
import sys

# Add backend to path
sys.path.append(os.getcwd())

from bot.bot import bot, register_commands

async def main():
    print("Manually registering bot commands...")
    try:
        await register_commands()
        print("Success! Commands should now appear in Telegram (try restarting the app if not).")
    except Exception as e:
        print(f"Error: {e}")
    finally:
        await bot.session.close()

if __name__ == "__main__":
    asyncio.run(main())
