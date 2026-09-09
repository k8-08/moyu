from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.user import User
from app.models.salary import DailySalary
from app.schemas.schemas import SalaryReportRequest, DailySalaryOut
from app.api.deps import get_current_user

router = APIRouter(prefix="/salary", tags=["工资表管理"])

@router.post("/report", response_model=DailySalaryOut, summary="上报/更新每日工资数据快照")
def report_daily_salary(data: SalaryReportRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # 解析日期年月日周 (未传时默认今天)
    date_str = data.date or datetime.now().strftime("%Y-%m-%d")
    dt = datetime.strptime(date_str, "%Y-%m-%d")
    year = dt.year
    month = dt.month
    day = dt.day
    week = dt.isocalendar()[1]

    # 计算该用户的日薪出勤基准保底
    profile = current_user.profile
    u_salary = profile.salary if profile and profile.salary else 10000.0
    u_days = profile.work_days if profile and profile.work_days else 21.75
    default_daily_base = round(u_salary / u_days, 2)

    # 确定有效出勤基本工资
    effective_base = float(data.base_salary) if data.base_salary and float(data.base_salary) > 0 else default_daily_base
    effective_slack = float(data.slack_salary or 0.0)
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
            slack_count=data.slack_count,
            slack_duration=data.slack_duration
        )
        db.add(salary_record)
    else:
        # 如果明确传入了有效日薪，使用传入的日薪；若未传或为0，才回退到已有记录或标准日薪
        if data.base_salary and float(data.base_salary) > 0:
            effective_base = float(data.base_salary)
        elif salary_record.base_salary and float(salary_record.base_salary) > 0:
            effective_base = float(salary_record.base_salary)
        else:
            effective_base = default_daily_base
        effective_total = round(effective_base + effective_slack, 2)

        salary_record.base_salary = effective_base
        salary_record.slack_salary = effective_slack
        salary_record.total_salary = effective_total
        salary_record.slack_count = data.slack_count
        salary_record.slack_duration = data.slack_duration
        salary_record.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(salary_record)
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

    # 兜底检查：如果历史记录里有 base_salary 为 0 的，自动修复为员工标准日薪
    profile = current_user.profile
    default_base = round((profile.salary if profile and profile.salary else 10000.0) / (profile.work_days if profile and profile.work_days else 21.75), 2)
    has_change = False
    for s in salaries:
        if not s.base_salary or float(s.base_salary) <= 0:
            s.base_salary = default_base
            s.total_salary = round(default_base + float(s.slack_salary or 0.0), 2)
            has_change = True
    if has_change:
        db.commit()

    return salaries

