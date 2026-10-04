//! Peor caso de una tanda con la garantía en Blend (misión M4, docs/blend.md §9): los mismos dos
//! escenarios más pesados de `tanda/src/test_turnos.rs::peor_caso_turnos_12_miembros_en_wasm`, pero con
//! el adaptador y un pool que emite los mismos eventos que Blend v2.
//!
//! Además de lecturas y escrituras, revisa el **tamaño de los eventos** de cada transacción: la red
//! rechaza (`resource_limit_exceeded`) una transacción que emite más de 16 KiB de eventos aunque la
//! simulación haya pasado, y una ronda que no se puede cerrar deja la tanda trabada. En testnet pasó
//! justo eso con 11 retiros de Blend en un mismo cierre (16 600 bytes).
//!
//! Las instrucciones aquí no son las reales: el pool es un simulador nativo, mucho más barato que
//! Blend. Las reales se miden en testnet con `node scripts/peor_caso_blend.mjs`.
extern crate std;

use crate::test::*;
use historial::{HistorialContract, HistorialContractClient};
use soroban_sdk::{testutils::Address as _, Address, Vec};
use tanda::{ModoTurnos, OpcionesTanda, TandaContract, TandaContractClient, SIN_TURNO};

/// Límites de mainnet por transacción (los mismos que usan las pruebas de la tanda), más el tamaño
/// máximo de los eventos (`txMaxContractEventsSizeBytes` = 16 384).
const MAX_LECTURAS: u32 = 100;
const MAX_ESCRITURAS: u32 = 50;
/// 1 KiB menos que el límite de la red: aquí los eventos salen un poco más chicos que en testnet (el
/// token de prueba tiene un nombre más corto que `USDC:GATAL…`, que va en cada evento `transfer`). El
/// mismo cierre midió 16 372 bytes aquí y 16 600 en testnet, donde la red lo rechazó.
const MAX_BYTES_EVENTOS: u32 = 16_384 - 1_024;
const N: u32 = 12;
const CUOTA: i128 = 100 * U;
const PERIODO: u64 = 120;

struct Escenario {
    c: Ctx,
    tanda: TandaContractClient<'static>,
    gente: std::vec::Vec<Address>,
}

/// La tanda con el historial conectado y la moneda del contexto registrada en el adaptador (como
/// USDC en testnet, `registrar_boveda`).
fn escenario() -> Escenario {
    let c = setup();
    let env = &c.env;
    let addr = env.register(TandaContract, ());
    let tanda = TandaContractClient::new(env, &addr);
    tanda.inicializar(&Address::generate(env), &c.adaptador.address, &None);
    tanda.registrar_boveda(&c.token.address, &Some(c.adaptador.address.clone()));
    let h = HistorialContractClient::new(env, &env.register(HistorialContract, ()));
    h.inicializar(&Address::generate(env));
    h.autorizar_emisor(&addr);
    tanda.configurar_historial(&Some(h.address.clone()));
    let gente: std::vec::Vec<Address> = (0..N).map(|_| Address::generate(env)).collect();
    for p in &gente {
        c.sac.mint(p, &(10_000 * U));
    }
    Escenario { c, tanda, gente }
}

fn subasta() -> OpcionesTanda {
    OpcionesTanda {
        modo: ModoTurnos::Subasta,
        permitir_intercambio: false,
        prima_max_bps: 0,
        descuento_max_bps: 5_000,
        primeros_con_historial: 0,
        puntaje_primeros: 0,
        ofertas_selladas: false,
    }
}

