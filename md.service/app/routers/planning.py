from fastapi import APIRouter

from ..data_loader import load_json

router = APIRouter(prefix="/planning", tags=["planning"])


@router.get("/events")
def list_events():
  return load_json("planningEvents.json")

