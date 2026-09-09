from typing import List, Optional
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from app.core.database import get_db
from app.models.user import User
from app.models.profile import UserProfile
from app.models.record import SlackRecord
from app.models.salary import DailySalary
from app.api.deps import get_current_admin

router = APIRouter(prefix="/admin", tags=["后台管理与数据看板"])

@router.get("/users", summary="获取所有打工人账号列表与档案")
def get_all_users(admin: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    users = db.query(User).order_by(User.id.desc()).all()
    result = []
    for u in users:
        p = u.profile
        # 统计每个人的摸鱼总收益
        total_slack_earn = db.query(func.coalesce(func.sum(SlackRecord.earned), 0.0)).filter(SlackRecord.user_id == u.id).scalar()
        total_slack_dur = db.query(func.coalesce(func.sum(SlackRecord.duration), 0)).filter(SlackRecord.user_id == u.id).scalar()
        total_slack_count = db.query(func.count(SlackRecord.id)).filter(SlackRecord.user_id == u.id).scalar()

        result.append({
            "id": u.id,
            "username": u.username,
            "nickname": u.nickname,
            "role": u.role,
            "device_id": u.device_id,
            "created_at": u.created_at.strftime("%Y-%m-%d %H:%M"),
            "salary": p.salary if p else 10000.0,
            "work_days": p.work_days if p else 21.75,
            "work_hours": f"{p.work_start} ~ {p.work_end}" if p else "08:30 ~ 17:30",
            "total_slack_earned": round(float(total_slack_earn), 2),
            "total_slack_duration": int(total_slack_dur),
            "total_slack_count": int(total_slack_count),
        })
    return result

@router.get("/stats", summary="获取多维统计数据看板(年/月/周/日)")
def get_stats(
    dimension: str = Query("day", regex="^(today|day|week|month|year|all)$"),
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    now = datetime.now()
    today_str = now.strftime("%Y-%m-%d")
    current_year = now.year
    current_month = now.month
    current_week = now.isocalendar()[1]

    # 根据维度筛选 daily_salaries 表
    query = db.query(DailySalary)
    rec_query = db.query(SlackRecord)

    if dimension in ("today", "day"):
        query = query.filter(DailySalary.date == today_str)
        start_today = datetime.combine(now.date(), datetime.min.time())
        rec_query = rec_query.filter(SlackRecord.created_at >= start_today)
    elif dimension == "week":
        query = query.filter(DailySalary.year == current_year, DailySalary.week == current_week)
        start_week = now - timedelta(days=now.weekday())
        start_week = datetime.combine(start_week.date(), datetime.min.time())
        rec_query = rec_query.filter(SlackRecord.created_at >= start_week)
    elif dimension == "month":
        query = query.filter(DailySalary.year == current_year, DailySalary.month == current_month)
        start_month = datetime(current_year, current_month, 1)
        rec_query = rec_query.filter(SlackRecord.created_at >= start_month)
    elif dimension == "year":
        query = query.filter(DailySalary.year == current_year)
        start_year = datetime(current_year, 1, 1)
        rec_query = rec_query.filter(SlackRecord.created_at >= start_year)
    # dimension == "all" 时不限制

    # 1. 汇总数值
    total_base = db.query(func.coalesce(func.sum(DailySalary.base_salary), 0.0)).filter(query.whereclause if query.whereclause is not None else True).scalar()
    total_slack = db.query(func.coalesce(func.sum(DailySalary.slack_salary), 0.0)).filter(query.whereclause if query.whereclause is not None else True).scalar()
    total_earned = total_base + total_slack
    total_slack_count = db.query(func.coalesce(func.sum(DailySalary.slack_count), 0)).filter(query.whereclause if query.whereclause is not None else True).scalar()
    total_slack_duration = db.query(func.coalesce(func.sum(DailySalary.slack_duration), 0)).filter(query.whereclause if query.whereclause is not None else True).scalar()

    # 2. 摸鱼分类占比排行 (从 slack_records 表聚合)
    cat_stats = db.query(
        SlackRecord.category_id,
        func.count(SlackRecord.id).label("count"),
        func.sum(SlackRecord.duration).label("duration"),
        func.sum(SlackRecord.earned).label("earned")
    ).filter(rec_query.whereclause if rec_query.whereclause is not None else True)\
     .group_by(SlackRecord.category_id)\
     .order_by(desc("earned")).all()

    category_ranks = [
        {
            "category_id": c[0],
            "count": int(c[1]),
            "duration": int(c[2] or 0),
            "earned": round(float(c[3] or 0.0), 2)
        }
        for c in cat_stats
    ]

    # 3. 摸鱼英雄榜 (按个人摸鱼白嫖收益排名)
    user_slack_ranks = db.query(
        User.id,
        User.username,
        User.nickname,
        func.coalesce(func.sum(DailySalary.slack_salary), 0.0).label("slack_sum"),
        func.coalesce(func.sum(DailySalary.slack_count), 0).label("count_sum"),
        func.coalesce(func.sum(DailySalary.slack_duration), 0).label("duration_sum")
    ).join(DailySalary, DailySalary.user_id == User.id)\
     .filter(query.whereclause if query.whereclause is not None else True)\
     .group_by(User.id, User.username, User.nickname)\
     .order_by(desc("slack_sum")).limit(10).all()

    leaderboard = [
        {
            "user_id": r[0],
            "username": r[1],
            "nickname": r[2],
            "slack_salary": round(float(r[3]), 2),
            "slack_count": int(r[4]),
            "slack_duration": int(r[5])
        }
        for r in user_slack_ranks
    ]

    # 4. 近期工资流水记录列表
    recent_salaries = query.order_by(DailySalary.date.desc(), DailySalary.id.desc()).limit(30).all()
    salary_list = []
    for s in recent_salaries:
        salary_list.append({
            "id": s.id,
            "user_id": s.user_id,
            "username": s.user.username if s.user else "未知",
            "nickname": s.user.nickname if s.user else "未知",
            "date": s.date,
            "year": s.year,
            "month": s.month,
            "week": s.week,
            "day": s.day,
            "base_salary": round(s.base_salary, 2),
            "slack_salary": round(s.slack_salary, 2),
            "total_salary": round(s.total_salary, 2),
            "slack_count": s.slack_count,
            "slack_duration": s.slack_duration
        })

    return {
        "dimension": dimension,
        "summary": {
            "total_base_salary": round(float(total_base), 2),
            "total_slack_salary": round(float(total_slack), 2),
            "total_earned": round(float(total_earned), 2),
            "total_slack_count": int(total_slack_count),
            "total_slack_duration": int(total_slack_duration)
        },
        "category_ranks": category_ranks,
        "leaderboard": leaderboard,
        "salary_list": salary_list
    }
