
import json
from collections import Counter
from datetime import datetime
from html import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer,
    Table, TableStyle, KeepTogether
)

INPUT = "sonarqube-issues.json"
OUTPUT = "reporte-sonarqube.pdf"

with open(INPUT, encoding="utf-8") as f:
    data = json.load(f)

issues = data.get("issues", [])
total = data.get("total", len(issues))

styles = getSampleStyleSheet()
styles.add(ParagraphStyle(
    name="ReportTitle",
    parent=styles["Title"],
    alignment=TA_CENTER,
    spaceAfter=16
))
styles.add(ParagraphStyle(
    name="IssueTitle",
    parent=styles["Heading3"],
    spaceBefore=12,
    spaceAfter=6
))
styles.add(ParagraphStyle(
    name="ReportBody",
    parent=styles["BodyText"],
    fontSize=9,
    leading=13,
    spaceAfter=4,
    wordWrap="CJK"
))

doc = SimpleDocTemplate(
    OUTPUT,
    pagesize=A4,
    rightMargin=2 * cm,
    leftMargin=2 * cm,
    topMargin=2 * cm,
    bottomMargin=2 * cm
)

story = []

def p(value):
    return Paragraph(escape(str(value or "No disponible")), styles["ReportBody"])

story.append(Paragraph(
    "Reporte de Hallazgos - SonarQube",
    styles["ReportTitle"]
))
story.append(p("Proyecto: Prueba-CRM"))
story.append(p(
    "Fecha de generación: " +
    datetime.now().strftime("%d/%m/%Y %H:%M")
))
story.append(p(f"Total de hallazgos reportados por la API: {total}"))
story.append(p(f"Hallazgos incluidos en el PDF: {len(issues)}"))
story.append(Spacer(1, 14))

# Resumen por severidad
severity_counts = Counter(
    issue.get("severity", "Sin severidad")
    for issue in issues
)

summary = [["Severidad", "Cantidad"]]
for severity, count in sorted(severity_counts.items()):
    summary.append([severity, str(count)])

table = Table(summary, colWidths=[9 * cm, 5 * cm])
table.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#243B53")),
    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
    ("GRID", (0, 0), (-1, -1), 0.4, colors.lightgrey),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ("TOPPADDING", (0, 0), (-1, -1), 8),
]))
story.append(table)
story.append(Spacer(1, 18))

story.append(Paragraph("Detalle de hallazgos", styles["Heading2"]))

for index, issue in enumerate(issues, 1):
    location = issue.get("textRange") or {}
    impacts = issue.get("impacts") or []

    fields = [
        ("Identificador", issue.get("key")),
        ("Regla", issue.get("rule")),
        ("Severidad", issue.get("severity")),
        ("Tipo", issue.get("type")),
        ("Estado", issue.get("status")),
        ("Archivo", issue.get("component")),
        ("Línea", location.get("startLine")),
        ("Descripción", issue.get("message")),
        ("Impactos", ", ".join(
            f"{x.get('softwareQuality')}: {x.get('severity')}"
            for x in impacts
        )),
    ]

    block = [
        Paragraph(
            f"{index}. Hallazgo {escape(str(issue.get('key', '')))}",
            styles["IssueTitle"]
        )
    ]

    for label, value in fields:
        if value is not None and value != "":
            block.append(p(f"{label}: {value}"))

    story.append(KeepTogether(block))
    story.append(Spacer(1, 8))

def footer(canvas, document):
    canvas.saveState()
    canvas.setFont("Helvetica", 8)
    canvas.drawRightString(
        A4[0] - 2 * cm,
        1.2 * cm,
        f"Página {document.page}"
    )
    canvas.restoreState()

doc.build(story, onFirstPage=footer, onLaterPages=footer)

print(f"PDF generado: {OUTPUT}")
print(f"Hallazgos incluidos: {len(issues)}")
