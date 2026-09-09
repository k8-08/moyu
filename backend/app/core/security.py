import base64
import io
import random
import string
import time
import uuid
from datetime import datetime, timedelta
from typing import Any, Optional, Union
from jose import jwt
import bcrypt

# 修复 passlib 与新版本 bcrypt 的 __about__ 兼容性
if not hasattr(bcrypt, "__about__"):
    class About:
        __version__ = getattr(bcrypt, "__version__", "4.0.0")
    bcrypt.__about__ = About()

# 密码处理使用原生 bcrypt，自动截断前 72 字节，彻底杜绝 passlib 兼容性报错
def verify_password(plain_password: str, hashed_password: str) -> bool:
    if not plain_password or not hashed_password:
        return False
    try:
        pwd_bytes = plain_password.encode("utf-8")[:72]
        hash_bytes = hashed_password.encode("utf-8")
        return bcrypt.checkpw(pwd_bytes, hash_bytes)
    except Exception:
        return False

def get_password_hash(password: str) -> str:
    pwd_bytes = (password or "").encode("utf-8")[:72]
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(pwd_bytes, salt).decode("utf-8")

def create_access_token(subject: Union[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(days=settings.ACCESS_TOKEN_EXPIRE_DAYS)
    to_encode = {"exp": expire, "sub": str(subject)}
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt

def generate_captcha(length: int = 4) -> dict:
    now = time.time()
    expired_keys = [k for k, v in CAPTCHA_CACHE.items() if v[1] < now]
    for k in expired_keys:
        CAPTCHA_CACHE.pop(k, None)

    chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
    code = "".join(random.choice(chars) for _ in range(length))
    captcha_id = str(uuid.uuid4())

    CAPTCHA_CACHE[captcha_id] = (code.lower(), now + 300)

    width, height = 120, 42
    image = Image.new("RGB", (width, height), color=(255, 248, 231))
    draw = ImageDraw.Draw(image)

    for _ in range(5):
        x1 = random.randint(0, width)
        y1 = random.randint(0, height)
        x2 = random.randint(0, width)
        y2 = random.randint(0, height)
        draw.line((x1, y1, x2, y2), fill=(random.randint(150, 220), random.randint(150, 220), random.randint(150, 220)), width=1)

    for _ in range(80):
        xy = (random.randint(0, width), random.randint(0, height))
        draw.point(xy, fill=(random.randint(100, 180), random.randint(100, 180), random.randint(100, 180)))

    for i, char in enumerate(code):
        x = 18 + i * 24 + random.randint(-2, 2)
        y = random.randint(8, 14)
        draw.text((x, y), char, fill=(17, 17, 17))

    buf = io.BytesIO()
    image.save(buf, format="PNG")
    img_b64 = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("utf-8")

    return {"captcha_id": captcha_id, "image": img_b64}

def verify_captcha(captcha_id: str, input_code: str) -> bool:
    if not captcha_id or not input_code:
        return False
    item = CAPTCHA_CACHE.get(captcha_id)
    if not item:
        return False
    real_code, expire_time = item
    if time.time() > expire_time:
        CAPTCHA_CACHE.pop(captcha_id, None)
        return False
    CAPTCHA_CACHE.pop(captcha_id, None)
    return real_code.lower() == input_code.strip().lower()