/// (nombre, lecturas, escrituras, bytes de eventos) de lo más pesado de cada operación.
type Medidas = std::vec::Vec<(&'static str, u32, u32, u32)>;

impl Escenario {
    fn crear(&self, cobertura_bps: u32) -> u32 {
        let env = &self.c.env;
        self.tanda.crear_tanda_avanzada(
            &Address::generate(env),
            &self.c.token.address,
            &CUOTA,
            &N,
            &PERIODO,
            &1_000,
            &cobertura_bps,
            &subasta(),
        )
    }

    fn miembros(&self, id: u32) -> Vec<(Address, tanda::Miembro)> {
        self.tanda.get_miembros(&id)
    }

    fn miembro(&self, id: u32, quien: &Address) -> tanda::Miembro {
        self.miembros(id)
            .iter()
            .find(|(a, _)| a == quien)
            .map(|(_, m)| m)
            .unwrap()
    }

    /// Corre `f` sola y anota sus recursos; falla si pasa algún límite de mainnet.
    fn medir(&self, m: &mut Medidas, que: &'static str, f: impl FnOnce()) {
        self.c.env.cost_estimate().budget().reset_unlimited();
        f();
        let r = self.c.env.cost_estimate().resources();
        let lecturas = r.disk_read_entries + r.memory_read_entries;
        let eventos = r.contract_events_size_bytes;
        assert!(lecturas <= MAX_LECTURAS, "{que}: {lecturas} lecturas");
        assert!(
            r.write_entries <= MAX_ESCRITURAS,
            "{que}: {} escrituras",
            r.write_entries
        );
        assert!(
            eventos <= MAX_BYTES_EVENTOS,
            "{que}: {eventos} bytes de eventos (máximo {MAX_BYTES_EVENTOS})"
        );
        match m.iter_mut().find(|x| x.0 == que) {
            Some(x) => {
                x.1 = x.1.max(lecturas);
                x.2 = x.2.max(r.write_entries);
                x.3 = x.3.max(eventos);
            }
            None => m.push((que, lecturas, r.write_entries, eventos)),
        }
    }
}

fn imprimir(m: &Medidas) {
    for (que, lecturas, escrituras, eventos) in m {
        std::println!(
            "  {que:<46} {lecturas:>3} lecturas · {escrituras:>2} escrituras · {eventos:>6} bytes de eventos"
        );
    }
}

/// Escenario A: garantía mínima, una oferta por ronda y solo paga el último de la lista. En la segunda
/// ronda caen en mora 11 personas a la vez: es el cierre con más eventos (moroso, cubierto, hechos del
/// historial y, con Blend, un retiro por cada garantía que se usa).
#[test]
fn peor_caso_casi_sin_pagos_con_historial_cabe_en_una_transaccion() {
    let e = escenario();
    let id = e.crear(0);
    for p in &e.gente {
        e.tanda.unirse(&id, p);
    }
    let mut m = Medidas::new();
    for r in 0..(N - 1) {
        let quien = e.gente.iter().rev().find(|p| {
            let x = e.miembro(id, p);
            x.posicion == SIN_TURNO && !x.moroso
        });
        if let Some(p) = quien {
            e.tanda.ofertar(&id, p, &(100 * (r + 1)));
        }
        e.tanda.pagar_cuota(&id, &e.gente[N as usize - 1]);
        e.c.avanzar(PERIODO);
        e.medir(&mut m, "A: cerrar_ronda casi sin pagos", || {
            e.tanda.cerrar_ronda(&id);
        });
    }
    e.tanda.pagar_cuota(&id, &e.gente[N as usize - 1]);
    e.c.avanzar(PERIODO);
    e.medir(&mut m, "A: cerrar_ronda casi sin pagos", || {
        e.tanda.cerrar_ronda(&id);
    });
    e.medir(&mut m, "A: finalizar", || e.tanda.finalizar(&id));
    std::println!("Peor caso con Blend, casi sin pagos (12 personas, historial):");
    imprimir(&m);
    assert_eq!(e.c.adaptador.shares_de(&e.tanda.address), 0);
}

/// Escenario B: garantía completa y todos cumplen siempre; al final se reparten 12 garantías con su
/// rendimiento y el historial anota 12 tandas cumplidas.
#[test]
fn peor_caso_todos_cumplen_con_historial_cabe_en_una_transaccion() {
    let e = escenario();
    let id = e.crear(10_000);
    for p in &e.gente {
        e.tanda.unirse(&id, p);
    }
    let mut m = Medidas::new();
    for r in 0..N {
        if r < N - 1 {
            if let Some(p) = e
                .gente
                .iter()
                .find(|p| e.miembro(id, p).posicion == SIN_TURNO)
            {
                e.tanda.ofertar(&id, p, &500);
            }
        }
        for p in &e.gente {
            e.tanda.pagar_cuota(&id, p);
        }
        e.c.avanzar(PERIODO);
        e.medir(&mut m, "B: cerrar_ronda, todos cumplen", || {
            e.tanda.cerrar_ronda(&id);
        });
    }
    e.medir(&mut m, "B: finalizar, 12 cumplidos", || {
        e.tanda.finalizar(&id)
    });
    std::println!("Peor caso con Blend, todos cumplen (12 personas, historial):");
    imprimir(&m);
    assert_eq!(e.c.adaptador.shares_de(&e.tanda.address), 0);
}
