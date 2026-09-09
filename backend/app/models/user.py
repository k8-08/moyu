from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.orm import relationship
from app.core.database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    username = Column(String(64), unique=True, index=True, nullable=False, comment="登录账号")
    nickname = Column(String(64), nullable=False, default="打工人", comment="用户名/昵称")
    password_hash = Column(String(255), nullable=False, comment="哈希密码")
    role = Column(String(20), default="user", nullable=False, comment="角色: user/admin")
    device_id = Column(String(128), nullable=True, index=True, comment="最近登录设备ID")
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    profile = relationship("UserProfile", back_populates="user", uselist=False, cascade="all, delete-orphan")
    records = relationship("SlackRecord", back_populates="user", cascade="all, delete-orphan")
    salaries = relationship("DailySalary", back_populates="user", cascade="all, delete-orphan")
