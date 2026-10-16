"""Genera un PDF con los resultados de SonarQube a partir de las exportaciones JSON de la API.

Entradas (todas opcionales salvo los issues):
  --issues        respuesta de /api/issues/search (exportar con resolved=false)
  --metricas      respuesta de /api/measures/component
  --quality-gate  respuesta de /api/qualitygates/project_status
  --output        ruta del PDF

Solo se listan como hallazgos los issues SIN resolución (abiertos). Si la exportación
incluye issues cerrados/resueltos (p. ej. porque no se filtró por resolved=false), se
excluyen del detalle y se informa cuántos se omitieron, para no presentarlos como actuales.

Ejemplo:
  python3 generar_reporte_sonarqube.py \
    --issues analisis-seguridad/despues/sonarqube-issues.json \
    --metricas analisis-seguridad/despues/sonarqube-metricas.json \
    --quality-gate analisis-seguridad/despues/sonarqube-quality-gate.json \
    --output analisis-seguridad/despues/reporte-sonarqube.pdf
"""

import argparse
import json
import os
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

parser = argparse.ArgumentParser(description="Reporte PDF de SonarQube")
parser.add_argument("--issues", default="sonarqube-issues.json")
parser.add_argument("--metricas", default=None)
parser.add_argument("--quality-gate", dest="quality_gate", default=None)
parser.add_argument("--output", default="reporte-sonarqube.pdf")
parser.add_argument("--proyecto", default="Prueba-CRM")
args = parser.parse_args()


def load_json(path):
    if not path:
        return None
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def file_date(path):
    if not path:
        return "No disponible"
    return datetime.fromtimestamp(os.path.getmtime(path)).strftime("%d/%m/%Y %H:%M")


data = load_json(args.issues)
metrics_data = load_json(args.metricas)
gate_data = load_json(args.quality_gate)

all_issues = data.get("issues", [])
api_total = data.get("total", len(all_issues))
# Un issue abierto no tiene resolución (FIXED, FALSE-POSITIVE, WONTFIX, REMOVED...).
issues = [i for i in all_issues if not i.get("resolution")]
omitted = len(all_issues) - len(issues)

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
styles.add(ParagraphStyle(
    name="Note",
    parent=styles["BodyText"],
    fontSize=8.5,
    leading=12,
    textColor=colors.HexColor("#4A5568"),
    spaceBefore=6,
    spaceAfter=6
))

doc = SimpleDocTemplate(
    args.output,
    pagesize=A4,
    rightMargin=2 * cm,
    leftMargin=2 * cm,
    topMargin=2 * cm,
    bottomMargin=2 * cm,
    title="Reporte de SonarQube",
    author="secure-crm"
)

story = []


def p(value, style="ReportBody"):
    return Paragraph(escape(str(value if value not in (None, "") else "No disponible")), styles[style])


def styled_table(rows, col_widths):
    table = Table(rows, colWidths=col_widths)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#243B53")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.lightgrey),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
    ]))
    return table


story.append(Paragraph("Reporte de Hallazgos - SonarQube", styles["ReportTitle"]))
story.append(p(f"Proyecto: {args.proyecto}"))
story.append(p("Fecha de generación del PDF: " + datetime.now().strftime("%d/%m/%Y %H:%M")))
story.append(p(f"Exportación de issues: {os.path.basename(args.issues)} (archivo del {file_date(args.issues)})"))
if args.metricas:
    story.append(p(f"Exportación de métricas: {os.path.basename(args.metricas)} (archivo del {file_date(args.metricas)})"))
if args.quality_gate:
    story.append(p(f"Exportación de Quality Gate: {os.path.basename(args.quality_gate)} (archivo del {file_date(args.quality_gate)})"))
story.append(Spacer(1, 10))

# --- Resumen -------------------------------------------------------------------
story.append(Paragraph("Resumen", styles["Heading2"]))
story.append(p(f"Issues abiertos: {len(issues)}"))
story.append(p(f"Total informado por la API en la exportación: {api_total}"))
if omitted:
    story.append(p(
        f"Se omitieron {omitted} issues con resolución (cerrados o resueltos) presentes en la "
        "exportación: no son hallazgos actuales.", "Note"))
