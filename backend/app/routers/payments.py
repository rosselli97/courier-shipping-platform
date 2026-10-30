from __future__ import annotations

from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import STRIPE_SECRET_KEY, TOPUP_PACKAGES
from ..database import get_db
from ..deps import require_reseller
from ..models import Payment, User, WalletTx
from ..schemas import CheckoutRequest, CheckoutResponse, PaymentStatus

router = APIRouter(prefix="/payments", tags=["payments"])


def _credit(db: Session, payment: Payment, user: User) -> None:
    if payment.credited:
        return
    user.wallet_balance = round(user.wallet_balance + payment.amount, 2)
    payment.credited = True
    payment.payment_status = "paid"
    payment.status = "complete"
    db.add(
        WalletTx(
            user_id=user.id,
            type="stripe_topup",
            amount=round(payment.amount, 2),
            ref=payment.session_id,
            note="Ricarica portafoglio",
            balance_after=user.wallet_balance,
        )
    )
    db.commit()


@router.post("/checkout", response_model=CheckoutResponse)
def checkout(body: CheckoutRequest, user: User = Depends(require_reseller), db: Session = Depends(get_db)):
    amount = int(body.package_id)
    if amount not in TOPUP_PACKAGES:
        raise HTTPException(status_code=422, detail="Pacchetto non valido")
    origin = body.origin_url.rstrip("/")

    if STRIPE_SECRET_KEY:
        import stripe

        stripe.api_key = STRIPE_SECRET_KEY
        try:
            session = stripe.checkout.Session.create(
                mode="payment",
                line_items=[
                    {
                        "price_data": {
                            "currency": "eur",
                            "unit_amount": amount * 100,
                            "product_data": {"name": f"Ricarica portafoglio MUVPACK - {amount} EUR"},
                        },
                        "quantity": 1,
                    }
                ],
                success_url=f"{origin}/dashboard?session_id={{CHECKOUT_SESSION_ID}}",
                cancel_url=f"{origin}/dashboard?payment=cancel",
                customer_email=user.email,
                metadata={"user_id": user.id, "package_id": body.package_id},
            )
        except Exception as exc:
            raise HTTPException(status_code=502, detail="Impossibile avviare il pagamento") from exc
        payment = Payment(
            user_id=user.id,
            session_id=session.id,
            amount=float(amount),
            status=session.status or "open",
            payment_status=session.payment_status or "unpaid",
        )
        db.add(payment)
        db.commit()
        return CheckoutResponse(checkout_url=session.url, session_id=session.id)

    session_id = f"mock_{uuid4().hex}"
    payment = Payment(
        user_id=user.id,
        session_id=session_id,
        amount=float(amount),
        status="open",
        payment_status="unpaid",
    )
    db.add(payment)
    db.commit()
    return CheckoutResponse(
        checkout_url=f"{origin}/dashboard?session_id={session_id}",
        session_id=session_id,
    )


@router.get("/status/{session_id}", response_model=PaymentStatus)
def payment_status(session_id: str, user: User = Depends(require_reseller), db: Session = Depends(get_db)):
    payment = db.scalar(select(Payment).where(Payment.session_id == session_id))
    if payment is None or payment.user_id != user.id:
        raise HTTPException(status_code=404, detail="Sessione di pagamento non trovata")

    if STRIPE_SECRET_KEY and not session_id.startswith("mock_"):
        import stripe

        stripe.api_key = STRIPE_SECRET_KEY
        try:
            session = stripe.checkout.Session.retrieve(session_id)
        except Exception as exc:
            raise HTTPException(status_code=502, detail="Impossibile verificare il pagamento") from exc
        payment.status = session.status or payment.status
        payment.payment_status = session.payment_status or payment.payment_status
        if payment.payment_status == "paid":
            db.commit()
            _credit(db, payment, user)
        else:
            db.commit()
    elif not payment.credited:
        _credit(db, payment, user)

    db.refresh(user)
    db.refresh(payment)
    return PaymentStatus(
        session_id=payment.session_id,
        status=payment.status,
        payment_status=payment.payment_status,
        amount=round(payment.amount, 2),
        wallet_balance=round(user.wallet_balance, 2),
    )
