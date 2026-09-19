from typing import List, Optional
from datetime import datetime, time
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.user import User
from app.models.record import SlackRecord
from app.models.salary import DailySalary
from app.schemas.schemas import RecordCreate, RecordOut
from app.api.deps import get_current_user

router = APIRouter(prefix="/records", tags=["摸鱼明细记录"])

def _calculate_user_second_rate(user: User) -> tuple[float, float, float]:
    """计算用户每秒费率与每日底薪: 返回 (rate_second, daily_base, daily_work_seconds)"""
    profile = user.profile
    salary = float(profile.salary) if profile and profile.salary else 10000.0
    work_days = float(profile.work_days) if profile and profile.work_days else 21.75
    w_start = profile.work_start if profile and profile.work_start else "08:30"
    w_end = profile.work_end if profile and profile.work_end else "17:30"
    l_start = profile.lunch_start if profile and profile.lunch_start else "12:00"
    l_end = profile.lunch_end if profile and profile.lunch_end else "13:30"

    def to_min(t_str: str) -> int:
        try:
            h, m = map(int, t_str.split(":"))
            return h * 60 + m
        except Exception:
            return 0

    total_work_min = to_min(w_end) - to_min(w_start)
    lunch_min = to_min(l_end) - to_min(l_start)
    if lunch_min > 0:
        total_work_min -= lunch_min
    total_work_sec = max(60, total_work_min * 60)

    total_monthly_sec = work_days * total_work_sec
    rate_second = salary / total_monthly_sec if total_monthly_sec > 0 else 0.0
    daily_base = round(salary / (work_days or 21.75), 2)
    return rate_second, daily_base, float(total_work_sec)

def _sync_daily_salary_snapshot(db: Session, user: User, target_date_str: str, daily_base: float):
    """根据 slack_records 权威重新计算并同步当天 DailySalary 快照"""
    try:
        t_date = datetime.strptime(target_date_str, "%Y-%m-%d").date()
    except ValueError:
        return

    start_dt = datetime.combine(t_date, time.min)
    end_dt = datetime.combine(t_date, time.max)

    day_recs = db.query(SlackRecord).filter(
        SlackRecord.user_id == user.id,
        SlackRecord.start_time >= start_dt,
        SlackRecord.start_time <= end_dt
    ).all()

    sum_earned = round(sum(float(r.earned or 0.0) for r in day_recs), 2)
    sum_dur = sum(int(r.duration or 0) for r in day_recs)
    cnt = len(day_recs)

    ds = db.query(DailySalary).filter(
        DailySalary.user_id == user.id,
        DailySalary.date == target_date_str
    ).first()

    if not ds:
        ds = DailySalary(
            user_id=user.id,
            date=target_date_str,
            year=t_date.year,
            month=t_date.month,
            week=t_date.isocalendar()[1],
            day=t_date.day,
            base_salary=daily_base,
            slack_salary=sum_earned,
            total_salary=round(daily_base + sum_earned, 2),
            slack_count=cnt,
            slack_duration=sum_dur,
            updated_at=datetime.utcnow()
        )
        db.add(ds)
    else:
        effective_base = float(ds.base_salary) if ds.base_salary and float(ds.base_salary) > 0 else daily_base
        ds.base_salary = effective_base
        ds.slack_salary = sum_earned
        ds.total_salary = round(effective_base + sum_earned, 2)
        ds.slack_count = cnt
        ds.slack_duration = sum_dur
        ds.updated_at = datetime.utcnow()

@router.get("", response_model=List[RecordOut], summary="获取摸鱼记录明细")
def list_records(
    date_str: Optional[str] = None, # YYYY-MM-DD
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query = db.query(SlackRecord).filter(SlackRecord.user_id == current_user.id)
    if date_str:
        try:
            target_date = datetime.strptime(date_str, "%Y-%m-%d").date()
            start_dt = datetime.combine(target_date, time.min)
            end_dt = datetime.combine(target_date, time.max)
            query = query.filter(
                SlackRecord.start_time >= start_dt,
                SlackRecord.start_time <= end_dt
            )
        except ValueError:
            pass
    return query.order_by(SlackRecord.start_time.desc(), SlackRecord.created_at.desc()).all()

@router.post("", response_model=RecordOut, summary="添加一条摸鱼记录")
def create_record(data: RecordCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    existing = db.query(SlackRecord).filter(SlackRecord.id == data.id).first()
    if existing:
        return existing

    # 1. 基础时间合理性校验
    if data.start_time > data.end_time:
        raise HTTPException(status_code=400, detail="摸鱼开始时间不能晚于结束时间")

    time_diff_sec = int((data.end_time - data.start_time).total_seconds())
    # 优先采用起止时间差，若前端传了明确合规的 duration 则做有效范围约束
    duration = time_diff_sec if time_diff_sec > 0 else (data.duration if (data.duration and data.duration > 0) else 1)
    if duration > 86400:
        raise HTTPException(status_code=400, detail="单次摸鱼时长不能超过24小时")

    # 2. 服务端权威计算收益，杜绝客户端随意伪造天价金额
    rate_second, daily_base, _ = _calculate_user_second_rate(current_user)
    authoritative_earned = round(duration * rate_second, 2)

    rec = SlackRecord(
        id=data.id,
        user_id=current_user.id,
        category_id=data.category_id,
        start_time=data.start_time,
        end_time=data.end_time,
        duration=duration,
        earned=authoritative_earned,
        created_at=datetime.utcnow()
    )
    db.add(rec)
    db.flush()

    # 3. 联动原子更新当天 DailySalary 快照
    date_str = data.start_time.strftime("%Y-%m-%d")
    _sync_daily_salary_snapshot(db, current_user, date_str, daily_base)

    db.commit()
    db.refresh(rec)
    return rec

@router.delete("/{record_id}", summary="销毁单条摸鱼罪证")
def delete_record(record_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rec = db.query(SlackRecord).filter(SlackRecord.id == record_id, SlackRecord.user_id == current_user.id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="记录不存在或已被销毁")

    target_date_str = rec.start_time.strftime("%Y-%m-%d")
    _, daily_base, _ = _calculate_user_second_rate(current_user)

    db.delete(rec)
    db.flush()

    # 销毁罪证后，立即在同一事务中重算并更新当天工资快照，避免大盘残留脏数据
    _sync_daily_salary_snapshot(db, current_user, target_date_str, daily_base)

    db.commit()
    return {"message": "罪证销毁成功，当日工资快照已同步更新"}
