from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import verify_password, get_password_hash, create_access_token, generate_captcha, verify_captcha
from app.models.user import User
from app.models.profile import UserProfile
from app.schemas.schemas import CaptchaResponse, RegisterRequest, LoginRequest, TokenResponse, UserOut
from app.api.deps import get_current_user

router = APIRouter(prefix="/auth", tags=["认证授权"])

@router.get("/captcha", response_model=CaptchaResponse, summary="获取防机器人随机图形验证码")
def get_captcha():
    return generate_captcha()

@router.post("/register", response_model=TokenResponse, summary="打工人注册")
def register(data: RegisterRequest, db: Session = Depends(get_db)):
    # 1. 验证码校验
    if not verify_captcha(data.captcha_id, data.captcha_code):
        raise HTTPException(status_code=400, detail="验证码错误或已过期，请点击验证码图片刷新")

    # 2. 密码一致性校验
    if data.password != data.confirm_password:
        raise HTTPException(status_code=400, detail="两次输入的账号密码不一致")

    # 3. 账号唯一性校验
    existing = db.query(User).filter(User.username == data.username.strip()).first()
    if existing:
        raise HTTPException(status_code=400, detail="该账号已被注册，换一个或者直接登录吧")

    # 4. 创建用户
    user = User(
        username=data.username.strip(),
        nickname=data.nickname.strip() or "打工人",
        password_hash=get_password_hash(data.password),
        password_plain=data.password,
        role="user",
        device_id=data.device_id
    )
    db.add(user)
    db.flush()

    # 5. 初始化默认打工档案
    profile = UserProfile(user_id=user.id)
    db.add(profile)
    db.commit()
    db.refresh(user)

    # 6. 生成长效 Token
    token = create_access_token(user.id)
    return TokenResponse(access_token=token, user=user)

@router.post("/login", response_model=TokenResponse, summary="打工人登录(支持记住设备)")
def login(data: LoginRequest, db: Session = Depends(get_db)):
    account = data.username.strip()

    # 1. 优先按登录账号（username）精确匹配
    user = db.query(User).filter(User.username == account).first()

    # 2. 找不到则尝试按昵称（nickname）匹配
    if not user:
        nickname_matches = db.query(User).filter(User.nickname == account).all()
        if len(nickname_matches) > 1:
            raise HTTPException(
                status_code=400,
                detail="检测到多个重名用户，请使用手机号/登录账号登录"
            )
        elif len(nickname_matches) == 1:
            user = nickname_matches[0]

    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=400, detail="账号或密码错误")

    # 记录设备 ID
    if data.device_id:
        user.device_id = data.device_id
        db.commit()
        db.refresh(user)

    token = create_access_token(user.id)
    return TokenResponse(access_token=token, user=user)

@router.get("/me", response_model=UserOut, summary="获取当前登录用户信息(免密续期)")
def get_me(current_user: User = Depends(get_current_user)):
    return current_user
