import os
from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram.filters import CommandStart
from aiogram.types import Message, InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo
from dotenv import load_dotenv

load_dotenv()

BOT_TOKEN = os.getenv("BOT_TOKEN")
# TODO: Замените на реальный URL Web App (например, ngrok URL при локальном деве)
WEBAPP_URL = os.getenv("WEBAPP_URL") 

if not WEBAPP_URL:
    print("WARNING: WEBAPP_URL is not set!")

bot = Bot(token=BOT_TOKEN, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
dp = Dispatcher()

# For webhooks
from aiogram.webhook.aiohttp_server import SimpleRequestHandler, setup_application

async def setup_menu_button():
    print(f"Executing setup_menu_button with URL: {WEBAPP_URL}", flush=True)
    if WEBAPP_URL:
        try:
            from aiogram.types import MenuButtonWebApp, WebAppInfo
            await bot.set_chat_menu_button(
                menu_button=MenuButtonWebApp(
                    text="Nexus",
                    web_app=WebAppInfo(url=WEBAPP_URL)
                )
            )
            print("Menu button successfully updated in Telegram.", flush=True)
        except Exception as e:
            print(f"ERROR setting menu button: {e}", flush=True)
    else:
        print("WARNING: Cannot set menu button - WEBAPP_URL is empty.", flush=True)

from services.bsuir_api import (
    fetch_student_groups, fetch_faculties, fetch_specialities
)
from services.rating import rating_service
from database.core import engine
from database.models import User
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from aiogram.filters import Command

@dp.message(Command("week"))
async def cmd_week(message: Message):
    data = await fetch_current_week()
    if isinstance(data, dict) and "error" in data:
        await message.answer("Ошибка получения текущей недели.")
    else:
        await message.answer(f"Текущая учебная неделя: <b>{data}</b>")

@dp.message(Command("teacher"))
async def cmd_teacher(message: Message):
    args = message.text.split(maxsplit=1)
    if len(args) < 2:
        await message.answer("Пожалуйста, введите имя преподавателя.\nПример: <code>/teacher Иванов</code>")
        return
    
    query = args[1].lower()
    employees = await fetch_all_employees()
    
    if isinstance(employees, dict) and "error" in employees:
        await message.answer("Ошибка получения списка преподавателей.")
        return
        
    results = [
        emp["fio"] for emp in employees 
        if query in emp.get("fio", "").lower() or query in emp.get("lastName", "").lower()
    ]
    
    if not results:
        await message.answer("Преподаватель не найден.")
    else:
        # Show top 5 matches
        response = "Найденные преподаватели:\n" + "\n".join(f"• {r}" for r in results[:5])
        if len(results) > 5:
            response += f"\nИ еще {len(results) - 5}..."
        await message.answer(response)

@dp.message(Command("groups"))
async def cmd_groups(message: Message):
    args = message.text.split(maxsplit=1)
    if len(args) < 2:
        await message.answer("Введите номер группы.\nПример: <code>/groups 123456</code>")
        return
        
    query = args[1]
    groups = await fetch_student_groups()
    
    if isinstance(groups, dict) and "error" in groups:
        await message.answer("Ошибка получения списка групп.")
        return
        
    results = [g["name"] for g in groups if query in g.get("name", "")]
    
    if not results:
        await message.answer("Группа не найдена.")
    else:
        response = "Найденные группы:\n" + "\n".join(f"• {r}" for r in results[:5])
        await message.answer(response)

@dp.message(Command("faculties"))
async def cmd_faculties(message: Message):
    facs = await fetch_faculties()
    if isinstance(facs, dict) and "error" in facs:
        await message.answer("Ошибка получения списка факультетов.")
        return
        
    response = "Факультеты БГУИР:\n" + "\n".join(f"• {f.get('abbrev', '')} - {f.get('name', '')}" for f in facs)
    await message.answer(response)

@dp.message(Command("specialities"))
async def cmd_specialities(message: Message):
    specs = await fetch_specialities()
    if isinstance(specs, dict) and "error" in specs:
        await message.answer("Ошибка получения списка специальностей.")
        return
        
    # There might be many, let's limit to top 15 or show a link
    response = "Специальности БГУИР:\n" + "\n".join(f"• {s.get('abbrev', '')} - {s.get('name', '')}" for s in specs[:15])
    if len(specs) > 15:
        response += "\n...\n(Показаны первые 15)"
    await message.answer(response)


@dp.message(Command("rating"))
async def cmd_rating(message: Message):
    async with AsyncSession(engine) as db:
        result = await db.execute(select(User).where(User.telegram_id == message.from_user.id))
        user = result.scalars().first()
        
        if not user or not user.bsuir_id:
            await message.answer(
                "У вас не привязан номер зачетки!\n"
                "Используйте команду <code>/setid Ваш_ID</code> (например <code>/setid 56841038</code>) "
                "или укажите его в настройках Web App."
            )
            return

        status_msg = await message.answer("⌛ Получаю данные из ИИС БГУИР...")
        rating_res = await rating_service.fetch_student_rating(user.bsuir_id)
        
        if not rating_res.get("success"):
            await status_msg.edit_text(f"❌ Ошибка подключения к ИИС: {rating_res.get('error')}")
            return
            
        data = rating_res["data"]
        # Format the response
        response = f"📊 <b>Рейтинг студента ({data.get('studentCardNumber', user.bsuir_id)})</b>\n\n"
        response += f"🌟 Средний балл: <b>{data.get('average', 'N/A')}</b>\n"
        
        # We can add more info if available in 'data'
        await status_msg.edit_text(response)

@dp.message(Command("setid"))
async def cmd_setid(message: Message):
    args = message.text.split(maxsplit=1)
    if len(args) < 2 or not args[1].isdigit():
        await message.answer("Пожалуйста, введите корректный номер зачетки.\nПример: <code>/setid 56841038</code>")
        return
    
    bsuir_id = args[1]
    async with AsyncSession(engine) as db:
        result = await db.execute(select(User).where(User.telegram_id == message.from_user.id))
        user = result.scalars().first()
        
        if not user:
            user = User(telegram_id=message.from_user.id, bsuir_id=bsuir_id)
            db.add(user)
        else:
            user.bsuir_id = bsuid_id
            
        # Try to set group automatically
        if len(bsuir_id) >= 7:
            user.bsuir_group = bsuir_id[:6]
            
        await db.commit()
        await message.answer(f"✅ Номер зачетки <b>{bsuir_id}</b> успешно привязан!")
        
@dp.message(Command("notify"))
async def cmd_notify(message: Message):
    args = message.text.split(maxsplit=1)
    if len(args) < 2 or not args[1].isdigit():
        await message.answer(
            "Введите время уведомления в минутах.\n"
            "Пример: <code>/notify 15</code> (предупредит за 15 минут до начала)"
        )
        return
    
    offset = int(args[1])
    async with AsyncSession(engine) as db:
        result = await db.execute(select(User).where(User.telegram_id == message.from_user.id))
        user = result.scalars().first()
        
        if not user:
            user = User(telegram_id=message.from_user.id, notification_offset=offset)
            db.add(user)
        else:
            user.notification_offset = offset
            
        await db.commit()
        await message.answer(f"✅ Уведомления будут приходить за <b>{offset}</b> мин. до начала!")

@dp.message(CommandStart())
async def cmd_start(message: Message):
    await setup_menu_button() # Re-ensure menu button is set
    markup = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="📱 Открыть BSUIR Nexus", web_app=WebAppInfo(url=WEBAPP_URL))]
    ])
    await message.answer(
        "Привет! Я — твой цифровой помощник <b>BSUIR Nexus</b>.\n\n"
        "⏰ Я могу уведомлять тебя о предстоящих задачах и парах. "
        "По умолчанию уведомляю за 10 минут, но ты можешь изменить это командой <code>/notify минуты</code>.\n\n"
        "Нажми на кнопку ниже, чтобы открыть планер задач, расписание и полезные утилиты!",
        reply_markup=markup
    )
