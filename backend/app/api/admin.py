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
            "total_slack_earned": round(float(total_slack_earn), 2),
            "total_slack_duration": int(total_slack_dur),
            "total_slack_count": int(total_slack_count),
        })
    return result

@router.get("/stats", summary="获取多维统计数据看板(年/月/周/日)")
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

    # 根据维度筛选 daily_salaries 表与 slack_records 表
    salary_q = db.query(DailySalary)
    rec_q = db.query(SlackRecord)

    if dimension in ("today", "day"):
        salary_q = salary_q.filter(DailySalary.date == today_str)
        start_t = datetime.combine(now.date(), datetime.min.time())
        rec_q = rec_q.filter(SlackRecord.created_at >= start_t)
    elif dimension == "week":
        salary_q = salary_q.filter(DailySalary.year == current_year, DailySalary.week == current_week)
        start_w = now - timedelta(days=now.weekday())
        start_w = datetime.combine(start_w.date(), datetime.min.time())
        rec_q = rec_q.filter(SlackRecord.created_at >= start_w)
    elif dimension == "month":
        salary_q = salary_q.filter(DailySalary.year == current_year, DailySalary.month == current_month)
        start_m = datetime(current_year, current_month, 1)
        rec_q = rec_q.filter(SlackRecord.created_at >= start_m)
    elif dimension == "year":
        salary_q = salary_q.filter(DailySalary.year == current_year)
        start_y = datetime(current_year, 1, 1)
        rec_q = rec_q.filter(SlackRecord.created_at >= start_y)

    # 1. 摸鱼分类排行 (从 slack_records 聚合)
    cat_stats = db.query(
        SlackRecord.category_id,
        func.count(SlackRecord.id).label("count"),
        func.sum(SlackRecord.duration).label("duration"),
        func.sum(SlackRecord.earned).label("earned")
    ).filter(rec_q.whereclause if rec_q.whereclause is not None else True)\
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

    # 2. 统计核心数值 (结合 DailySalary 与 SlackRecord，避免任何数据对应落空)
    total_base = db.query(func.coalesce(func.sum(DailySalary.base_salary), 0.0))\
                   .filter(salary_q.whereclause if salary_q.whereclause is not None else True).scalar()
    total_slack_sal = db.query(func.coalesce(func.sum(DailySalary.slack_salary), 0.0))\
                        .filter(salary_q.whereclause if salary_q.whereclause is not None else True).scalar()
    total_slack_cnt = db.query(func.coalesce(func.sum(DailySalary.slack_count), 0))\
                        .filter(salary_q.whereclause if salary_q.whereclause is not None else True).scalar()
    total_slack_dur = db.query(func.coalesce(func.sum(DailySalary.slack_duration), 0))\
                        .filter(salary_q.whereclause if salary_q.whereclause is not None else True).scalar()

    # 如果分类有摸鱼记录，但 daily_salaries 还没来得及上报生成，以真实的摸鱼流水为准
    cat_sum_earned = sum(c["earned"] for c in category_ranks)
    cat_sum_count = sum(c["count"] for c in category_ranks)
    cat_sum_duration = sum(c["duration"] for c in category_ranks)

    final_slack_salary = max(float(total_slack_sal), cat_sum_earned)
    final_slack_count = max(int(total_slack_cnt), cat_sum_count)
    final_slack_duration = max(int(total_slack_dur), cat_sum_duration)

    all_users = db.query(User).all()
    user_count = len(all_users)

    # 如果 base_salary 为 0 且当天有用户摸鱼或在册，按在册员工估算出勤工资基数
    final_base_salary = float(total_base)
    if final_base_salary == 0 and user_count > 0:
        # 每位员工根据月薪计算当日出勤保底
        for u in all_users:
            p = u.profile
            sal = p.salary if p and p.salary else 10000.0
            days = p.work_days if p and p.work_days else 21.75
            final_base_salary += (sal / days) * 0.5  # 半天出勤基底

    final_total_salary = final_base_salary + final_slack_salary

    # 3. 员工详细数据明细 (多维看板中间的员工详细数据表格)
    user_details = []
    for u in all_users:
        p = u.profile
        u_salary = p.salary if p and p.salary else 10000.0
        u_days = p.work_days if p and p.work_days else 21.75
        daily_rate = round(u_salary / u_days, 2)

        # 查该员工在当前维度下的摸鱼收益
        u_rec_q = db.query(
            func.coalesce(func.sum(SlackRecord.earned), 0.0),
            func.coalesce(func.sum(SlackRecord.duration), 0),
            func.count(SlackRecord.id)
        ).filter(SlackRecord.user_id == u.id)
        if dimension in ("today", "day"):
            start_t = datetime.combine(now.date(), datetime.min.time())
            u_rec_q = u_rec_q.filter(SlackRecord.created_at >= start_t)
        elif dimension == "week":
            start_w = now - timedelta(days=now.weekday())
            u_rec_q = u_rec_q.filter(SlackRecord.created_at >= datetime.combine(start_w.date(), datetime.min.time()))
        elif dimension == "month":
            u_rec_q = u_rec_q.filter(SlackRecord.created_at >= datetime(current_year, current_month, 1))
        elif dimension == "year":
            u_rec_q = u_rec_q.filter(SlackRecord.created_at >= datetime(current_year, 1, 1))

        u_slack_earn, u_slack_dur, u_slack_cnt = u_rec_q.first()
        u_slack_earn = round(float(u_slack_earn), 2)
        u_slack_dur = int(u_slack_dur)
        u_slack_cnt = int(u_slack_cnt)

        # 出勤基本工资 (当前维度)
        u_base = daily_rate if dimension in ("today", "day") else daily_rate * (5 if dimension == "week" else 21.75)
        u_base = round(u_base, 2)
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

    # 4. 摸鱼战神英雄榜 (按个人摸鱼白嫖收益降序排序)
    leaderboard = sorted(user_details, key=lambda x: x["slack_salary"], reverse=True)

    # 顶栏出勤工资汇总与员工明细出勤工资保持完全一致
    user_detail_base_sum = sum(u["base_salary"] for u in user_details)
    user_detail_slack_sum = sum(u["slack_salary"] for u in user_details)
    final_base_salary = round(user_detail_base_sum, 2)
    final_slack_salary = round(max(final_slack_salary, user_detail_slack_sum), 2)
    final_total_salary = round(final_base_salary + final_slack_salary, 2)

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
        "leaderboard": leaderboard[:10],
        "user_details": user_details
    }

