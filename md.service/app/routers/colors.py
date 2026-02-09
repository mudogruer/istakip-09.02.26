import uuid
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..data_loader import load_json, save_json

router = APIRouter(prefix="/colors", tags=["colors"])


class ColorIn(BaseModel):
  name: str
  code: str


@router.get("/")
def list_colors():
  try:
    return load_json("colors.json")
  except FileNotFoundError:
    # Initialize if not exists
    data = []
    save_json("colors.json", data)
    return data


@router.post("/", status_code=201)
def create_color(payload: ColorIn):
  colors = list_colors()
  # Check duplicates
  if any(c["code"] == payload.code for c in colors):
    raise HTTPException(status_code=400, detail="Renk kodu zaten mevcut")
  
  new_color = {
      "id": f"CLR-{str(uuid.uuid4())[:8].upper()}",
      "name": payload.name,
      "code": payload.code
  }
  colors.append(new_color)
  save_json("colors.json", colors)
  return new_color


@router.put("/{color_id}")
def update_color(color_id: str, payload: ColorIn):
  colors = list_colors()
  for idx, c in enumerate(colors):
    if c["id"] == color_id:
      colors[idx] = {
          **c,
          "name": payload.name,
          "code": payload.code
      }
      save_json("colors.json", colors)
      return colors[idx]
  raise HTTPException(status_code=404, detail="Renk bulunamadı")


@router.delete("/{color_id}")
def delete_color(color_id: str):
  colors = list_colors()
  colors = [c for c in colors if c["id"] != color_id]
  save_json("colors.json", colors)
  return {"success": True}
