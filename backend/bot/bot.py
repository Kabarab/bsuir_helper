import os
import json
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from aiogram import Bot, Dispatcher, F
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram.filters import CommandStart, Command
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import (
    Message, InlineKeyboardMarkup, InlineKeyboardButton,
    WebAppInfo, BotCommand, CallbackQuery
)
from dotenv import load_dotenv

load_dotenv()

BOT_TOKEN = os.getenv("BOT_TOKEN")
WEBAPP_URL = os.getenv("WEBAPP_URL")

if not WEBAPP_URL:
    print("WARNING: WEBAPP_URL is not set!")

bot = Bot(token=BOT_TOKEN, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
dp = Dispatcher()

MINSK_TZ = ZoneInfo("Europe/Minsk")

# Day name mapping (API uses Russian)
WEEKDAY_NAMES = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"]
WEEKDAY_EMOJI = {"Понедельник": "🟢", "Вторник": "🔵", "Среда": "🟣", "Четверг": "🟠", "Пятница": "🔴", "Суббота": "🟡", "Воскресенье": "⚪"}
LESSON_TYPE_EMOJI = {"ЛК": "📖", "ПЗ": "📝", "ЛР": "🔬", "Экзамен": "🎓", "Консультация": "💬"}

# For webhooks
from aiogram.webhook.aiohttp_server import SimpleRequestHandler, setup_application

from services.bsuir_api import (
    fetch_student_groups, fetch_faculties, fetch_specialities,
    fetch_schedule, fetch_current_week, fetch_all_employees,
    fetch_group_rating, get_group_info
)
from services.rating import rating_service
from database.core import engine, SessionLocal
from database.models import User
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select


# ──────────── FSM States ────────────

class OnboardingStates(StatesGroup):
    waiting_group = State()
    waiting_student_id = State()
    waiting_subgroup = State()

class SettingsStates(StatesGroup):
    waiting_group = State()
    waiting_subgroup = State()


# ──────────── Helper: get or create user ────────────

async def get_or_create_user(telegram_id: int) -> User:
    async with SessionLocal() as db:
        result = await db.execute(select(User).where(User.telegram_id == telegram_id))
        user = result.scalars().first()
        if not user:
            user = User(telegram_id=telegram_id)
            db.add(user)
            await db.commit()
            await db.refresh(user)
        return user


# ──────────── Helper: App Keyboard ────────────

def get_app_kb(path: str = "") -> InlineKeyboardMarkup:
    """Create a keyboard with a button to open the Web App at a specific path."""
    url = f"{WEBAPP_URL}{path}"
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="📱 Открыть в приложении", web_app=WebAppInfo(url=url))]
    ])


# ──────────── Helper: format schedule ────────────

def format_lesson(lesson: dict, subgroup: int = 0) -> str | None:
    """Format a single lesson. Returns None if filtered out by subgroup."""
    lesson_subgroups = lesson.get("numSubgroup", 0)
    if subgroup != 0 and lesson_subgroups != 0 and lesson_subgroups != subgroup:
        return None

    lesson_type = lesson.get("lessonTypeAbbrev", "")
    emoji = LESSON_TYPE_EMOJI.get(lesson_type, "📌")
    subject = lesson.get("subject", lesson.get("subjectFullName", "—"))
    start = lesson.get("startLessonTime", "??:??")
    end = lesson.get("endLessonTime", "??:??")
    auditory = ", ".join(lesson.get("auditories", [])) or "—"
    
    teachers = []
    for emp in lesson.get("employees", []):
        teachers.append(emp.get("fio", emp.get("lastName", "")))
    teacher_str = ", ".join(teachers) if teachers else ""

    note = lesson.get("note", "")
    note_str = f"\n       💬 <i>{note}</i>" if note else ""

    sub_str = f" (подгр. {lesson_subgroups})" if lesson_subgroups else ""

    line = f"  {emoji} <b>{start}–{end}</b> | {subject}{sub_str}\n"
    line += f"       {lesson_type} · ауд. {auditory}"
    if teacher_str:
        line += f"\n       👤 {teacher_str}"
    line += note_str
    return line


def format_day_schedule(day_name: str, lessons: list, week_num: int, subgroup: int = 0) -> str:
    """Format lessons for one day, filtering by week and subgroup."""
    emoji = WEEKDAY_EMOJI.get(day_name, "📅")
    lines = [f"\n{emoji} <b>{day_name}</b>"]
    has_lessons = False

    for lesson in lessons:
        week_numbers = lesson.get("weekNumber", [])
        if week_numbers and week_num not in week_numbers:
            continue
        formatted = format_lesson(lesson, subgroup)
        if formatted:
            lines.append(formatted)
            has_lessons = True

    if not has_lessons:
        lines.append("  🏖 Нет пар")

    return "\n".join(lines)


