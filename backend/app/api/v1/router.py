from fastapi import APIRouter

from app.api.v1 import buildings, crisis, export, geocode, health, map, photos, reports

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(crisis.router)
api_router.include_router(reports.router)
api_router.include_router(photos.router)
api_router.include_router(map.router)
api_router.include_router(geocode.router)
api_router.include_router(export.router)
api_router.include_router(buildings.router)