if api_total > len(all_issues):
    story.append(p(
        f"Advertencia: la exportación contiene {len(all_issues)} de {api_total} issues (paginación). "
        "El detalle puede estar incompleto.", "Note"))

# --- Métricas --------------------------------------------------------------------
METRIC_LABELS = {
    "bugs": "Bugs",
    "vulnerabilities": "Vulnerabilidades",
    "code_smells": "Code Smells",
    "security_hotspots": "Security Hotspots",
    "coverage": "Cobertura (%)",
    "duplicated_lines_density": "Duplicación (%)",
    "ncloc": "Líneas de código analizadas (ncloc)",
}

if metrics_data:
    measures = {m["metric"]: m.get("value", (m.get("period") or {}).get("value"))
                for m in metrics_data.get("component", {}).get("measures", [])}
    rows = [["Métrica", "Valor"]]
    for key, label in METRIC_LABELS.items():
        if key in measures:
            rows.append([label, str(measures[key])])
    for key, value in measures.items():
        if key not in METRIC_LABELS:
            rows.append([key, str(value)])
    story.append(Spacer(1, 8))
    story.append(Paragraph("Métricas del proyecto", styles["Heading2"]))
    story.append(styled_table(rows, [9 * cm, 5 * cm]))

# --- Quality Gate ----------------------------------------------------------------
GATE_LABELS = {
    "new_coverage": "Cobertura en código nuevo (%)",
    "new_duplicated_lines_density": "Duplicación en código nuevo (%)",
    "new_violations": "Nuevas incidencias",
}
COMPARATORS = {"LT": "<", "GT": ">", "EQ": "=", "NE": "!="}

if gate_data:
    status = gate_data.get("projectStatus", {})
    story.append(Spacer(1, 12))
    story.append(Paragraph("Quality Gate", styles["Heading2"]))
    story.append(p(f"Estado: {status.get('status', 'No disponible')}"))
    period = status.get("period") or {}
    if period:
        story.append(p(
            f"Periodo de referencia (código nuevo): {period.get('mode')} "
            f"{period.get('parameter', '')} desde {period.get('date', '')}"))
    rows = [["Condición", "Falla si", "Valor actual", "Estado"]]
    for c in status.get("conditions", []):
        rows.append([
            GATE_LABELS.get(c.get("metricKey"), c.get("metricKey")),
            f"{COMPARATORS.get(c.get('comparator'), c.get('comparator'))} {c.get('errorThreshold')}",
            str(c.get("actualValue")),
            c.get("status", ""),
        ])
    story.append(styled_table(rows, [6.5 * cm, 2.5 * cm, 2.8 * cm, 2.2 * cm]))

# --- Issues abiertos -------------------------------------------------------------
story.append(Spacer(1, 12))
story.append(Paragraph("Issues abiertos por severidad", styles["Heading2"]))
severity_counts = Counter(issue.get("severity", "Sin severidad") for issue in issues)
if severity_counts:
    rows = [["Severidad", "Cantidad"]]
    for severity, count in sorted(severity_counts.items()):
        rows.append([severity, str(count)])
    story.append(styled_table(rows, [9 * cm, 5 * cm]))
else:
    story.append(p("SonarQube no reporta issues abiertos en esta exportación."))

story.append(Spacer(1, 12))
story.append(Paragraph("Detalle de issues abiertos", styles["Heading2"]))
if not issues:
    story.append(p("No hay issues abiertos que detallar."))

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

story.append(Spacer(1, 12))
story.append(p(
    "Nota: estos resultados reflejan únicamente las reglas de SonarQube (y los hallazgos "
    "importados por SARIF) en el alcance configurado. Cero issues abiertos no implica que la "
    "aplicación esté libre de vulnerabilidades; ver el informe técnico del proyecto.", "Note"))


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

print(f"PDF generado: {args.output}")
print(f"Issues abiertos incluidos: {len(issues)} (omitidos con resolución: {omitted})")
