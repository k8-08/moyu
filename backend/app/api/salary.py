from datetime import datetime
from fastapi import APIRouter, Depends
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
            base_salary=data.base_salary,
            slack_salary=data.slack_salary,
            total_salary=data.total_salary,
            slack_count=data.slack_count,
            slack_duration=data.slack_duration
        )
        db.add(salary_record)
    else:
        salary_record.base_salary = data.base_salary
        salary_record.slack_salary = data.slack_salary
        salary_record.total_salary = data.total_salary
        salary_record.slack_count = data.slack_count
        salary_record.slack_duration = data.slack_duration
        salary_record.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(salary_record)
    return salary_record
