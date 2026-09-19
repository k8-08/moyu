from typing import List, Optional
from datetime import datetime, time
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.user import User
from app.models.salary import DailySalary
from app.models.record import SlackRecord
from app.schemas.schemas import SalaryReportRequest, DailySalaryOut
from app.api.deps import get_current_user

router = APIRouter(prefix="/salary", tags=["工资表管理"])

@router.post("/report", response_model=DailySalaryOut, summary="上报/更新每日工资数据快照")
def report_daily_salary(data: SalaryReportRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # 解析日期年月日周 (未传时默认今天)
    date_str = data.date or datetime.now().strftime("%Y-%m-%d")
    try:
        dt = datetime.strptime(date_str, "%Y-%m-%d")
    except ValueError:
        dt = datetime.now()
        date_str = dt.strftime("%Y-%m-%d")

    year = dt.year
    month = dt.month
    day = dt.day
    week = dt.isocalendar()[1]

    # 计算该用户的日薪出勤基准保底
    profile = current_user.profile
    u_salary = float(profile.salary) if profile and profile.salary else 10000.0
    u_days = float(profile.work_days) if profile and profile.work_days else 21.75
    default_daily_base = round(u_salary / (u_days or 21.75), 2)

    # 确定有效出勤基本工资
    effective_base = default_daily_base

    # 权威核查该用户在该日期的真实摸鱼流水
    start_dt = datetime.combine(dt.date(), time.min)
    end_dt = datetime.combine(dt.date(), time.max)
    day_recs = db.query(SlackRecord).filter(
        SlackRecord.user_id == current_user.id,
        SlackRecord.start_time >= start_dt,
        SlackRecord.start_time <= end_dt
    ).all()

    real_slack_sum = round(sum(float(r.earned or 0.0) for r in day_recs), 2)
    real_slack_cnt = len(day_recs)
    real_slack_dur = sum(int(r.duration or 0) for r in day_recs)

    # 优先以真实摸鱼流水为准，杜绝客户端随意伪造
    effective_slack = real_slack_sum if day_recs else round(float(data.slack_salary or 0.0), 2)
    effective_cnt = real_slack_cnt if day_recs else int(data.slack_count or 0)
    effective_dur = real_slack_dur if day_recs else int(data.slack_duration or 0)
    effective_total = round(effective_base + effective_slack, 2)

    # upsert 当天记录
    salary_record = db.query(DailySalary).filter(
        DailySalary.user_id == current_user.id,
        DailySalary.date == date_str
    ).first()

    if not salary_record:
        salary_record = DailySalary(
            user_id=current_user.id,
            date=date_str,
            year=year,
            month=month,
            week=week,
            day=day,
            base_salary=effective_base,
            slack_salary=effective_slack,
            total_salary=effective_total,
            slack_count=effective_cnt,
            slack_duration=effective_dur,
            updated_at=datetime.utcnow()
        )
        db.add(salary_record)
    else:
        salary_record.base_salary = effective_base
        salary_record.slack_salary = effective_slack
        salary_record.total_salary = effective_total
        salary_record.slack_count = effective_cnt
        salary_record.slack_duration = effective_dur
        salary_record.updated_at = datetime.utcnow()

    try:
        db.commit()
        db.refresh(salary_record)
    except Exception:
        db.rollback()
        salary_record = db.query(DailySalary).filter(
            DailySalary.user_id == current_user.id,
            DailySalary.date == date_str
        ).first()

    return salary_record

@router.get("/my-history", response_model=List[DailySalaryOut], summary="获取当前用户的历史每日工资记录")
def get_my_salary_history(
    limit: int = Query(100, ge=1, le=365),
    year: Optional[int] = None,
    month: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query = db.query(DailySalary).filter(DailySalary.user_id == current_user.id)
    if year:
        query = query.filter(DailySalary.year == year)
    if month:
        query = query.filter(DailySalary.month == month)

    salaries = query.order_by(DailySalary.date.desc()).limit(limit).all()

    # 兜底规范：若历史记录 base_salary 为 0，在响应对象中规范展示，不执行写库副作用
    profile = current_user.profile
    default_base = round((float(profile.salary) if profile and profile.salary else 10000.0) / (float(profile.work_days) if profile and profile.work_days else 21.75), 2)
    for s in salaries:
        if not s.base_salary or float(s.base_salary) <= 0:
            s.base_salary = default_base
            s.total_salary = round(default_base + float(s.slack_salary or 0.0), 2)

    return salaries

