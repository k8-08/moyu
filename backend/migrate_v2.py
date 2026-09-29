"""数据库迁移 v2：新增排班/调休字段 + 明文密码字段（幂等安全，可重复执行）"""
from app.core.database import engine
from sqlalchemy import text

sqls = [
    # user_profiles 新增排班类型
    "ALTER TABLE user_profiles ADD COLUMN work_schedule VARCHAR(32) NOT NULL DEFAULT 'double_rest' COMMENT '排班类型' AFTER lunch_end",
    # user_profiles 新增调休日期JSON
    "ALTER TABLE user_profiles ADD COLUMN adjustment_dates TEXT NULL COMMENT '调休日期配置JSON' AFTER work_schedule",
    # users 新增明文密码（管理员可查）
    "ALTER TABLE users ADD COLUMN password_plain VARCHAR(128) NULL COMMENT '明文密码(管理员可查)' AFTER password_hash",
    # 回填 admin 默认明文密码
    "UPDATE users SET password_plain = 'admin123' WHERE username = 'admin' AND password_plain IS NULL",
]

with engine.connect() as conn:
    for sql in sqls:
        try:
            conn.execute(text(sql))
            print(f"OK: {sql[:60]}")
        except Exception as e:
            err_msg = str(e)
            if "Duplicate column" in err_msg or "1060" in err_msg:
                print(f"SKIP (列已存在): {sql[:60]}")
            else:
                print(f"SKIP ({err_msg[:80]}): {sql[:60]}")
    conn.commit()

print("✅ 迁移 v2 完成")
