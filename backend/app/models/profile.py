from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from app.core.database import Base

class UserProfile(Base):
    __tablename__ = "user_profiles"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    salary = Column(Float, default=10000.0, nullable=False, comment="税前月薪")
    work_days = Column(Float, default=21.75, nullable=False, comment="月计薪天数")
    work_start = Column(String(10), default="08:30", nullable=False, comment="上班时间")
    work_end = Column(String(10), default="17:30", nullable=False, comment="下班时间")
    lunch_start = Column(String(10), default="12:00", nullable=False, comment="午休开始")
    lunch_end = Column(String(10), default="13:30", nullable=False, comment="午休结束")
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    user = relationship("User", back_populates="profile")
