# JARVIS — asistente personal de casa (diseño)

Fecha: 2026-10-28 · Proyecto personal de Alex (no HAVOC) · Carpeta `~/jarvis/`

## 1. Qué es y por qué

Asistente tipo JARVIS de Iron Man para Alex y Tere, corriendo en privado en la
máquina **alex-llm** (en la casa, Tailscale `100.86.154.99`). Empieza por lo que
más duele hoy: **que no se pase ningún pago** (ej. TC Walmart). Después crece a
agenda compartida y, por fases, a control de la casa (luces, sensores, cámaras,
portón, voz).

Principio rector: **los datos de la casa y del dinero no salen de la casa.**
Alex no confía en Telegram ni en servicios de terceros para esto.

## 2. Usuarios

- **Alex** — JARVIS le dice "Alex".
- **Tere** — JARVIS le dice "Tere".
- Ambos con Android. Nadie más.
- Tono de JARVIS: **formal y elegante**, estilo mayordomo de Iron Man
  ("Alex, la tarjeta Walmart vence hoy. Aún no recibo el comprobante.").

## 3. Metas, no-metas, anti-metas

**Metas (fase 1 = app de pagos y agenda)**
- Ningún pago fijo se pasa: JARVIS insiste hasta ver el comprobante.
- Agenda personal y conjunta con aviso previo, sincronizada a Google Calendar.
- Hablarle natural, por texto o nota de voz.

**No-metas (por ahora)**
- Resúmenes automáticos de gastos (solo si se los piden).
- Respuesta por voz de JARVIS (llega con los satélites de voz).
- Publicar en Play Store.
- Control de la casa (fases 2+, ver §9).

**Anti-metas (si pasa esto, falló aunque funcione)**
- Datos de pagos o fotos de comprobantes saliendo a terceros (Telegram,
  WhatsApp, Google, Claude, FCM con contenido).
- Lo personal de uno visible para el otro.
- Algo crítico de la casa (alarma, portón, cerradura) dependiendo del LLM.
- JARVIS consultando la nube sin pedir permiso.

