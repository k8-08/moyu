from datetime import datetime
from sqlalchemy import Column, Integer, Float, String, ForeignKey, DateTime, UniqueConstraint
from sqlalchemy.orm import relationship
from app.core.database import Base

class DailySalary(Base):
    __tablename__ = "daily_salaries"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    date = Column(String(10), nullable=False, index=True, comment="日期YYYY-MM-DD")
    year = Column(Integer, nullable=False, index=True, comment="年份")
    month = Column(Integer, nullable=False, index=True, comment="月份1-12")
    week = Column(Integer, nullable=False, index=True, comment="周数1-53")
    day = Column(Integer, nullable=False, index=True, comment="日1-31")

    base_salary = Column(Float, default=0.0, nullable=False, comment="今日实际出勤基本工资")
    slack_salary = Column(Float, default=0.0, nullable=False, comment="今日摸鱼白嫖工资")
    total_salary = Column(Float, default=0.0, nullable=False, comment="今日已赚总收益")
    slack_count = Column(Integer, default=0, nullable=False, comment="今日摸鱼总次数")
    slack_duration = Column(Integer, default=0, nullable=False, comment="今日摸鱼总秒数")
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    user = relationship("User", back_populates="salaries")

    __table_args__ = (
        UniqueConstraint("user_id", "date", name="uix_user_date"),
    )
