# Amigos (pedido 6 del plan v5)

Una libreta de contactos para invitar rápido a una tanda: guardas a una persona con un apodo ("Beto") y, cuando creas o tienes una tanda abierta, le mandas el enlace con su nombre. Y la campanita te avisa si un amigo crea una tanda.

**Es privado y vive solo en el navegador.** No hay nada en el contrato ni en un servidor: los amigos no se ven desde otro teléfono ni computadora, y nadie (ni la persona agregada) sabe que la guardaste. Eso se dice en la pantalla.

Código: `lib/amigos.ts` (lógica y almacenamiento, con pruebas), `hooks/useAmigos.ts`, `components/Amigos.tsx` (la pestaña), `FormAmigo.tsx`, `BotonAmigo.tsx`, `InvitarAmigo.tsx`, `amigos.css`, y `lib/misTandas.ts` (qué tandas se pueden ofrecer).

## Dónde está

- **Perfil → pestaña "Amigos"** (`#/perfil/amigos`): la lista, un formulario para agregar (dirección + apodo) y, por cada amigo, "Invitar a una tanda" y "Quitar".
- **"Agregar a mis amigos"** junto a cada persona en *Quiénes participan* de una tanda, y en el **perfil público** de alguien (`#/historial/G…`). Ahí el apodo se sugiere con el nombre que ya se conoce de esa persona. Si ya es amigo dice "Amigo: Beto". No se ofrece sin sesión ni con uno mismo.
- **Campanita**: "Tu amigo Beto creó una tanda" (id `amigo:<tanda>`), mientras la tanda esté abierta, tenga lugares libres y tú no estés en ella. Sale de las tandas que la campanita ya lee (`notificacionesDeAmigos`), sin lecturas nuevas.

## Reglas

- La dirección es una cuenta de Stellar válida (G… de 56 caracteres, con su código de verificación). Se limpian espacios y minúsculas al pegar. No se acepta la propia, ni repetida, ni un contrato.
- El apodo: 1 a 30 caracteres, sin caracteres de control; se quitan espacios dobles.
- Máximo 100 amigos por cuenta. Lo guardado que no sirve se ignora sin romper nada.
- Los textos son claros y sin jerga; los errores dicen qué corregir.

## Invitar

"Invitar a una tanda" lee **cuando la persona lo pide** sus 30 tandas más recientes y ofrece las que son suyas (las creó o está en ellas), están abiertas y tienen lugares libres. Si hay una sola, queda elegida. El mensaje es el de siempre (`mensajeInvitacion`), ahora con saludo: "¡Hola, Beto! Soy Ana. …". Se comparte por WhatsApp o se copia el enlace. Si no hay tandas abiertas, ofrece crear una (`#/crear`).

## Qué se guarda

`rounda:amigos:<cuenta>`: `[{ dir, apodo }]`, en el orden en que se agregaron. Sin almacenamiento (ventana privada) el formulario avisa que no se pudo guardar. Al cambiar la lista, todos los lugares de la página se actualizan al instante (también entre pestañas).

## Probarlo a mano

1. `npm run preview` en `web/` y, en `web/e2e`, `node snap.mjs "#/perfil/amigos" amigos 375 <tu G…>`.
2. Para ver el aviso de la campanita con el mock: guarda como amigo a Beto (`GBPDH2E2EX5D7DO76YRIX477LPJWNPB7MJZRTEDJWBKZMS5KTLLRU2LO`) con la cuenta de prueba; creó la tanda 5.

## Límites conocidos

- No hay sincronización entre dispositivos ni copia de seguridad: si se borran los datos del navegador, se pierden.
- El aviso solo ve las 24 tandas más recientes (igual que el resto de la campanita).
- Cuando exista el nombre de la tanda (pedido 5), el aviso lo usará por el mismo lugar que los demás (`tanda(id)` del contexto de `lib/notificaciones.ts`).