async def get_schedule_for_days(group: str, subgroup: int, week_num: int, day_names: list[str]) -> str:
    """Fetch and format schedule for specific days."""
    schedule_data = await fetch_schedule(group)
    if isinstance(schedule_data, dict) and "error" in schedule_data:
        return f"❌ Ошибка получения расписания: {schedule_data['error']}"

    schedules = schedule_data.get("schedules", {})
    if not schedules:
        return "📭 Расписание не найдено для данной группы."

    result_parts = []
    for day_name in day_names:
        day_lessons = schedules.get(day_name, [])
        result_parts.append(format_day_schedule(day_name, day_lessons, week_num, subgroup))

    return "\n".join(result_parts)


# ──────────── Menu button ────────────

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


async def register_commands():
    """Register bot commands for autocomplete in Telegram."""
    commands = [
        BotCommand(command="start", description="🚀 Запуск бота и первичная настройка"),
        BotCommand(command="help", description="📚 Справка по командам"),
        BotCommand(command="today", description="📅 Расписание на сегодня"),
        BotCommand(command="tomorrow", description="📅 Расписание на завтра"),
        BotCommand(command="week", description="🗓 Расписание на текущую неделю"),
        BotCommand(command="next_week", description="🗓 Расписание на следующую неделю"),
        BotCommand(command="settings", description="⚙️ Смена группы и подгруппы"),
        BotCommand(command="marks", description="📊 Текущие оценки"),
        BotCommand(command="rating", description="🏆 Позиция в рейтинге"),
    ]
    await bot.set_my_commands(commands)
    print("Bot commands registered for autocomplete.", flush=True)


# ──────────── /start ────────────

@dp.message(CommandStart())
async def cmd_start(message: Message, state: FSMContext):
    await state.clear()
    await setup_menu_button()

    # Check if user already exists with a group set
    user = await get_or_create_user(message.from_user.id)

    if user.bsuir_group:
        # User already configured — show welcome back
        markup = InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="📱 Открыть BSUIR Nexus", web_app=WebAppInfo(url=WEBAPP_URL))]
        ])
        await message.answer(
            f"С возвращением в <b>BSUIR Nexus</b>! 👋\n\n"
            f"🎓 Группа: <b>{user.bsuir_group}</b>\n"
            f"📋 Подгруппа: <b>{user.bsuir_subgroup or 'не выбрана'}</b>\n"
            f"🆔 Зачётка: <b>{user.bsuir_id or 'не указана'}</b>\n\n"
            f"Используй /help для списка команд или /settings для изменения настроек.",
            reply_markup=get_app_kb("/#/schedule")
        )
        return

    # New user — start onboarding
    await message.answer(
        "Привет! 👋 Я — твой цифровой помощник <b>BSUIR Nexus</b>.\n\n"
        "Давай настроим бота для тебя!\n\n"
        "📝 <b>Введи номер своей группы</b> (например: <code>453501</code>):"
    )
    await state.set_state(OnboardingStates.waiting_group)


@dp.message(OnboardingStates.waiting_group)
async def onboarding_group(message: Message, state: FSMContext):
    group_name = message.text.strip()

    # Validate group exists
    status_msg = await message.answer("🔍 Ищу группу...")
    groups = await fetch_student_groups()
    if isinstance(groups, dict) and "error" in groups:
        await status_msg.edit_text("❌ Не удалось проверить группу. Попробуй ещё раз:")
        return

    found = any(g.get("name") == group_name for g in groups)
    if not found:
        # Try partial match
        matches = [g["name"] for g in groups if group_name in g.get("name", "")][:5]
        if matches:
            hint = "\n".join(f"• <code>{m}</code>" for m in matches)
            await status_msg.edit_text(
                f"❌ Группа <b>{group_name}</b> не найдена.\n\n"
                f"Возможно, ты имел в виду:\n{hint}\n\n"
                f"Попробуй ещё раз:"
            )
        else:
            await status_msg.edit_text(
                f"❌ Группа <b>{group_name}</b> не найдена.\n"
                "Проверь номер и попробуй ещё раз:"
            )
        return

    await state.update_data(group=group_name)
    await status_msg.edit_text(
        f"✅ Группа <b>{group_name}</b> найдена!\n\n"
        f"🆔 Теперь введи <b>номер зачётной книжки</b>\n"
        f"(например: <code>56841038</code>).\n\n"
        f"Если не хочешь — отправь <code>-</code> (оценки и рейтинг не будут доступны)."
    )
    await state.set_state(OnboardingStates.waiting_student_id)


