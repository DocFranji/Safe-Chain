# Probar la versión 3 desde la web (vista previa de `integracion`)

Para el equipo. Escrita por el ORQ el lunes 5 de octubre de 2026. Sirve para probar los contratos v3 que
@DocFranji desplegó en testnet el domingo 4, **sin tocar producción**.

- **Dónde:** https://rounda-git-integracion-rounda.vercel.app (la vista previa de la rama `integracion`).
  Producción (https://rounda-phi.vercel.app) sigue con la versión anterior hasta la salida a producción.
- **Tanda v3:** `CADFZFJDRFSM4WT6VO3F4IXM2Z4ZKKD3VLOELAMJMUFDCXZ2I2E3BYMC`. La web ya apunta ahí por defecto.
- **Todo es de prueba:** TUSD y USDC de testnet, sin valor.

## 0. Antes de empezar (10 minutos)

1. Abre `#/estado` en la vista previa. Debe decir **"Todo listo para la demo"** y mostrar la tanda `CADFZ…BYMC`.
   Si algo sale en rojo, toma una captura y anótalo en el tablero antes de seguir.
2. **Tres cuentas** (Ana, Beto y Carla de esta guía). Lo más cómodo:
   - un navegador (o perfil) con **Freighter** y 2 o 3 cuentas creadas dentro de Freighter, en **Testnet**;
   - o una ventana con Freighter y otra (incógnito u otro perfil) con **Entrar con Google**.
     ⚠️ Google en la vista previa solo funciona si su dominio está en los dominios permitidos de Privy. Si falla,
     sigue con Freighter y anótalo.
3. Con cada cuenta, en la barra de arriba:
   - **"Activar con Friendbot"** (le da XLM para las comisiones);
   - aceptar TUSD y pedir **TUSD de prueba** con el botón de la barra;
   - para las pruebas en USDC: **"Recibir USDC de prueba"** (Blend lo da **una sola vez por cuenta**).
4. Ten a mano el tablero (issue #4) para anotar lo que falle (ver la sección 3).

**Consejo:** usa la plantilla **"Demo rápida"** de `#/crear` (3 personas, rondas de 1 minuto). Así cada recorrido
dura unos 5 minutos. Las rondas de 1 a 10 minutos usan la bóveda "rápida" (rendimiento acelerado para que se note).

## 1. Recorridos de las funciones nuevas

Marca cada uno con ✅ o ❌. Cada recorrido empieza en `#/crear`.

### R1 · Lo básico de punta a punta (todos)
1. Ana: **Demo rápida** (cuota 100, 3 personas, 1 minuto, multa 10 %, garantía 100 %), moneda **TUSD**, deja marcado
   "Unirme yo también", crea y firma. Revisa la vista previa "Así va a funcionar": la garantía baja por turno
   (200, 100, 100).
2. Beto y Carla abren `#/tandas`, entran a la tanda y pulsan **"Unirme y dejar … de garantía"**. Al llenarse, empieza.
3. Los tres: **"Pagar mi cuota de 100 TUSD"**.
4. Al vencer el minuto, Ana ve **"Tu bolsa está lista: cóbrala"**. Pulsa para cerrar la ronda y cobrar 300.
   Cualquiera más puede cerrarla también (**"Cerrar la ronda"**).
5. Repite las rondas 2 y 3. Al final, **finalizar**: revisa los **Resultados** (garantía devuelta + rendimiento + multas)
   y la línea de tiempo.
6. Abre **"Mi historial"** (`#/historial`) de cada cuenta: puntaje, nivel e historial de hechos.

### R2 · Atraso y multa (M1)
En otra Demo rápida, Beto paga su cuota **después** de que venza la ronda, antes de que alguien la cierre (pónganse
de acuerdo para no cerrarla enseguida). Esperado: "Beto pagó tarde", se anota una multa del 10 % que se
le descuenta al final y se reparte entre quienes nunca se atrasaron.

### R3 · Mora y pagar deuda (M1)
1. Demo rápida con la **garantía en 0 %** (cada quien deja solo una cuota).
2. Ana cobra en la ronda 1 y **deja de pagar** en las rondas 2 y 3.
3. Esperado: en la ronda 2 "su garantía cubrió 100 TUSD"; en la 3 "Ana quedó en mora" y Carla cobra de menos.
4. Ana ve **"Pagar mi deuda (…)"**. Prueba **"Pagar solo una parte"** y luego el resto. Esperado: el dinero le llega a
   quien cobró de menos ("Carla recibió los … que le faltaban") y Ana deja de estar en mora.
5. Variante: Beto paga la deuda de Ana con **"Pagar la deuda de otra persona"**.

### R4 · Modos de turnos (M3), uno por tanda
En "¿Cómo se decide quién cobra primero?":

| Modo | Qué probar | Qué debe pasar |
| --- | --- | --- |
| **Precio por turno** | Prima 10 %. Cada quien elige su turno ("Unirme en el turno N y dejar …") | El turno 1 cobra menos y el último cobra más; el contrato no se queda con nada |
| **Subasta** | Descuento máximo 30 %. En la ronda 1, Beto y Carla ofertan; Carla supera a Beto | Cobra la mejor oferta; los demás reciben el descuento en su garantía. Sin ofertas, cobra el siguiente del orden de respaldo |
| **Subasta con ofertas selladas** | En la primera mitad de la ronda, **"Sellar mi oferta"**; en la segunda, **"Revelar mi oferta"** desde el **mismo navegador** | Nadie ve los montos hasta revelar; gana la mayor revelada |
| **Sorteo** | Que se unan los tres | Al llenarse: "El contrato sorteó el orden de cobro", con el orden |
| **Elegir e intercambiar** | Cada quien elige turno gratis. Luego Ana **"Proponer intercambio"** a Carla con una compensación y Carla **"Aceptar el cambio"** | Cambian los turnos y la compensación pasa de una a otra |

### R5 · Historial crediticio (M2)
1. Con una cuenta que ya terminó R1 (tiene puntos), crea una tanda con **"Pedir un nivel mínimo para unirse"**
   (por ejemplo, Bronce = 100 puntos) y con descuento de garantía por nivel.
2. Una cuenta **nueva** (0 puntos) intenta unirse. Esperado: "Esta tanda pide un puntaje de historial más alto que el
   tuyo".
3. En precio por turno o elegir turno, marca que los **primeros turnos pidan historial**. Una cuenta sin puntos no
   puede elegirlos, pero sí los de más adelante.
4. Puntos esperados: +10 por cuota a tiempo, +3 tarde, −15 si la cubre la garantía, −100 por mora, +60 por saldar
   una deuda, +50 por tanda sin atrasos (+25 con atrasos). Niveles: Nuevo 0–99, Bronce 100–299, Plata 300–599,
   Oro 600+. Solo suman tandas con cuota de **10 o más**, con tope de 150 puntos por tanda.

### R6 · USDC con rendimiento real de Blend (M4)
1. Las tres cuentas con USDC ("Recibir USDC de prueba").
2. Demo rápida en moneda **USDC**. En la página de la tanda: "Esta garantía está depositada en Blend… el rendimiento
   es real" y el enlace "Ver la garantía en Blend".
3. Repite R1 o R3 en USDC. Al final, el rendimiento es pequeñito pero real.
4. `#/estado` muestra la liquidez libre de Blend. Si un cierre falla por "Blend no tiene liquidez", reintenta en
   unos minutos: no se pierde nada (anótalo igual).

### R7 · Tandas largas y calendario (M1)
1. Crea (no hace falta completarla) una **Mensual × 12** o **Semanal × 4**. La vista previa muestra las fechas de
   pago y cuánto dura en total.
2. En la página de la tanda: **"Agregar a mi calendario"** descarga un `.ics` con una fecha por ronda. Ábrelo en
   Google Calendar o el calendario del teléfono.
3. Las fechas quedan fijas aunque alguien cierre tarde, y siempre quedan al menos 3 días para pagar.

## 2. Probar los límites

La web ya no deja pasar casi nada de esto (los controles tienen tope), así que la mayoría se prueba intentando el
caso y viendo que el mensaje sea claro y en español. **Lo importante: que nunca se mueva dinero de más y que ninguna
tanda quede trabada.**

### Límites al crear

| Qué | Límite del contrato | Prueba |
| --- | --- | --- |
| Personas por tanda | 3 a 12 | Intenta 2 y 13 en el formulario |
| Duración de la ronda | 1 minuto a 90 días | Intenta 30 segundos o 4 meses |
| Multa por atraso | 0 a 50 % de la cuota | Mueve el control al tope |
| Garantía | 0 a 100 % de lo que aún se debe (nunca menos de una cuota) | 0 % y 100 %: revisa la tabla de garantías por turno |
| Prima (precio por turno) | 1 a 20 % de la bolsa | Topes del control |
| Descuento (subasta) | 1 a 50 % de la bolsa | Topes del control |
| Ofertas selladas | Solo en subasta | No debería ofrecerse en otro modo |

### Errores que deberían salir con mensaje claro

| Prueba | Mensaje esperado (resumen) |
| --- | --- |
| Unirse dos veces con la misma cuenta | "Esta billetera ya está en la tanda" |
| Unirse a una tanda llena | "La tanda ya está completa" |
| Pagar dos veces la misma ronda | "Ya pagaste la cuota de esta ronda" |
| Cerrar la ronda antes de que venza | "La ronda todavía no vence" |
| Pagar una cuota estando en mora | "Tienes una deuda pendiente… «Pagar mi deuda»" |
| Pagar una deuda por más de lo que se debe, o 0 | "Ese monto es mayor que la deuda" / "Escribe un monto mayor que cero" |
| Elegir un turno ya tomado | "Alguien ya eligió ese turno" |
| Ofertar igual o menos que la mejor oferta, o más del máximo | "La oferta debe superar la mejor oferta actual…" |
| Sellar en la segunda mitad o revelar en la primera | "No es el momento: las ofertas se sellan en la primera mitad…" |
| Revelar desde otro navegador | "La oferta no coincide con la que sellaste…" |
| Intercambiar con alguien en mora o un turno que ya pasó | "Ese intercambio no es posible…" |
| Unirse sin saldo suficiente | "No tienes suficiente TUSD para esta operación" |
| Rechazar la firma en Freighter | "Cancelaste la firma en Freighter. No se hizo ningún cambio." |

### El peor caso: 12 personas

Es el caso más pesado para la red: 12 miembros, garantía en 0 % y casi nadie paga (muchos morosos en el mismo
cierre), mejor en **subasta** y con **historial**. Las pruebas automáticas ya lo miden (lo más alto: 15,3 M de 100 M
instrucciones, 65 de 100 lecturas, 43 de 50 escrituras, y menos de 16 384 bytes de eventos). En la web, con 12
cuentas, es largo: si alguien lo quiere hacer, con 4 a 6 cuentas y 2 o 3 morosos ya se ve el comportamiento. Lo que
hay que mirar: que **"Cerrar la ronda" nunca falle** con muchos morosos (sobre todo en USDC).

## 3. Cómo reportar

Un comentario en el tablero (issue #4) por cada problema:

```
**[Prueba v3] <qué falló>** · <recorrido, por ejemplo R3 paso 4>
Cuenta: Freighter / Google · Moneda: TUSD / USDC · Tanda: #<número>
Qué hice: ...
Qué esperaba: ...
Qué pasó (mensaje exacto o captura): ...
```

No pegues llaves secretas (`S...`). Las direcciones `G...` y `C...` sí se pueden compartir. El ORQ le pasa cada
error a la misión dueña: M1 (tiempos, multas, deudas, calendario), M2 (historial), M3 (turnos), M4 (USDC y Blend).
