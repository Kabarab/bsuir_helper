from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime, BigInteger
from sqlalchemy.orm import relationship
from .core import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    telegram_id = Column(BigInteger, unique=True, index=True, nullable=False)
    bsuir_group = Column(String, nullable=True)
    bsuir_subgroup = Column(Integer, default=0)
    bsuir_id = Column(String, nullable=True)
    notification_offset = Column(Integer, default=10) # minutes before

    tasks = relationship("Task", back_populates="owner", cascade="all, delete-orphan")
    custom_events = relationship("CustomEvent", back_populates="owner", cascade="all, delete-orphan")

class Task(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    title = Column(String, nullable=False)
    description = Column(String, nullable=True)
    priority = Column(String, default="medium")
    is_completed = Column(Boolean, default=False)
    due_date = Column(String, nullable=True) # YYYY-MM-DD
    subject = Column(String, nullable=True)
    linkedEventId = Column(String, nullable=True)
    created_at = Column(BigInteger, nullable=True) # Date.now() timestamp
    last_reminded_at = Column(DateTime, nullable=True)

    owner = relationship("User", back_populates="tasks")

class CustomEvent(Base):
    __tablename__ = "custom_events"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    title = Column(String, nullable=False)
    startTime = Column(String, nullable=False)
    endTime = Column(String, nullable=False)
    type = Column(String, default="CUSTOM")
    color = Column(String, default="blue")
    date = Column(String, nullable=True) # ISO Date

    owner = relationship("User", back_populates="custom_events")
