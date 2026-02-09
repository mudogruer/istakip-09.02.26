import json
import os
from functools import lru_cache
from pathlib import Path
from typing import Any


@lru_cache(maxsize=None)
def get_data_dir() -> Path:
  env_dir = os.getenv("DATA_DIR")
  if env_dir:
    return Path(env_dir).resolve()
  # default: md.data next to md.service
  return Path(__file__).resolve().parent.parent.parent / "md.data"


def load_json(filename: str) -> Any:
  data_dir = get_data_dir()
  path = data_dir / filename
  if not path.exists():
    raise FileNotFoundError(f"Data file not found: {path}")
  
  # Try different encodings
  for encoding in ["utf-8", "utf-8-sig", "utf-16", "latin-1"]:
    try:
      with path.open(encoding=encoding) as f:
        return json.load(f)
    except (UnicodeDecodeError, json.JSONDecodeError):
      continue
  
  # If all encodings fail, raise error
  raise ValueError(f"Cannot decode JSON file: {path}")


def save_json(filename: str, data: Any) -> None:
  data_dir = get_data_dir()
  data_dir.mkdir(parents=True, exist_ok=True)
  path = data_dir / filename
  # Atomic write: temp file + rename to prevent corruption
  temp_path = path.with_suffix(path.suffix + '.tmp')
  try:
    with temp_path.open("w", encoding="utf-8") as f:
      json.dump(data, f, ensure_ascii=False, indent=2)
    temp_path.replace(path)  # Atomic rename
  except Exception:
    if temp_path.exists():
      temp_path.unlink()
    raise