Criterio de éxito: Alex y Tere lo usan un mes y no se les pasa un pago. Las
mejoras salen de usarlo (palabras de Alex: "después de probarlo saldrán las
mejoras").

## 4. Visibilidad: personal vs. conjunto

Cada pago y cada evento tiene dueño:
- **Conjunto** — lo ven y reciben avisos los dos; cualquiera lo cierra.
- **Personal** — solo lo ve su dueño. **Totalmente oculto** para el otro
  (listas, avisos, resúmenes, búsquedas del chat).

Al dar de alta: **por defecto personal**; es conjunto cuando el usuario lo dice
("es conjunta", "con Tere"). Si JARVIS no está seguro, pregunta.

## 5. Pagos

### 5.1 Alta
Platicando: "JARVIS, la luz se paga cada dos meses, el día 20". También pantalla
"Mis pagos" para ver/editar (decisión del builder: cómo es el formulario).

Cada pago: nombre, dueño (personal de X / conjunto), periodicidad (mensual,
bimestral, anual, u otra cada N meses), día de pago, día de corte opcional
(tarjetas), monto fijo opcional.

### 5.2 Ciclo de cada periodo
1. **Día de corte** (si tiene): "Alex, hoy cortó la Walmart. ¿Cuál es el monto
   a pagar?". Ellos lo ven en la app del banco y se lo dicen. **4 avisos a lo
   largo del día** hasta que alguno capture el monto.
2. **Día de pago**: recuerda el monto **4 veces a lo largo del día** hasta que
   alguno suba la foto del comprobante.
   - Pagos sin corte y con monto variable (ej. luz): JARVIS pregunta el monto ese
     día. *(Supuesto de Claude, Alex no lo contradijo.)*
3. **Foto del comprobante**: JARVIS la lee con modelo de visión **local** y
   compara el monto.
   - Coincide (o es mayor) → pagado.
   - Menor → **abono**; sigue recordando lo que falta hasta cubrir el total.
   - No se puede leer → pide escribir el monto a mano. *(Decisión de Claude.)*
4. Si pasa el día de pago sin cubrir: sigue insistiendo los días siguientes y lo
   marca **atrasado**. *(Supuesto de Claude.)*
5. Conjunto: lo que cualquiera de los dos captura/sube cuenta para ambos.

Horarios de los 4 avisos: decisión del builder (propuesta: 9:00, 13:00, 17:00,
20:30), configurable después.

### 5.3 Historial
Fotos guardadas por pago y periodo en alex-llm. Resumen solo bajo pedido
("JARVIS, ¿cuánto pagamos este mes?").

## 6. Agenda

- Natural: "JARVIS, tengo una junta mañana a las 4pm" → evento + **aviso 1 hora
  antes**.
- Personal por defecto; "conjunta" → calendario compartido.
- **Sincroniza con Google Calendar**: personal → calendario de cada quien
  (Alex: alejandroayalag@gmail.com; Tere: su cuenta personal de Google);
  conjunto → calendario nuevo **"Casa"** compartido entre ambos.
- Excepción aceptada al principio rector: los **eventos** de agenda sí pasan por
  Google (Alex lo pidió). Los **pagos nunca** van a Google.
- Pendiente para el builder: sync en ambos sentidos o solo JARVIS→Google
  (propuesta: ambos sentidos, para ver eventos creados desde el cel).

## 7. Chat con JARVIS

- En la app: **texto y notas de voz**. La voz se transcribe en alex-llm (Whisper);
  el audio no sale de casa.
- JARVIS responde en texto.
- **LLM local** (Ollama en alex-llm) para entender y contestar.
- **Claude en la nube solo con permiso**: cuando JARVIS crea que necesita a
  Claude, pregunta "¿Lo consulto con Claude? Enviaría esto: …" mostrando el texto
  exacto. Solo sale con "sí". A cada usuario le pregunta lo suyo. Pagos y fotos
  **nunca** se mandan, aunque digan que sí. Requiere API key de Anthropic
  (pendiente, la pone Alex).

## 8. Arquitectura

```
 [App Android Alex]  [App Android Tere]
         \               /
          Tailscale (privada, nunca expuesto a internet)
                 |
        alex-llm (en la casa)                   [Home Assistant Green]  (fase 2)
   ┌──────────────────────────────┐             luces, sensores, alarma DSC,
   │ jarvis-api :3019 (SQLite)    │──REST/WS───▶ portón. Sigue funcionando si
   │ Ollama: LLM + visión         │             alex-llm se cae.
   │ Whisper (voz→texto)          │
   │ fotos en disco               │
   │ (ya ahí: Open WebUI :3000 de │
   │  Lexium, RATIUM :3016)       │
   └──────────────────────────────┘
```

- **Acceso**: Tailscale en ambos celulares (decisión de Alex). Nada abierto a
  internet.
- **Avisos**: la app **programa notificaciones locales en el celular** a partir
  del calendario de recordatorios que sincroniza. Suenan aunque no haya red ni
  Tailscale. Al cerrarse un pago (foto en cualquier cel), al sincronizar se
  cancelan en los dos. **Sin FCM/Google para avisos.**
  - Consecuencia: si nadie sincroniza, el otro cel sigue sonando hasta su
    siguiente sync. El builder define cada cuánto sincroniza en segundo plano.
- **App**: Expo/React Native, APK instalado directo (sin Play Store). Ya se ha
  hecho antes (Gioval iOS, GESSI APK).
- **Backend**: puerto 3019 (registrado en `port_registry`), SQLite. Corre en
  alex-llm, no en Hetzner.
- **Autenticación**: decisión del builder (2 usuarios; propuesta: login una vez
  con contraseña + token largo en el cel, más biometría para abrir la app).

### 8.1 Convivencia con Lexium y RATIUM en alex-llm
- La GPU se comparte. JARVIS se **prueba los fines de semana**, cuando Lexium y
  RATIUM no se usan.
- Antes de elegir modelos: medir VRAM libre con Lexium cargado; usar
  `keep_alive` de Ollama para descargar modelos ociosos. Si alcanza, reusar
  `qwen3:14b` (ya cargado para Lexium) en vez de otro modelo.
- Modelo de visión para comprobantes: el builder elige uno local que quepa
  (ej. familia Qwen-VL).
- Especificaciones de alex-llm (GPU/VRAM/RAM): **por confirmar**; la plática
  previa asumía la PC gpu (RTX 5070 12 GB), que ya murió.

## 9. Casa inteligente (fases posteriores, resumen)

Detalle completo en la plática previa de Alex (pegada en la sesión 2026-10-28).
Decisiones tomadas hoy:
- **Home Assistant en un Home Assistant Green aparte** (~200 USD, Alex lo está
  cotizando), no en alex-llm. Lo crítico no depende del LLM.
- JARVIS controla la casa **pidiéndole a Home Assistant**, nunca directo.
- Frigate (cámaras Hikvision) en alex-llm por la GPU.
- Luces: hub SmartThings → integración SmartThings primero; después migrar a
  Zigbee directo con antena (ZBT-2 o Aeotec Zi-Stick).
- Sensores Smart Life (Wi-Fi) → integración Tuya; local donde se pueda.
- Muchos sensores nuevos en caja: **falta marca/modelo/protocolo** (Alex manda
  fotos de las cajas) antes de comprar la antena.
- Alarma DSC + ESP32 (proyecto existente) → integrar a Home Assistant.
- Portón MyQ: Ratgdo o relevador local; abrir requiere confirmación en el cel.
- Orden propuesto en la plática previa se mantiene: HA + luces/contactos →
  cámaras/Frigate → sensores → portón → UPS → voz local → extras.

## 10. Pendientes que no bloquean la fase 1

- API key de Anthropic (para consultas a Claude con permiso).
- Especificaciones de alex-llm y VRAM libre.
- Fotos de las cajas de los sensores.
- Compra del Home Assistant Green (fase 2).
- Calendario "Casa" en Google (se crea al implementar).
