from typing import List, Optional
from datetime import datetime, timedelta, time
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, desc
from app.core.database import get_db
from app.models.user import User
from app.models.record import SlackRecord
from app.models.salary import DailySalary
from app.schemas.schemas import AdminStatsResponse
from app.api.deps import get_current_admin

router = APIRouter(prefix="/admin", tags=["后台管理与数据看板"])

@router.get("/users", summary="获取所有打工人账号列表与档案")
def get_all_users(admin: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    users = db.query(User).options(joinedload(User.profile)).order_by(User.id.desc()).all()
    if not users:
        return []

    # 1次批量聚合全体员工的摸鱼统计，彻底消除 1+4N 的 N+1 查询风暴
    stats_query = db.query(
        SlackRecord.user_id,
        func.coalesce(func.sum(SlackRecord.earned), 0.0).label("earned"),
        func.coalesce(func.sum(SlackRecord.duration), 0).label("duration"),
        func.count(SlackRecord.id).label("count")
    ).group_by(SlackRecord.user_id).all()

    stats_map = {row.user_id: row for row in stats_query}

    result = []
    for u in users:
        p = u.profile
        st = stats_map.get(u.id)
        total_slack_earn = float(st.earned) if st else 0.0
        total_slack_dur = int(st.duration) if st else 0
        total_slack_count = int(st.count) if st else 0

        salary_val = float(p.salary) if p and p.salary else 10000.0
        work_days_val = float(p.work_days) if p and p.work_days else 21.75
        work_hours_val = f"{p.work_start} ~ {p.work_end}" if p else "08:30 ~ 17:30"

        result.append({
            "id": u.id,
            "username": u.username,
            "nickname": u.nickname,
            "role": u.role,
            "device_id": u.device_id,
            "created_at": u.created_at.strftime("%Y-%m-%d %H:%M") if u.created_at else "",
            "salary": salary_val,
            "work_days": work_days_val,
            "work_hours": work_hours_val,
            "profile": {
                "salary": salary_val,
                "work_days": work_days_val,
                "work_start": p.work_start if p else "08:30",
                "work_end": p.work_end if p else "17:30",
                "lunch_start": p.lunch_start if p else "12:00",
                "lunch_end": p.lunch_end if p else "13:30",
            },
            "total_slack_earned": round(total_slack_earn, 2),
            "total_slack_duration": total_slack_dur,
            "total_slack_count": total_slack_count,
        })
    return result

@router.get("/stats", response_model=AdminStatsResponse, summary="获取多维统计数据看板(年/月/周/日)")
def get_stats(
    dimension: str = Query("day", pattern="^(today|day|week|month|year|all)$"),
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    now = datetime.now()
    today_str = now.strftime("%Y-%m-%d")
    current_year = now.year
    current_month = now.month
    current_week = now.isocalendar()[1]

    salary_filters = []
    record_filters = []

    if dimension in ("today", "day"):
        salary_filters.append(DailySalary.date == today_str)
        start_t = datetime.combine(now.date(), time.min)
        record_filters.append(SlackRecord.start_time >= start_t)
        days_multiplier = 1.0
    elif dimension == "week":
        salary_filters.extend([DailySalary.year == current_year, DailySalary.week == current_week])
        start_w = now - timedelta(days=now.weekday())
        start_w_dt = datetime.combine(start_w.date(), time.min)
        record_filters.append(SlackRecord.start_time >= start_w_dt)
        days_multiplier = 5.0
    elif dimension == "month":
        salary_filters.extend([DailySalary.year == current_year, DailySalary.month == current_month])
        start_m_dt = datetime(current_year, current_month, 1)
        record_filters.append(SlackRecord.start_time >= start_m_dt)
        days_multiplier = 21.75
    elif dimension == "year":
        salary_filters.append(DailySalary.year == current_year)
        start_y_dt = datetime(current_year, 1, 1)
        record_filters.append(SlackRecord.start_time >= start_y_dt)
        # 修复整年出勤底薪只算1个月的Bug：按本年已过的月份自然核算
        days_multiplier = max(1.0, float(current_month)) * 21.75
    else: # all
        days_multiplier = 12.0 * 21.75

    # 1. 摸鱼分类排行 (通过标准 SQL 过滤与聚合)
    cat_query = db.query(
        SlackRecord.category_id,
        func.count(SlackRecord.id).label("count"),
        func.sum(SlackRecord.duration).label("duration"),
        func.sum(SlackRecord.earned).label("earned")
    )
    if record_filters:
        cat_query = cat_query.filter(*record_filters)
    cat_stats = cat_query.group_by(SlackRecord.category_id).order_by(desc("earned")).all()

    category_ranks = [
        {
            "category_id": c[0],
            "count": int(c[1]),
            "duration": int(c[2] or 0),
            "earned": round(float(c[3] or 0.0), 2)
        }
        for c in cat_stats
    ]

    # 2. 批量查询全员摸鱼明细，避免逐人循环查询 (消除 N+1)
    all_users = db.query(User).options(joinedload(User.profile)).all()
    user_rec_query = db.query(
        SlackRecord.user_id,
        func.coalesce(func.sum(SlackRecord.earned), 0.0).label("earned"),
        func.coalesce(func.sum(SlackRecord.duration), 0).label("duration"),
        func.count(SlackRecord.id).label("count")
    )
    if record_filters:
        user_rec_query = user_rec_query.filter(*record_filters)
    user_rec_stats = user_rec_query.group_by(SlackRecord.user_id).all()
    user_stats_map = {row.user_id: row for row in user_rec_stats}

    user_details = []
    for u in all_users:
        p = u.profile
        u_salary = float(p.salary) if p and p.salary else 10000.0
        u_days = float(p.work_days) if p and p.work_days else 21.75
        daily_rate = round(u_salary / (u_days or 21.75), 2)

        st = user_stats_map.get(u.id)
        u_slack_earn = round(float(st.earned), 2) if st else 0.0
        u_slack_dur = int(st.duration) if st else 0
        u_slack_cnt = int(st.count) if st else 0

        u_base = round(daily_rate * days_multiplier, 2)
        u_total = round(u_base + u_slack_earn, 2)

        user_details.append({
            "user_id": u.id,
            "username": u.username,
            "nickname": u.nickname,
            "role": u.role,
            "salary": u_salary,
            "work_hours": f"{p.work_start} ~ {p.work_end}" if p else "08:30 ~ 17:30",
            "base_salary": u_base,
            "slack_salary": u_slack_earn,
            "total_slack_salary": u_slack_earn,
            "total_salary": u_total,
            "slack_count": u_slack_cnt,
            "slack_duration": u_slack_dur,
            "total_slack_duration": u_slack_dur,
            "earned": u_slack_earn,
            "duration": u_slack_dur
        })

    # 3. 摸鱼战神英雄榜
    leaderboard = sorted(user_details, key=lambda x: x["slack_salary"], reverse=True)

    # 4. 汇总大盘核心指标
    final_base_salary = round(sum(u["base_salary"] for u in user_details), 2)
    final_slack_salary = round(sum(u["slack_salary"] for u in user_details), 2)
    final_total_salary = round(final_base_salary + final_slack_salary, 2)
    final_slack_count = sum(u["slack_count"] for u in user_details)
    final_slack_duration = sum(u["slack_duration"] for u in user_details)

    return {
        "dimension": dimension,
        "summary": {
            "total_base_salary": final_base_salary,
            "total_slack_salary": final_slack_salary,
            "total_earned": final_total_salary,
            "total_slack_count": final_slack_count,
            "total_slack_duration": final_slack_duration
        },
        "category_ranks": category_ranks,
        "category_stats": category_ranks,
        "leaderboard": leaderboard[:10],
        "hero_rankings": leaderboard[:10],
        "user_details": user_details
    }

@router.get("/salaries", summary="获取每日工资表快照流水")
def get_all_salaries(
    limit: int = Query(100, ge=1, le=500),
    user_id: Optional[int] = None,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    query = db.query(DailySalary).options(
        joinedload(DailySalary.user).joinedload(User.profile)
    )
    if user_id:
        query = query.filter(DailySalary.user_id == user_id)

    salaries = query.order_by(DailySalary.date.desc(), DailySalary.id.desc()).limit(limit).all()

    result = []
    for s in salaries:
        u = s.user
        base_sal = float(s.base_salary) if s.base_salary and float(s.base_salary) > 0 else (
            round((float(u.profile.salary) if u and u.profile and u.profile.salary else 10000.0) / (
                float(u.profile.work_days) if u and u.profile and u.profile.work_days else 21.75
            ), 2)
        )
        slack_sal = float(s.slack_salary or 0.0)
        tot_sal = float(s.total_salary) if s.total_salary and float(s.total_salary) > 0 else (base_sal + slack_sal)

        result.append({
            "id": s.id,
            "user_id": s.user_id,
            "user_nickname": u.nickname if u else f"打工人#{s.user_id}",
            "user_username": u.username if u else "未知",
            "date": s.date,
            "year": s.year,
            "month": s.month,
            "week": s.week,
            "day": s.day,
            "base_salary": round(base_sal, 2),
            "slack_salary": round(slack_sal, 2),
            "total_salary": round(tot_sal, 2),
            "slack_count": int(s.slack_count or 0),
            "slack_duration": int(s.slack_duration or 0),
            "updated_at": s.updated_at.strftime("%Y-%m-%d %H:%M") if s.updated_at else ""
        })
    return result
