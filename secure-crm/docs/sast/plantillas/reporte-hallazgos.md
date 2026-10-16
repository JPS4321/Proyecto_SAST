# Reporte de hallazgos — Laboratorio SAST

**Grupo:** ____ · **Integrantes:** ____ · **Proyecto:** ____ · **Stack:** ____

> Copia esta plantilla a tu repositorio (por ejemplo `docs/reporte-laboratorio.md`) y complétala. **No incluyas tokens, keys ni contraseñas** en el texto ni en las capturas.

---

## 1. Línea base (Fase 1)

| Métrica | Fase 1 | Fase 2 |
|---|---|---|
| Security (rating / issues) | | |
| Reliability (rating / issues) | | |
| Maintainability (rating / issues) | | |
| Cobertura total | | |
| Cobertura del código nuevo | — | |
| Quality Gate | | |
| Dependencias vulnerables (auditoría) | | |
| Alertas altas/medias de ZAP | | |

Captura del dashboard de cada fase: ________

---

## 2. Hallazgos de seguridad

Una fila por hallazgo. **Fuente:** SonarQube, Semgrep, Auditoría, Dependency-Check o ZAP.

| # | Hallazgo | Fuente | Archivo:línea o URL | CWE | OWASP 2025 | Vector CVSS v3.1 | Puntaje | Decisión |
|---|---|---|---|---|---|---|---|---|
| 1 | Ej.: CORS refleja cualquier origen | Semgrep | `src/middleware/cors.ts:37` | CWE-942 | A02 | `AV:N/AC:L/PR:N/UI:R/S:U/C:L/I:L/A:N` | 5.4 | Corregir |
| 2 | | | | | | | | |

**Decisión:** Corregir · Aceptar · Falso positivo.

### Justificación de los aceptados y falsos positivos
| # | Justificación |
|---|---|
| | |

---

## 3. Dependencias vulnerables

| Paquete | Severidad | Camino (quién la trae) | ¿Alcanzable en ejecución? | Decisión |
|---|---|---|---|---|
| Ej.: `qs` | Moderada | `express > qs` | Sí, procesa cada petición | Actualizar express |

---

## 4. SAST vs. DAST

Para cada vulnerabilidad que encontró ZAP:

| Alerta de ZAP (URL, parámetro) | ¿La vio SAST? ¿Qué herramienta? | Línea de código que la causa |
|---|---|---|
| | | |

**Reflexión:** ¿qué encontró cada herramienta que las otras no? ________

---

## 5. Correcciones (Fase 2)

| # | Hallazgo | Corrección aplicada | Prueba que lo demuestra | Commit |
|---|---|---|---|---|
| 1 | | | `tests/…` | |

---

## 6. Preguntas

1. ¿SonarQube encontró algún secreto en tu repositorio? ¿Cómo llegó ahí y qué harías en un proyecto real?
2. ¿Por qué el Quality Gate "Sonar way" habría dado "Passed" en tu primer análisis?
3. ¿Qué vulnerabilidad priorizaste primero y por qué? (severidad vs. alcanzabilidad)
4. ¿Un 70 % de cobertura significa que el código es seguro? Explica con tus datos.