@dp.message(OnboardingStates.waiting_student_id)
async def onboarding_student_id(message: Message, state: FSMContext):
    text = message.text.strip()
    student_id = None if text == "-" else text

    if student_id and not student_id.isdigit():
        await message.answer("❌ Номер зачётки должен содержать только цифры. Попробуй ещё раз:")
        return

    await state.update_data(student_id=student_id)

    keyboard = InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(text="1️⃣ Подгруппа 1", callback_data="subgroup_1"),
            InlineKeyboardButton(text="2️⃣ Подгруппа 2", callback_data="subgroup_2"),
        ],
        [InlineKeyboardButton(text="🔄 Обе подгруппы", callback_data="subgroup_0")]
    ])
    await message.answer(
        "📋 <b>Выбери свою подгруппу:</b>",
        reply_markup=keyboard
    )
    await state.set_state(OnboardingStates.waiting_subgroup)


@dp.callback_query(OnboardingStates.waiting_subgroup, F.data.startswith("subgroup_"))
async def onboarding_subgroup(callback: CallbackQuery, state: FSMContext):
    subgroup = int(callback.data.split("_")[1])
    data = await state.get_data()

    # Save to DB
    async with SessionLocal() as db:
        result = await db.execute(select(User).where(User.telegram_id == callback.from_user.id))
        user = result.scalars().first()
        if not user:
            user = User(telegram_id=callback.from_user.id)
            db.add(user)

        user.bsuir_group = data["group"]
        user.bsuir_subgroup = subgroup
        if data.get("student_id"):
            user.bsuir_id = data["student_id"]

        await db.commit()

    await state.clear()

    sub_text = f"подгруппа {subgroup}" if subgroup else "обе подгруппы"
    id_text = data.get("student_id") or "не указана"

    markup = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="📱 Открыть BSUIR Nexus", web_app=WebAppInfo(url=WEBAPP_URL))]
    ])
    await callback.message.edit_text(
        f"🎉 <b>Настройка завершена!</b>\n\n"
        f"🎓 Группа: <b>{data['group']}</b>\n"
        f"📋 Подгруппа: <b>{sub_text}</b>\n"
        f"🆔 Зачётка: <b>{id_text}</b>\n\n"
        f"Используй /help для списка всех команд.\n"
        f"Нажми кнопку ниже, чтобы открыть Web App! 👇",
        reply_markup=get_app_kb("/#/schedule")
    )


# ──────────── /help ────────────

@dp.message(Command("help"))
async def cmd_help(message: Message):
    await message.answer(
        "📚 <b>BSUIR Nexus — Команды</b>\n\n"
        "🔧 <b>Настройка</b>\n"
        "  /start — Запуск бота, приветствие\n"
        "  /settings — Смена группы, подгруппы\n"
        "  /setid <code>номер</code> — Привязать номер зачётки\n\n"
        "📅 <b>Расписание</b>\n"
        "  /today — Расписание на сегодня\n"
        "  /tomorrow — Расписание на завтра\n"
        "  /week — Расписание на текущую неделю\n"
        "  /next_week — Расписание на следующую неделю\n\n"
        "📊 <b>Успеваемость</b>\n"
        "  /marks — Текущие оценки\n"
        "  /rating — Позиция в рейтинге специальности\n\n"
        "🔔 <b>Уведомления</b>\n"
        "  /notify <code>минуты</code> — Установить напоминание перед парой\n\n"
        "🔍 <b>Поиск</b>\n"
        "  /teacher <code>фамилия</code> — Поиск преподавателя\n"
        "  /groups <code>номер</code> — Поиск группы\n"
        "  /faculties — Список факультетов\n",
        reply_markup=get_app_kb("/#/schedule")
    )


# ──────────── /today ────────────

