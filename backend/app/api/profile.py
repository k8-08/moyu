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

    db.commit()
    db.refresh(profile)
    return profile
