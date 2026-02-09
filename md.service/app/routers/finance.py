from fastapi import APIRouter

from ..data_loader import load_json

router = APIRouter(prefix="/finance", tags=["finance"])


@router.get("/invoices")
def list_invoices():
  return load_json("invoices.json")


@router.get("/payments")
def list_payments():
  return load_json("payments.json")