@dp.message(Command("today"))
async def cmd_today(message: Message):
    user = await get_or_create_user(message.from_user.id)
    if not user.bsuir_group:
        await message.answer("⚠️ Группа не настроена. Используй /start для настройки.")
        return

    status_msg = await message.answer("⌛ Загружаю расписание...")

    # Get current week
    week_data = await fetch_current_week()
    if isinstance(week_data, dict) and "error" in week_data:
        await status_msg.edit_text("❌ Не удалось получить текущую неделю.")
        return

    week_num = int(week_data) if not isinstance(week_data, dict) else 1

    now = datetime.now(MINSK_TZ)
    day_index = now.weekday()  # 0=Monday

    if day_index >= 7:
        await status_msg.edit_text("🏖 Сегодня воскресенье — пар нет!")
        return

    day_name = WEEKDAY_NAMES[day_index]
    result = await get_schedule_for_days(
        user.bsuir_group, user.bsuir_subgroup or 0, week_num, [day_name]
    )

    date_str = now.strftime("%d.%m.%Y")
    header = f"📅 <b>Расписание на сегодня</b> ({date_str})\n🎓 Группа: {user.bsuir_group} · Неделя {week_num}"
    await status_msg.edit_text(f"{header}\n{result}", reply_markup=get_app_kb("/#/schedule"))


# ──────────── /tomorrow ────────────

@dp.message(Command("tomorrow"))
async def cmd_tomorrow(message: Message):
    user = await get_or_create_user(message.from_user.id)
    if not user.bsuir_group:
        await message.answer("⚠️ Группа не настроена. Используй /start для настройки.")
        return

    status_msg = await message.answer("⌛ Загружаю расписание...")

    week_data = await fetch_current_week()
    if isinstance(week_data, dict) and "error" in week_data:
        await status_msg.edit_text("❌ Не удалось получить текущую неделю.")
        return

    week_num = int(week_data) if not isinstance(week_data, dict) else 1

    now = datetime.now(MINSK_TZ)
    tomorrow = now + timedelta(days=1)
    day_index = tomorrow.weekday()

    # If tomorrow is Sunday, week_num stays same
    # If today is Saturday, tomorrow is Sunday — next day with schedule is Monday (next week)
    if day_index == 6:  # Sunday
        # Skip to Monday
        tomorrow = tomorrow + timedelta(days=1)
        day_index = 0
        # Monday = next week
        week_num = (week_num % 4) + 1

    # If today is Sunday, tomorrow is Monday — also next week
    if now.weekday() == 6:
        week_num = (week_num % 4) + 1

    day_name = WEEKDAY_NAMES[day_index]
    result = await get_schedule_for_days(
        user.bsuir_group, user.bsuir_subgroup or 0, week_num, [day_name]
    )

    date_str = tomorrow.strftime("%d.%m.%Y")
    header = f"📅 <b>Расписание на завтра</b> ({date_str})\n🎓 Группа: {user.bsuir_group} · Неделя {week_num}"
    await status_msg.edit_text(f"{header}\n{result}", reply_markup=get_app_kb("/#/schedule"))


# ──────────── /week ────────────

@dp.message(Command("week"))
async def cmd_week(message: Message):
    user = await get_or_create_user(message.from_user.id)
    if not user.bsuir_group:
        await message.answer("⚠️ Группа не настроена. Используй /start для настройки.")
        return

    status_msg = await message.answer("⌛ Загружаю расписание на неделю...")

    week_data = await fetch_current_week()
    if isinstance(week_data, dict) and "error" in week_data:
        await status_msg.edit_text("❌ Не удалось получить текущую неделю.")
        return

    week_num = int(week_data) if not isinstance(week_data, dict) else 1

    # Schedule for Mon-Sat
    schedule_days = WEEKDAY_NAMES[:6]
    result = await get_schedule_for_days(
        user.bsuir_group, user.bsuir_subgroup or 0, week_num, schedule_days
    )

    header = f"🗓 <b>Расписание на текущую неделю</b> (неделя {week_num})\n🎓 Группа: {user.bsuir_group}"

    full_text = f"{header}\n{result}"
    # Telegram message limit is 4096 chars
    if len(full_text) > 4096:
        # Split into parts
        await status_msg.edit_text(f"{header}\n\n⚠️ Расписание слишком длинное, отправлю по частям...")
        # Send day by day
        for day_name in schedule_days:
            day_result = await get_schedule_for_days(
                user.bsuir_group, user.bsuir_subgroup or 0, week_num, [day_name]
            )
            if "Нет пар" not in day_result or True:
                await message.answer(day_result, reply_markup=get_app_kb("/#/schedule"))
    else:
        await status_msg.edit_text(full_text, reply_markup=get_app_kb("/#/schedule"))


# ──────────── /next_week ────────────

