from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.user import User
from app.models.record import SlackRecord
from app.schemas.schemas import RecordCreate, RecordOut
from app.api.deps import get_current_user

router = APIRouter(prefix="/records", tags=["摸鱼明细记录"])

@router.get("", response_model=List[RecordOut], summary="获取今日摸鱼记录明细")
def list_records(
    date_str: Optional[str] = None, # YYYY-MM-DD
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query = db.query(SlackRecord).filter(SlackRecord.user_id == current_user.id)
    if date_str:
        try:
            target_date = datetime.strptime(date_str, "%Y-%m-%d").date()
            start_dt = datetime.combine(target_date, datetime.min.time())
            end_dt = datetime.combine(target_date, datetime.max.time())
            query = query.filter(SlackRecord.created_at >= start_dt, SlackRecord.created_at <= end_dt)
        except ValueError:
            pass
    return query.order_by(SlackRecord.created_at.desc()).all()

@router.post("", response_model=RecordOut, summary="添加一条摸鱼记录")
def create_record(data: RecordCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    existing = db.query(SlackRecord).filter(SlackRecord.id == data.id).first()
    if existing:
        return existing

    rec = SlackRecord(
        id=data.id,
        user_id=current_user.id,
        category_id=data.category_id,
        start_time=data.start_time,
        end_time=data.end_time,
        duration=data.duration,
        earned=data.earned,
        created_at=datetime.utcnow()
    )
    db.add(rec)
    db.commit()
    db.refresh(rec)
    return rec

@router.delete("/{record_id}", summary="销毁单条摸鱼罪证")
def delete_record(record_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rec = db.query(SlackRecord).filter(SlackRecord.id == record_id, SlackRecord.user_id == current_user.id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="记录不存在或已被销毁")
    db.delete(rec)
    db.commit()
    return {"message": "罪证销毁成功"}
