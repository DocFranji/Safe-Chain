//! Pruebas del nombre de la tanda (M1, v5). Ya está declarado en `lib.rs`.
//! Reglas en `nombres.rs`: de 2 a 40 caracteres, letras con tildes, números, espacios y `.,-_!?¿¡`.
#![allow(unused_imports)]
extern crate std;

use crate::test::*;
use crate::*;
use soroban_sdk::{
    testutils::{storage::Persistent as _, Address as _, Events as _, Ledger},
    Address, Env, Event as _, String as SStr,
};
use std::string::String;

fn s(c: &Ctx, texto: &str) -> SStr {
    SStr::from_str(&c.env, texto)
}

fn crear_con(c: &Ctx, nombre: &str) -> Result<u32, Result<Error, soroban_sdk::InvokeError>> {
    match c.tanda.try_crear_tanda_con_nombre(
        &c.creador,
        &c.token.address,
        &CUOTA,
        &3,
        &PERIODO,
        &1_000,
        &10_000,
        &s(c, nombre),
    ) {
        Ok(Ok(id)) => Ok(id),
        Err(e) => Err(e),
        Ok(Err(_)) => unreachable!(),
    }
}

fn es_invalido(c: &Ctx, nombre: &str) -> bool {
    matches!(crear_con(c, nombre), Err(Ok(Error::NombreInvalido)))
}

#[test]
fn el_nombre_se_guarda_y_se_lee() {
    let c = setup();
    let id = crear_con(&c, "Tanda de la oficina").unwrap();
    assert_eq!(c.tanda.get_nombre(&id), s(&c, "Tanda de la oficina"));
    // La tanda es una tanda normal: se llena y arranca.
    c.tanda.unirse(&id, &c.ana);
    c.tanda.unirse(&id, &c.beto);
    c.tanda.unirse(&id, &c.carla);
    assert_eq!(c.tanda.get_tanda(&id).estado, Estado::Activa);
    c.assert_conservacion();
}

#[test]
fn sin_nombre_se_lee_vacio() {
    let c = setup();
    // Con `crear_tanda` de siempre, y con el nombre vacío.
    let a = c.crear(10_000);
    let b = crear_con(&c, "").unwrap();
    assert_eq!(c.tanda.get_nombre(&a), s(&c, ""));
    assert_eq!(c.tanda.get_nombre(&b), s(&c, ""));
    // Una tanda que no existe también se lee vacía (no falla): la lista muestra "Tanda N".
    assert_eq!(c.tanda.get_nombre(&999), s(&c, ""));
}

#[test]
fn nombres_validos_con_tildes_signos_y_numeros() {
    let c = setup();
    for nombre in [
        "ab",
        "Ahorro 2026",
        "Niños y niñas",
        "¡Vamos por la Peña!",
        "¿Quién cobra primero?",
        "Mamá, papá y yo",
        "Año-nuevo_vida.nueva",
        "ÁÉÍÓÚÜÑ áéíóúüñ",
        "Crème brûlée à ç",
        "1234567890123456789012345678901234567890", // 40 caracteres
        "ñññññññññññññññññññññññññññññññññññññññ",  // 40 caracteres de 2 bytes (80 bytes)
    ] {
        assert!(
            crear_con(&c, nombre).is_ok(),
            "debía ser válido: {nombre:?}"
        );
    }
}

#[test]
fn nombres_invalidos() {
    let c = setup();
    for nombre in [
        "a",                                         // 1 carácter
        " ",                                         // solo un espacio
        " Ana",                                      // espacio al principio
        "Ana ",                                      // espacio al final
        "12345678901234567890123456789012345678901", // 41 caracteres
        "ñññññññññññññññññññññññññññññññññññññññññ", // 41 caracteres de 2 bytes
        "Tanda #1",                                  // símbolo no permitido
        "a@b",
        "Tanda <b>",
        "Tanda\nnueva", // salto de línea
        "Tanda\ttab",
        "Tanda 5×",     // × no es letra
        "Mitad ÷ dos",  // ÷ tampoco
        "Tanda 🎉",     // emoji
        "Здравствуйте", // otro alfabeto
        "日本語の名前",
        "Cafe\u{0301} bar",    // e + acento suelto (sin normalizar)
        "Tanda\u{200b}oculta", // espacio de ancho cero
        "Tanda\u{a0}nbsp",     // espacio de no separación
        "ª º",                 // ordinales
    ] {
        assert!(es_invalido(&c, nombre), "debía ser inválido: {nombre:?}");
    }
    // Nada se creó ni se contó.
    assert_eq!(c.tanda.total_tandas(), 0);
}