@dp.message(Command("next_week"))
async def cmd_next_week(message: Message):
    user = await get_or_create_user(message.from_user.id)
    if not user.bsuir_group:
        await message.answer("⚠️ Группа не настроена. Используй /start для настройки.")
        return

    status_msg = await message.answer("⌛ Загружаю расписание на следующую неделю...")

    week_data = await fetch_current_week()
    if isinstance(week_data, dict) and "error" in week_data:
        await status_msg.edit_text("❌ Не удалось получить текущую неделю.")
        return

    current_week = int(week_data) if not isinstance(week_data, dict) else 1
    next_week = (current_week % 4) + 1

    schedule_days = WEEKDAY_NAMES[:6]
    result = await get_schedule_for_days(
        user.bsuir_group, user.bsuir_subgroup or 0, next_week, schedule_days
    )

    header = f"🗓 <b>Расписание на следующую неделю</b> (неделя {next_week})\n🎓 Группа: {user.bsuir_group}"

    full_text = f"{header}\n{result}"
    if len(full_text) > 4096:
        await status_msg.edit_text(f"{header}\n\n⚠️ Расписание слишком длинное, отправлю по частям...")
        for day_name in schedule_days:
            day_result = await get_schedule_for_days(
                user.bsuir_group, user.bsuir_subgroup or 0, next_week, [day_name]
            )
            await message.answer(day_result, reply_markup=get_app_kb("/#/schedule"))
    else:
        await status_msg.edit_text(full_text, reply_markup=get_app_kb("/#/schedule"))


# ──────────── /settings ────────────

@dp.message(Command("settings"))
async def cmd_settings(message: Message, state: FSMContext):
    await state.clear()
    user = await get_or_create_user(message.from_user.id)

    current = (
        f"⚙️ <b>Текущие настройки:</b>\n"
        f"🎓 Группа: <b>{user.bsuir_group or 'не указана'}</b>\n"
        f"📋 Подгруппа: <b>{user.bsuir_subgroup or 'не выбрана'}</b>\n"
        f"🆔 Зачётка: <b>{user.bsuir_id or 'не указана'}</b>\n\n"
        f"📝 Введи новый номер группы или отправь <code>-</code>, чтобы оставить текущую:",
        reply_markup=get_app_kb("/#/settings")
    )
    await message.answer(current)
    await state.set_state(SettingsStates.waiting_group)


@dp.message(SettingsStates.waiting_group)
async def settings_group(message: Message, state: FSMContext):
    text = message.text.strip()

    if text == "-":
        # Keep current group, go to subgroup selection
        keyboard = InlineKeyboardMarkup(inline_keyboard=[
            [
                InlineKeyboardButton(text="1️⃣ Подгруппа 1", callback_data="set_sub_1"),
                InlineKeyboardButton(text="2️⃣ Подгруппа 2", callback_data="set_sub_2"),
            ],
            [InlineKeyboardButton(text="🔄 Обе подгруппы", callback_data="set_sub_0")],
            [InlineKeyboardButton(text="❌ Отмена", callback_data="set_sub_cancel")]
        ])
        await message.answer("📋 <b>Выбери подгруппу:</b>", reply_markup=keyboard)
        await state.set_state(SettingsStates.waiting_subgroup)
        return

    # Validate group
    status_msg = await message.answer("🔍 Ищу группу...")
    groups = await fetch_student_groups()
    if isinstance(groups, dict) and "error" in groups:
        await status_msg.edit_text("❌ Не удалось проверить группу. Попробуй ещё раз:")
        return

    found = any(g.get("name") == text for g in groups)
    if not found:
        matches = [g["name"] for g in groups if text in g.get("name", "")][:5]
        if matches:
            hint = "\n".join(f"• <code>{m}</code>" for m in matches)
            await status_msg.edit_text(f"❌ Группа не найдена. Возможно:\n{hint}\n\nПопробуй ещё раз:")
        else:
            await status_msg.edit_text("❌ Группа не найдена. Попробуй ещё раз:")
        return

    await state.update_data(new_group=text)

    # Save group immediately
    async with SessionLocal() as db:
        result = await db.execute(select(User).where(User.telegram_id == message.from_user.id))
        user = result.scalars().first()
        if user:
            user.bsuir_group = text
            await db.commit()

    keyboard = InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(text="1️⃣ Подгруппа 1", callback_data="set_sub_1"),
            InlineKeyboardButton(text="2️⃣ Подгруппа 2", callback_data="set_sub_2"),
        ],
        [InlineKeyboardButton(text="🔄 Обе подгруппы", callback_data="set_sub_0")],
        [InlineKeyboardButton(text="❌ Отмена", callback_data="set_sub_cancel")]
    ])
    await status_msg.edit_text(
        f"✅ Группа <b>{text}</b> установлена!\n\n📋 <b>Выбери подгруппу:</b>",
        reply_markup=keyboard
    )
    await state.set_state(SettingsStates.waiting_subgroup)


