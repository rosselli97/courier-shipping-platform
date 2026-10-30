from __future__ import annotations

import smtplib
from email.message import EmailMessage

from .config import SMTP_FROM, SMTP_HOST, SMTP_PASSWORD, SMTP_PORT, SMTP_USER
from .models import Shipment

TEMPLATE = """Ciao {name},

la tua spedizione MUVPACK e' stata creata.

Corriere: {courier}
Tratta: {origin} -> {dest}
Codice di tracciamento: {code}

Segui il pacco su https://muvpack.it/traccia/{code}

Grazie,
MUVPACK
"""


def send_shipment_email(shipment: Shipment) -> str:
    if not shipment.recipient_email:
        return "none"
    body = TEMPLATE.format(
        name=shipment.recipient_name,
        courier=shipment.courier.upper(),
        origin=shipment.origin_city,
        dest=shipment.dest_city,
        code=shipment.tracking_code,
    )
    if not SMTP_HOST:
        return "sent"
    message = EmailMessage()
    message["Subject"] = f"Spedizione MUVPACK {shipment.tracking_code}"
    message["From"] = SMTP_FROM
    message["To"] = shipment.recipient_email
    message.set_content(body)
    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10) as smtp:
            smtp.starttls()
            if SMTP_USER:
                smtp.login(SMTP_USER, SMTP_PASSWORD)
            smtp.send_message(message)
        return "sent"
    except Exception:
        return "failed"
