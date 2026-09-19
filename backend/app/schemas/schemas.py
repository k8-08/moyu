from typing import Optional
from datetime import datetime
from pydantic import BaseModel, Field

class CaptchaResponse(BaseModel):
    captcha_id: str
    image: str

class RegisterRequest(BaseModel):
    username: str = Field(..., min_length=2, max_length=32, description="登录账号")
    nickname: str = Field(..., min_length=1, max_length=32, description="用户名/昵称")
    password: str = Field(..., min_length=4, max_length=64, description="账号密码")
    confirm_password: str = Field(..., min_length=4, max_length=64, description="确认密码")
    captcha_id: str
    captcha_code: str
    device_id: Optional[str] = None

class LoginRequest(BaseModel):
    username: str
    password: str
    device_id: Optional[str] = None

class UserOut(BaseModel):
    id: int
    username: str
    nickname: str
    role: str
    device_id: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut

class ProfileSchema(BaseModel):
    salary: float = Field(default=10000.0, ge=0.0, le=10000000.0, description="税前月薪")
    work_days: float = Field(default=21.75, gt=0.0, le=31.0, description="月计薪天数")
    work_start: str = Field(default="08:30", pattern=r"^\d{2}:\d{2}$", description="上班时间 HH:mm")
    work_end: str = Field(default="17:30", pattern=r"^\d{2}:\d{2}$", description="下班时间 HH:mm")
    lunch_start: str = Field(default="12:00", pattern=r"^\d{2}:\d{2}$", description="午休开始 HH:mm")
    lunch_end: str = Field(default="13:30", pattern=r"^\d{2}:\d{2}$", description="午休结束 HH:mm")

    class Config:
        from_attributes = True

class RecordCreate(BaseModel):
    id: str
    category_id: str
    start_time: datetime
    end_time: datetime
    duration: Optional[int] = None
    earned: Optional[float] = None

class RecordOut(BaseModel):
    id: str
    category_id: str
    start_time: datetime
    end_time: datetime
    duration: int
    earned: float
    created_at: datetime

    class Config:
        from_attributes = True

class SalaryReportRequest(BaseModel):
    date: Optional[str] = None
    base_salary: Optional[float] = None
    slack_salary: Optional[float] = None
    total_salary: Optional[float] = None
    slack_count: Optional[int] = None
    slack_duration: Optional[int] = None

class DailySalaryOut(BaseModel):
    id: int
    user_id: int
    date: str
    year: int
    month: int
    week: int
    day: int
    base_salary: float
    slack_salary: float
    total_salary: float
    slack_count: int
    slack_duration: int

    class Config:
        from_attributes = True

class CategoryStatRank(BaseModel):
    category_id: str
    count: int
    duration: int
    earned: float

class AdminStatsSummary(BaseModel):
    total_base_salary: float
    total_slack_salary: float
    total_earned: float
    total_slack_count: int
    total_slack_duration: int

class AdminStatsResponse(BaseModel):
    dimension: str
    summary: AdminStatsSummary
    category_ranks: list[CategoryStatRank]
    category_stats: Optional[list[CategoryStatRank]] = None
    leaderboard: list[dict]
    hero_rankings: Optional[list[dict]] = None
    user_details: list[dict]
