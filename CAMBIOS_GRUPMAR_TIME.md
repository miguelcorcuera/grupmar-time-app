# Cambios aplicados por ChatGPT

## Frontend
- Logo `grup mar.time` agregado en `public/grupmar-time-logo.png`.
- Login actualizado para usar el logo como imagen principal.
- Header de trabajador y sidebar admin actualizados con el logo.
- Fix de embeds ambiguos:
  - `alerts.tsx`: `employee:profiles!alerts_employee_id_fkey(full_name)`.
  - `letters.tsx`: `employee:profiles!disciplinary_letters_employee_id_fkey(full_name)`.
  - `security.tsx`: `employee:profiles!security_logs_employee_id_fkey(full_name)`.
- Pantalla trabajador actualizada con:
  - contador de cierre automático tras fin de turno,
  - bloqueo visual cuando la jornada está cerrada,
  - franja de almuerzo visible,
  - botón de almuerzo deshabilitado antes de su franja,
  - salida final bloqueada cuando el backend marca cierre.
- Marcaciones admin ampliadas con almuerzo, salida y falta de salida.
- Nuevas pantallas admin:
  - `/admin/reports`: reporte mensual absoluto y exportación CSV.
  - `/admin/settings`: configuración de tolerancias, IP, cierre, almuerzo, horas extra.

## Backend / Supabase
Nueva migración:
`supabase/migrations/20260616120500_advanced_workday_lunch_close_reports.sql`

Incluye:
- Campos nuevos en `shifts`, `attendance_events` y `daily_attendance_summary`.
- Tabla `attendance_attempts`.
- Tabla `overtime_requests`.
- Tablas `monthly_attendance_reports` y `monthly_attendance_report_details`.
- Configuración inicial en `system_settings`.
- RPC reemplazada `register_entry_on_login()`:
  - bloquea entrada anticipada sin autorización,
  - bloquea login/marcación tras cierre de turno,
  - devuelve datos de turno, almuerzo y cierre.
- RPC reemplazada `register_attendance_event()`:
  - controla salida máximo 5 minutos después del turno,
  - bloquea marcaciones tras cierre,
  - controla almuerzo por franja,
  - genera alertas de almuerzo tarde/exceso,
  - registra intentos bloqueados.
- Función `auto_close_daily_shift()`.
- Función `generate_monthly_absolute_report()`.
- Vista `v_monthly_absolute_attendance_report`.
- Vista `v_daily_attendance_admin` ampliada.

## Importante
No pude ejecutar build local porque `npm install` no terminó dentro del sandbox. El código queda preparado para que lo ejecutes en Lovable o localmente con:

```bash
npm install
npm run build
```

Si sale un error exacto, pásamelo y lo corrijo directo.

## Corrección 2026-06-16 14:30 — Reglas estrictas solicitadas

- La pantalla del trabajador ya no muestra la hora actual como si fuera hora de entrada.
- La entrada registrada se toma del primer evento `ENTRY` real del día y queda fija.
- Se muestra salida final real, horas trabajadas brutas y horas netas restando almuerzo.
- El botón de almuerzo solo se activa dentro de la franja del turno, por ejemplo 13:00-14:00 o 14:00-15:00.
- Si se pasa la franja de almuerzo sin marcar, la pantalla indica que debe regularizarlo con su supervisor.
- Backend reforzado: `LUNCH_START` después de la ventana queda bloqueado, genera `attendance_attempt`, alerta y marca el día como pendiente de regularización.
- Si el trabajador registra salida final antes del horario, se permite registrar pero queda como salida anticipada, requiere revisión y genera alerta.
- Admin Marcaciones ahora muestra salida anticipada y horas trabajadas.
- Nueva migración: `20260616143000_strict_lunch_exit_worked_hours.sql`.
