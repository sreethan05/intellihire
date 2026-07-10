from fastapi import APIRouter
from fastapi.responses import RedirectResponse

router = APIRouter(prefix="/api/docs", tags=["docs"])

@router.get("")
@router.get("/")
async def get_docs():
    return RedirectResponse(url="/docs")

@router.get("/json")
async def get_docs_json():
    return RedirectResponse(url="/openapi.json")
