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
    salary: float = 10000.0
    work_days: float = 21.75
    work_start: str = "08:30"
    work_end: str = "17:30"
    lunch_start: str = "12:00"
    lunch_end: str = "13:30"

    class Config:
        from_attributes = True

class RecordCreate(BaseModel):
    id: str
    category_id: str
    start_time: datetime
    end_time: datetime
    duration: int
    earned: float

class RecordOut(RecordCreate):
    created_at: datetime

    class Config:
        from_attributes = True

class SalaryReportRequest(BaseModel):
    date: Optional[str] = None
    base_salary: float = 0.0
    slack_salary: float = 0.0
    total_salary: float = 0.0
    slack_count: int = 0
    slack_duration: int = 0

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
