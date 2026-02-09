from fastapi import APIRouter

from ..data_loader import load_json

router = APIRouter(prefix="/archive", tags=["archive"])


@router.get("/files")
def list_files():
  return load_json("archiveFiles.json")