@dp.callback_query(SettingsStates.waiting_subgroup, F.data.startswith("set_sub_"))
async def settings_subgroup(callback: CallbackQuery, state: FSMContext):
    action = callback.data.replace("set_sub_", "")

    if action == "cancel":
        await state.clear()
        await callback.message.edit_text("❌ Настройка отменена.")
        return

    subgroup = int(action)

    async with SessionLocal() as db:
        result = await db.execute(select(User).where(User.telegram_id == callback.from_user.id))
        user = result.scalars().first()
        if user:
            user.bsuir_subgroup = subgroup
            await db.commit()

    await state.clear()
    sub_text = f"подгруппа {subgroup}" if subgroup else "обе подгруппы"
    await callback.message.edit_text(f"✅ Настройки обновлены! Подгруппа: <b>{sub_text}</b>")


# ──────────── /marks ────────────

@dp.message(Command("marks"))
async def cmd_marks(message: Message):
    user = await get_or_create_user(message.from_user.id)
    if not user.bsuir_id:
        await message.answer(
            "⚠️ Номер зачётки не привязан!\n"
            "Используй <code>/setid номер</code> (например <code>/setid 56841038</code>) "
            "или пройди /start заново."
        )
        return

    status_msg = await message.answer("⌛ Загружаю оценки...")

    # Try to use cached grades_data first, fetch if needed
    subjects = []
    source = "Cache"

    if user.grades_data:
        try:
            raw_data = json.loads(user.grades_data)
            lessons_list = []
            if isinstance(raw_data, list):
                lessons_list = raw_data
            elif isinstance(raw_data, dict):
                lessons_list = raw_data.get("lessons", [])

            seen = {}
            for lesson in lessons_list:
                if not isinstance(lesson, dict):
                    continue
                subj = (lesson.get("lessonNameAbbrev") or lesson.get("subject") or 
                        lesson.get("subjectAbbrev") or "?")
                raw_marks = lesson.get("marks", [])
                if not isinstance(raw_marks, list):
                    raw_marks = [raw_marks] if raw_marks else []
                
                marks = []
                for m in raw_marks:
                    val = m.get("mark") if isinstance(m, dict) else m
                    if val is not None:
                        try:
                            v = int(str(val).strip())
                            if 0 <= v <= 10:
                                marks.append(v)
                        except:
                            pass
                
                if subj not in seen:
                    seen[subj] = []
                seen[subj].extend(marks)

            for name, marks in seen.items():
                if marks:
                    avg = sum(marks) / len(marks)
                    subjects.append({"name": name, "marks": marks, "avg": avg})
        except:
            pass

    if not subjects:
        # Try to fetch live
        source = "IIS API"
        rating_res = await rating_service.fetch_student_rating(user.bsuir_id)
        if rating_res.get("success"):
            raw_data = rating_res["data"]
            lessons_list = []
            if isinstance(raw_data, list):
                lessons_list = raw_data
            elif isinstance(raw_data, dict):
                lessons_list = raw_data.get("lessons", [])

            seen = {}
            for lesson in lessons_list:
                if not isinstance(lesson, dict):
                    continue
                subj = (lesson.get("lessonNameAbbrev") or lesson.get("subject") or "?")
                raw_marks = lesson.get("marks", [])
                if not isinstance(raw_marks, list):
                    raw_marks = [raw_marks] if raw_marks else []
                marks = []
                for m in raw_marks:
                    val = m.get("mark") if isinstance(m, dict) else m
                    if val is not None:
                        try:
                            v = int(str(val).strip())
                            if 0 <= v <= 10:
                                marks.append(v)
                        except:
                            pass
                if subj not in seen:
                    seen[subj] = []
                seen[subj].extend(marks)

            for name, marks in seen.items():
                if marks:
                    avg = sum(marks) / len(marks)
                    subjects.append({"name": name, "marks": marks, "avg": avg})

    if not subjects:
        await status_msg.edit_text("📭 Оценки не найдены. Убедись, что номер зачётки указан верно (/setid).")
        return

    # Format output
    lines = [f"📊 <b>Оценки</b> (зачётка: {user.bsuir_id})\n"]
    overall_marks = []
    for s in sorted(subjects, key=lambda x: x["avg"], reverse=True):
        marks_str = ", ".join(str(m) for m in s["marks"])
        avg_emoji = "🟢" if s["avg"] >= 8 else "🟡" if s["avg"] >= 6 else "🔴"
        lines.append(f"{avg_emoji} <b>{s['name']}</b>: {marks_str} (ср. {s['avg']:.1f})")
        overall_marks.extend(s["marks"])

    if overall_marks:
        total_avg = sum(overall_marks) / len(overall_marks)
        lines.append(f"\n📈 <b>Общий средний балл: {total_avg:.2f}</b>")

    await status_msg.edit_text("\n".join(lines), reply_markup=get_app_kb("/#/study"))


