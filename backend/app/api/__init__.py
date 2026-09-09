from fastapi import APIRouter
from app.api import auth, profile, records, salary, admin

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(profile.router)
api_router.include_router(records.router)
api_router.include_router(salary.router)
api_router.include_router(admin.router)
