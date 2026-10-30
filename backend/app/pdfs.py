from __future__ import annotations

import io
from datetime import datetime

from openpyxl import Workbook
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from .models import Shipment, User, WalletTx
from .pricing import COURIERS

BRAND = colors.HexColor("#FF5001")
NAVY = colors.HexColor("#03304D")


def _barcode(c: canvas.Canvas, value: str, x: float, y: float, width: float, height: float) -> None:
    seed = sum(ord(ch) * (i + 1) for i, ch in enumerate(value))
    bars = 48
    slot = width / bars
    c.setFillColor(colors.black)
    for i in range(bars):
        if (seed >> (i % 16)) & 1 or i % 3 == 0:
            c.rect(x + i * slot, y, slot * 0.6, height, stroke=0, fill=1)


def _label_page(c: canvas.Canvas, shipment: Shipment) -> None:
    width, height = A4
    margin = 18 * mm
    top = height - margin

    c.setFillColor(NAVY)
    c.rect(margin, top - 20 * mm, width - 2 * margin, 20 * mm, stroke=0, fill=1)
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 20)
    c.drawString(margin + 6 * mm, top - 13 * mm, "MUVPACK")
    c.setFont("Helvetica", 9)
    c.drawRightString(width - margin - 6 * mm, top - 8 * mm, "Lettera di vettura")
    c.drawRightString(width - margin - 6 * mm, top - 13 * mm, COURIERS[shipment.courier]["name"])

    y = top - 32 * mm
    c.setFillColor(colors.black)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(margin, y, "DESTINATARIO")
    c.setFont("Helvetica-Bold", 14)
    c.drawString(margin, y - 7 * mm, shipment.recipient_name)
    c.setFont("Helvetica", 11)
    c.drawString(margin, y - 13 * mm, shipment.recipient_address)
    c.drawString(margin, y - 19 * mm, f"{shipment.dest_cap} {shipment.dest_city}")
    if shipment.recipient_email:
        c.setFont("Helvetica", 9)
        c.drawString(margin, y - 25 * mm, shipment.recipient_email)

    box_y = y - 48 * mm
    c.setStrokeColor(colors.HexColor("#CBD5E1"))
    c.rect(margin, box_y, width - 2 * margin, 20 * mm, stroke=1, fill=0)
    c.setFont("Helvetica", 9)
    c.setFillColor(colors.HexColor("#475569"))
    c.drawString(margin + 4 * mm, box_y + 13 * mm, "MITTENTE")
    c.setFillColor(colors.black)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(margin + 4 * mm, box_y + 7 * mm, "MUVPACK Logistics")
    c.setFont("Helvetica", 9)
    c.drawString(margin + 4 * mm, box_y + 3 * mm, f"Partenza: {shipment.origin_cap} {shipment.origin_city}")

    meta_y = box_y - 14 * mm
    c.setFont("Helvetica", 9)
    c.setFillColor(colors.HexColor("#475569"))
    c.drawString(margin, meta_y, "PESO")
    c.drawString(margin + 45 * mm, meta_y, "COLLI")
    c.drawString(margin + 80 * mm, meta_y, "DATA")
    c.setFont("Helvetica-Bold", 11)
    c.setFillColor(colors.black)
    c.drawString(margin, meta_y - 6 * mm, f"{shipment.billable_weight_kg:.1f} kg")
    c.drawString(margin + 45 * mm, meta_y - 6 * mm, "1" + (" (pallet)" if shipment.is_pallet else ""))
    c.drawString(margin + 80 * mm, meta_y - 6 * mm, shipment.created_at.strftime("%d/%m/%Y"))

    barcode_y = meta_y - 42 * mm
    _barcode(c, shipment.tracking_code, margin, barcode_y, width - 2 * margin, 24 * mm)
    c.setFont("Helvetica-Bold", 14)
    c.drawCentredString(width / 2, barcode_y - 8 * mm, shipment.tracking_code)

    c.setFont("Helvetica", 8)
    c.setFillColor(colors.HexColor("#64748B"))
    c.drawCentredString(width / 2, margin, "Documento generato da MUVPACK - muvpack.it")


def labels_pdf(shipments: list[Shipment]) -> bytes:
    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    for shipment in shipments:
        _label_page(c, shipment)
        c.showPage()
    c.save()
    return buffer.getvalue()


def statement_pdf(user: User, month: str, txs: list[WalletTx]) -> bytes:
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=A4,
        leftMargin=18 * mm, rightMargin=18 * mm, topMargin=18 * mm, bottomMargin=18 * mm,
        title=f"Estratto conto {month} - {user.company_name}",
    )
    styles = getSampleStyleSheet()
    story = [
        Paragraph("MUVPACK - Estratto conto", styles["Title"]),
        Paragraph(f"{user.company_name} - {user.email}", styles["Normal"]),
        Paragraph(f"Periodo: {month}", styles["Normal"]),
        Spacer(1, 8 * mm),
    ]
    rows = [["Data", "Tipo", "Riferimento", "Importo", "Saldo"]]
    for tx in txs:
        rows.append([
            tx.created_at.strftime("%d/%m/%Y %H:%M"),
            tx.type,
            (tx.ref or "-")[:24],
            f"{tx.amount:+.2f} EUR",
            f"{tx.balance_after:.2f} EUR",
        ])
    if len(rows) == 1:
        rows.append(["", "Nessun movimento", "", "", ""])
    table = Table(rows, repeatRows=1, colWidths=[28 * mm, 30 * mm, 55 * mm, 28 * mm, 28 * mm])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#CBD5E1")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8FAFC")]),
        ("ALIGN", (3, 1), (-1, -1), "RIGHT"),
    ]))
    story.append(table)
    doc.build(story)
    return buffer.getvalue()


def statement_xlsx(user: User, month: str, txs: list[WalletTx]) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = "Estratto conto"
    ws.append(["MUVPACK - Estratto conto"])
    ws.append([user.company_name, user.email])
    ws.append(["Periodo", month])
    ws.append([])
    ws.append(["Data", "Tipo", "Riferimento", "Nota", "Importo", "Saldo dopo"])
    for tx in txs:
        ws.append([
            tx.created_at.strftime("%Y-%m-%d %H:%M"),
            tx.type,
            tx.ref or "",
            tx.note or "",
            round(tx.amount, 2),
            round(tx.balance_after, 2),
        ])
    widths = [20, 16, 32, 32, 12, 14]
    for index, width in enumerate(widths, start=1):
        ws.column_dimensions[chr(64 + index)].width = width
    buffer = io.BytesIO()
    wb.save(buffer)
    return buffer.getvalue()


def month_bounds(month: str) -> tuple[datetime, datetime]:
    start = datetime.strptime(month, "%Y-%m")
    if start.month == 12:
        end = datetime(start.year + 1, 1, 1)
    else:
        end = datetime(start.year, start.month + 1, 1)
    return start, end