# ──────────── /rating ────────────

@dp.message(Command("rating"))
async def cmd_rating(message: Message):
    user = await get_or_create_user(message.from_user.id)
    if not user.bsuir_id:
        await message.answer(
            "⚠️ Номер зачётки не привязан!\n"
            "Используй <code>/setid номер</code> или пройди /start."
        )
        return

    status_msg = await message.answer("⌛ Получаю данные о рейтинге...")

    # Get group info for sdef/course
    if not user.bsuir_group:
        await status_msg.edit_text("⚠️ Группа не указана. Используй /settings для настройки.")
        return

    group_info = await get_group_info(user.bsuir_group)
    if not group_info:
        await status_msg.edit_text("❌ Не удалось найти информацию о группе.")
        return

    sdef = group_info.get("specialityDepartmentEducationFormId")
    course = group_info.get("course")
    if not sdef or not course:
        await status_msg.edit_text("❌ Недостаточно данных о группе для получения рейтинга.")
        return

    rating_list = await fetch_group_rating(sdef, course)
    if isinstance(rating_list, dict) and "error" in rating_list:
        # Fall back to cached data
        if user.rating_position and user.average_grade:
            await status_msg.edit_text(
                f"🏆 <b>Рейтинг</b> (кэш)\n\n"
                f"📊 Средний балл: <b>{user.average_grade}</b>\n"
                f"🥇 Позиция: <b>{user.rating_position}</b>\n\n"
                f"⚠️ Данные из кэша, IIS временно недоступен."
            )
        else:
            await status_msg.edit_text(f"❌ Ошибка получения рейтинга: {rating_list.get('error')}")
        return

    if not isinstance(rating_list, list) or not rating_list:
        await status_msg.edit_text("📭 Рейтинг пуст или данные недоступны.")
        return

    # Sort and find user
    rating_list.sort(key=lambda x: x.get("average", 0), reverse=True)
    total = len(rating_list)

    average = 0.0
    position = 0
    for idx, student in enumerate(rating_list):
        if student.get("studentCardNumber") == user.bsuir_id:
            average = student.get("average", 0.0)
            position = idx + 1
            break

    if position == 0:
        await status_msg.edit_text("❌ Студент не найден в рейтинге. Проверь номер зачётки (/setid).")
        return

    # Position emoji
    if position == 1:
        pos_emoji = "🥇"
    elif position == 2:
        pos_emoji = "🥈"
    elif position == 3:
        pos_emoji = "🥉"
    elif position <= 10:
        pos_emoji = "⭐"
    else:
        pos_emoji = "📍"

    # Top-3 students
    top_lines = []
    medals = ["🥇", "🥈", "🥉"]
    for i, s in enumerate(rating_list[:3]):
        medal = medals[i]
        name = f"{s.get('lastName', '')} {s.get('firstName', '')}"
        avg = s.get("average", 0)
        is_you = " ← ты!" if s.get("studentCardNumber") == user.bsuir_id else ""
        top_lines.append(f"  {medal} {name} — {avg:.1f}{is_you}")

    top_str = "\n".join(top_lines)
    spec = group_info.get("specialityAbbrev", "")

    await status_msg.edit_text(
        f"🏆 <b>Рейтинг специальности</b> ({spec}, {course} курс)\n\n"
        f"📊 Твой средний балл: <b>{average:.1f}</b>\n"
        f"{pos_emoji} Твоя позиция: <b>{position}</b> из {total}\n\n"
        f"👑 <b>Топ-3:</b>\n{top_str}",
        reply_markup=get_app_kb("/?tab=rating#/university")
    )

    # Update cached data
    async with SessionLocal() as db:
        result = await db.execute(select(User).where(User.telegram_id == message.from_user.id))
        u = result.scalars().first()
        if u:
            u.average_grade = str(average)
            u.rating_position = position
            await db.commit()


# ──────────── /setid (fix typo) ────────────