#[test]
fn el_nombre_invalido_no_deja_nada_a_medias() {
    let c = setup();
    let id = c.crear(10_000);
    assert!(es_invalido(&c, "x"));
    assert_eq!(c.tanda.total_tandas(), 1);
    // La siguiente tanda sigue la numeración sin saltos.
    let siguiente = crear_con(&c, "Segunda").unwrap();
    assert_eq!(siguiente, id + 1);
}

#[test]
fn con_opciones_de_turnos_tambien_lleva_nombre() {
    let c = setup();
    let o = OpcionesTanda {
        modo: ModoTurnos::Eleccion,
        permitir_intercambio: true,
        prima_max_bps: 0,
        descuento_max_bps: 0,
        primeros_con_historial: 0,
        puntaje_primeros: 0,
        ofertas_selladas: false,
    };
    let id = c.tanda.crear_tanda_avanzada_con_nombre(
        &c.creador,
        &c.token.address,
        &CUOTA,
        &3,
        &PERIODO,
        &1_000,
        &10_000,
        &o,
        &s(&c, "Elige tu turno"),
    );
    assert_eq!(c.tanda.get_nombre(&id), s(&c, "Elige tu turno"));
    assert_eq!(
        c.tanda.get_estado_turnos(&id).opciones.modo,
        ModoTurnos::Eleccion
    );
    // Nombre inválido: error, y no se crea.
    let r = c.tanda.try_crear_tanda_avanzada_con_nombre(
        &c.creador,
        &c.token.address,
        &CUOTA,
        &3,
        &PERIODO,
        &1_000,
        &10_000,
        &o,
        &s(&c, "x"),
    );
    assert_eq!(r, Err(Ok(Error::NombreInvalido)));
    assert_eq!(c.tanda.total_tandas(), id);
    // La versión de siempre (sin nombre) sigue igual.
    let sin = c.tanda.crear_tanda_avanzada(
        &c.creador,
        &c.token.address,
        &CUOTA,
        &3,
        &PERIODO,
        &1_000,
        &10_000,
        &o,
    );
    assert_eq!(c.tanda.get_nombre(&sin), s(&c, ""));
}

#[test]
fn get_nombres_devuelve_un_lote_en_orden() {
    let c = setup();
    crear_con(&c, "Uno").unwrap();
    c.crear(10_000); // sin nombre
    crear_con(&c, "Tres").unwrap();

    let lote = c.tanda.get_nombres(&1, &3);
    assert_eq!(lote.len(), 3);
    assert_eq!(lote.get(0).unwrap(), s(&c, "Uno"));
    assert_eq!(lote.get(1).unwrap(), s(&c, ""));
    assert_eq!(lote.get(2).unwrap(), s(&c, "Tres"));

    // Más allá de la última, vacío; el lote se corta en 50 y no se desborda.
    assert_eq!(c.tanda.get_nombres(&3, &3).get(1).unwrap(), s(&c, ""));
    assert_eq!(c.tanda.get_nombres(&1, &1_000).len(), 50);
    assert_eq!(c.tanda.get_nombres(&u32::MAX, &10).len(), 1);
    assert_eq!(c.tanda.get_nombres(&1, &0).len(), 0);
}

#[test]
fn el_evento_creada_trae_el_nombre() {
    let c = setup();
    let id = crear_con(&c, "Con evento").unwrap();
    let esperado = EvCreada {
        id,
        creador: c.creador.clone(),
        cuota: CUOTA,
        n_miembros: 3,
        nombre: s(&c, "Con evento"),
    };
    assert!(c
        .env
        .events()
        .all()
        .events()
        .iter()
        .any(|e| { *e == esperado.to_xdr(&c.env, &c.tanda_addr) }));
}

#[test]
fn el_nombre_vive_toda_la_tanda() {
    // Una tanda mensual de 3 personas: el nombre se renueva con la tanda, como todo lo suyo.
    let c = setup();
    let id = c.tanda.crear_tanda_con_nombre(
        &c.creador,
        &c.token.address,
        &CUOTA,
        &3,
        &(30 * 86_400),
        &1_000,
        &10_000,
        &s(&c, "Mensual"),
    );
    let ttl = c.env.as_contract(&c.tanda_addr, || {
        c.env.storage().persistent().get_ttl(&ClaveM1::Nombre(id))
    });
    // Al menos lo que necesita la tanda (3 meses) más el margen de 30 días, con tope en el máximo.
    let esperado = (3 * 30 * 17_280 + 30 * 17_280).min(c.env.storage().max_ttl());
    assert!(ttl >= esperado - 17_280, "ttl {ttl} < {esperado}");
}