@router.get("/salaries", summary="获取每日工资表快照流水")
def get_all_salaries(
    limit: int = Query(100, ge=1, le=500),
    user_id: Optional[int] = None,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    query = db.query(DailySalary)
    if user_id:
        query = query.filter(DailySalary.user_id == user_id)

    salaries = query.order_by(DailySalary.date.desc(), DailySalary.id.desc()).limit(limit).all()

    # 自动纠偏：若历史记录中 base_salary 为 0，根据员工档案日薪校准
    has_fixed = False
    for s in salaries:
        if not s.base_salary or float(s.base_salary) <= 0:
            u = s.user
            if u and u.profile:
                p_sal = u.profile.salary or 10000.0
                p_days = u.profile.work_days or 21.75
                s.base_salary = round(p_sal / p_days, 2)
                s.total_salary = round(float(s.base_salary) + float(s.slack_salary or 0.0), 2)
                has_fixed = True
    if has_fixed:
        db.commit()

    result = []
    for s in salaries:
        u = s.user
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
            "base_salary": round(float(s.base_salary), 2),
            "slack_salary": round(float(s.slack_salary), 2),
            "total_salary": round(float(s.total_salary), 2),
            "slack_count": int(s.slack_count),
            "slack_duration": int(s.slack_duration),
            "updated_at": s.updated_at.strftime("%Y-%m-%d %H:%M") if s.updated_at else ""
        })
    return result