@dp.message(Command("setid"))
async def cmd_setid(message: Message):
    args = message.text.split(maxsplit=1)
    if len(args) < 2 or not args[1].strip().isdigit():
        await message.answer("Введи корректный номер зачётки.\nПример: <code>/setid 56841038</code>")
        return

    bsuir_id = args[1].strip()
    async with SessionLocal() as db:
        result = await db.execute(select(User).where(User.telegram_id == message.from_user.id))
        user = result.scalars().first()

        if not user:
            user = User(telegram_id=message.from_user.id, bsuir_id=bsuir_id)
            db.add(user)
        else:
            user.bsuir_id = bsuir_id

        await db.commit()
        await message.answer(f"✅ Номер зачётки <b>{bsuir_id}</b> успешно привязан!")


# ──────────── /notify ────────────

@dp.message(Command("notify"))
async def cmd_notify(message: Message):
    args = message.text.split(maxsplit=1)
    if len(args) < 2 or not args[1].strip().isdigit():
        await message.answer(
            "Введи время уведомления в минутах.\n"
            "Пример: <code>/notify 15</code> (предупредит за 15 минут до начала)"
        )
        return

    offset = int(args[1].strip())
    async with SessionLocal() as db:
        result = await db.execute(select(User).where(User.telegram_id == message.from_user.id))
        user = result.scalars().first()

        if not user:
            user = User(telegram_id=message.from_user.id, notification_offset=offset)
            db.add(user)
        else:
            user.notification_offset = offset

        await db.commit()
        await message.answer(f"✅ Уведомления будут приходить за <b>{offset}</b> мин. до начала!")


# ──────────── /teacher ────────────

@dp.message(Command("teacher"))
async def cmd_teacher(message: Message):
    args = message.text.split(maxsplit=1)
    if len(args) < 2:
        await message.answer("Введи имя преподавателя.\nПример: <code>/teacher Иванов</code>")
        return

    query = args[1].lower()
    employees = await fetch_all_employees()

    if isinstance(employees, dict) and "error" in employees:
        await message.answer("❌ Ошибка получения списка преподавателей.")
        return

    results = [
        emp["fio"] for emp in employees
        if query in emp.get("fio", "").lower() or query in emp.get("lastName", "").lower()
    ]

    if not results:
        await message.answer("🔍 Преподаватель не найден.")
    else:
        response = "👤 <b>Найденные преподаватели:</b>\n" + "\n".join(f"• {r}" for r in results[:5])
        if len(results) > 5:
            response += f"\n<i>И ещё {len(results) - 5}...</i>"
        await message.answer(response, reply_markup=get_app_kb("/?tab=teachers#/university"))


# ──────────── /groups ────────────

@dp.message(Command("groups"))
async def cmd_groups(message: Message):
    args = message.text.split(maxsplit=1)
    if len(args) < 2:
        await message.answer("Введи номер группы.\nПример: <code>/groups 453501</code>")
        return

    query = args[1].strip()
    groups = await fetch_student_groups()

    if isinstance(groups, dict) and "error" in groups:
        await message.answer("❌ Ошибка получения списка групп.")
        return

    results = [g["name"] for g in groups if query in g.get("name", "")]

    if not results:
        await message.answer("🔍 Группа не найдена.")
    else:
        response = "🎓 <b>Найденные группы:</b>\n" + "\n".join(f"• <code>{r}</code>" for r in results[:10])
        await message.answer(response, reply_markup=get_app_kb("/?tab=groups#/university"))


# ──────────── /faculties ────────────

@dp.message(Command("faculties"))
async def cmd_faculties(message: Message):
    facs = await fetch_faculties()
    if isinstance(facs, dict) and "error" in facs:
        await message.answer("❌ Ошибка получения списка факультетов.")
        return

    response = "🏛 <b>Факультеты БГУИР:</b>\n" + "\n".join(
        f"• {f.get('abbrev', '')} — {f.get('name', '')}" for f in facs
    )
    await message.answer(response, reply_markup=get_app_kb("/?tab=faculties#/university"))


# ──────────── /specialities ────────────

@dp.message(Command("specialities"))
async def cmd_specialities(message: Message):
    specs = await fetch_specialities()
    if isinstance(specs, dict) and "error" in specs:
        await message.answer("❌ Ошибка получения списка специальностей.")
        return

    response = "📜 <b>Специальности БГУИР:</b>\n" + "\n".join(
        f"• {s.get('abbrev', '')} — {s.get('name', '')}" for s in specs[:15]
    )
    if len(specs) > 15:
        response += "\n<i>Показаны первые 15</i>"
    await message.answer(response, reply_markup=get_app_kb("/?tab=faculties#/university"))
