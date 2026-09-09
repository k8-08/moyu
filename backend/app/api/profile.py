from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.user import User
from app.models.profile import UserProfile
from app.schemas.schemas import ProfileSchema
from app.api.deps import get_current_user

router = APIRouter(prefix="/profile", tags=["打工档案"])

@router.get("", response_model=ProfileSchema, summary="获取当前用户的打工档案")
def get_profile(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    profile = db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()
    if not profile:
        profile = UserProfile(user_id=current_user.id)
        db.add(profile)
        db.commit()
        db.refresh(profile)
    return profile

from datetime import datetime
from app.models.salary import DailySalary

@router.put("", response_model=ProfileSchema, summary="保存/更新打工档案")
def update_profile(data: ProfileSchema, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    profile = db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()
    if not profile:
        profile = UserProfile(user_id=current_user.id)
        db.add(profile)

    profile.salary = data.salary
    profile.work_days = data.work_days
    profile.work_start = data.work_start
    profile.work_end = data.work_end
    profile.lunch_start = data.lunch_start
    profile.lunch_end = data.lunch_end

    # 联动更新今日出勤底薪，确保档案调整后当日薪资与大盘立刻一致
    today_str = datetime.now().strftime("%Y-%m-%d")
    today_salary = db.query(DailySalary).filter(
        DailySalary.user_id == current_user.id,
        DailySalary.date == today_str
    ).first()
    if today_salary:
        new_daily_base = round(data.salary / (data.work_days or 21.75), 2)
        today_salary.base_salary = new_daily_base
        slack_sal = float(today_salary.slack_salary) if today_salary.slack_salary else 0.0
        today_salary.total_salary = round(new_daily_base + slack_sal, 2)
        today_salary.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(profile)
    return profile
