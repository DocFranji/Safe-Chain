//! # Historial crediticio on-chain (misión M2)
//!
//! Guarda, solo agregando, lo que cada dirección hizo en las tandas: cuotas a tiempo, tarde,
//! cubiertas por su garantía, mora, deudas saldadas y tandas terminadas. Con eso calcula un
//! **puntaje** público y un **nivel** (Nuevo, Bronce, Plata, Oro) que otras tandas usan para dar
//! beneficios (menos garantía, acceso a tandas exigentes).
//!
//! Principios (ver `docs/historial.md`):
//! - **Empieza en cero y el cero no da beneficios.** Así, crear una billetera nueva no "limpia" nada.
//! - **Lo negativo no se borra.** Los puntos negativos se guardan aparte y nunca bajan.
//! - **Inmutable.** No existe ninguna función para editar ni borrar. Ni el admin. Solo se agregan
//!   hechos, y solo desde contratos de tanda autorizados (`autorizar_emisor`).
//! - **Público.** Cualquiera lee el historial, el puntaje y las reglas, sin firmar.
//! - **Sin datos personales.** Solo direcciones de Stellar.
//!
//! Registro inmutable: cada hecho publica un evento `hist_hecho`. El struct `Historial` guarda los
//! acumulados (el RPC público guarda eventos solo unos días; los acumulados viven en el storage).
#![no_std]

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, Address, Env, Map, Vec,
};

#[cfg(test)]
mod test;

// ---------------------------------------------------------------------------
// Reglas fijas: la fórmula del puntaje
// ---------------------------------------------------------------------------

pub const PUNTOS_CUOTA_A_TIEMPO: i32 = 10;
pub const PUNTOS_CUOTA_TARDE: i32 = 3;
pub const PUNTOS_CUOTA_CUBIERTA: i32 = -15;
pub const PUNTOS_MOROSO: i32 = -100;
pub const PUNTOS_DEUDA_SALDADA: i32 = 60;
pub const PUNTOS_TANDA_CUMPLIDA: i32 = 50;
pub const PUNTOS_TANDA_CON_ATRASOS: i32 = 25;

/// Puntaje mínimo de cada nivel.
pub const MIN_BRONCE: u32 = 100;
pub const MIN_PLATA: u32 = 300;
pub const MIN_ORO: u32 = 600;

/// Descuento de garantía por nivel, en puntos básicos (10 000 = 100 %).
pub const DESCUENTO_BRONCE_BPS: u32 = 1_000;
pub const DESCUENTO_PLATA_BPS: u32 = 2_500;
pub const DESCUENTO_ORO_BPS: u32 = 5_000;

/// Reglas anti-inflado por defecto: 10 TUSD (7 decimales) y 150 puntos por tanda.
pub const CUOTA_MINIMA_DEFECTO: i128 = 100_000_000;
pub const TOPE_POR_TANDA_DEFECTO: u32 = 150;

/// Máximo de hechos por lote (una tanda tiene como mucho 12 miembros; sobra margen).
pub const MAX_LOTE: u32 = 32;

/// Ledgers en un día (~5 s por ledger).
const DIA_LEDGERS: u32 = 17_280;

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

/// Lo que puede pasarle a alguien en una tanda.
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Hecho {
    /// Pagó su cuota antes del vencimiento (+10).
    CuotaATiempo,
    /// Pagó su cuota después del vencimiento (+3).
    CuotaTarde,
    /// No pagó y su garantía cubrió la cuota (−15).
    CuotaCubierta,
    /// Su garantía no alcanzó: quedó debiendo (−100).
    Moroso,
    /// Pagó toda su deuda (+60). No borra la mora.
    DeudaSaldada,
    /// Terminó una tanda sin atrasos ni mora (+50).
    TandaCumplida,
    /// Terminó una tanda con atrasos, sin mora (+25).
    TandaConAtrasos,
    /// Recibió su bolsa (0 puntos, solo informativo).
    Cobro,
}

/// Un hecho de un miembro, como lo envía la tanda.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct HechoMiembro {
    pub miembro: Address,
    pub hecho: Hecho,
    /// Monto relacionado (cuota pagada, monto cubierto, deuda, bolsa...). Nunca negativo.
    pub monto: i128,
}

/// Acumulados de una dirección. Todo empieza en cero.
#[contracttype]
#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct Historial {
    pub cuotas_a_tiempo: u32,
    pub cuotas_tarde: u32,
    pub cuotas_cubiertas: u32,
    pub veces_moroso: u32,
    pub deudas_saldadas: u32,
    pub tandas_cumplidas: u32,
    pub tandas_con_atrasos: u32,
    pub cobros: u32,
    /// Suma de las cuotas que pagó de su bolsillo (a tiempo o tarde).
    pub monto_pagado: i128,
    /// Puntos ganados, ya con las reglas anti-inflado aplicadas.
    pub puntos_positivos: u32,
    /// Puntos perdidos. Nunca bajan.
    pub puntos_negativos: u32,
    /// Momento (timestamp) del primer y del último hecho. 0 = sin historial.
    pub primera_actividad: u64,
    pub ultima_actividad: u64,
}

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Nivel {
    Nuevo = 0,
    Bronce = 1,
    Plata = 2,
    Oro = 3,
}

/// Reglas anti-inflado. Se aplican solo a hechos futuros: lo ya ganado no se recalcula.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Reglas {
    /// Los puntos positivos solo cuentan en tandas con cuota igual o mayor a esta.
    pub cuota_minima: i128,
    /// Máximo de puntos positivos que una persona gana en una misma tanda.
    pub tope_por_tanda: u32,
}

#[contracttype]
#[derive(Clone)]
enum Clave {
    // instance
    Admin,
    Reglas,
    // persistent
    Emisor(Address),
    Hist(Address),
    /// Puntos positivos que cada miembro ya ganó en la tanda `id` del emisor (para el tope).
    /// Una sola entrada por tanda (máx. 12 miembros): así un lote escribe una vez, no 12.
    PuntosTanda(Address, u32),
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    YaInicializado = 1,
    NoInicializado = 2,
    /// Quien intenta escribir no es un contrato de tanda autorizado.
    NoAutorizado = 3,
    ParametroInvalido = 4,
}

// ---------------------------------------------------------------------------
// Eventos
// ---------------------------------------------------------------------------

/// Un hecho nuevo en el historial de `miembro`. Este es el registro inmutable, hecho por hecho.
#[contractevent(topics = ["hist_hecho"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EvHecho {
    #[topic]
    pub miembro: Address,
    /// Contrato de tanda que lo reportó.
    pub emisor: Address,
    pub tanda_id: u32,
    pub hecho: Hecho,
    pub monto: i128,
    /// Puntos que sumó (o restó), ya con las reglas aplicadas.
    pub puntos: i32,
}

#[contractevent(topics = ["emisor_ok"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EvEmisorAutorizado {
    pub emisor: Address,
}

#[contractevent(topics = ["emisor_no"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EvEmisorRevocado {
    pub emisor: Address,
}

#[contractevent(topics = ["reglas"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EvReglas {
    pub cuota_minima: i128,
    pub tope_por_tanda: u32,
}

// ---------------------------------------------------------------------------
// Fórmula (funciones puras, públicas para que la web y las pruebas usen la misma)
// ---------------------------------------------------------------------------

/// Puntos de un hecho antes de las reglas anti-inflado.
pub fn puntos_base(hecho: Hecho) -> i32 {
    match hecho {
        Hecho::CuotaATiempo => PUNTOS_CUOTA_A_TIEMPO,
        Hecho::CuotaTarde => PUNTOS_CUOTA_TARDE,
        Hecho::CuotaCubierta => PUNTOS_CUOTA_CUBIERTA,
        Hecho::Moroso => PUNTOS_MOROSO,
        Hecho::DeudaSaldada => PUNTOS_DEUDA_SALDADA,
        Hecho::TandaCumplida => PUNTOS_TANDA_CUMPLIDA,
        Hecho::TandaConAtrasos => PUNTOS_TANDA_CON_ATRASOS,
        Hecho::Cobro => 0,
    }
}

/// Puntaje = positivos − negativos, nunca menos de 0.
pub fn puntaje_de(h: &Historial) -> u32 {
    h.puntos_positivos.saturating_sub(h.puntos_negativos)
}

pub fn nivel_de_puntaje(puntaje: u32) -> Nivel {
    if puntaje >= MIN_ORO {
        Nivel::Oro
    } else if puntaje >= MIN_PLATA {
        Nivel::Plata
    } else if puntaje >= MIN_BRONCE {
        Nivel::Bronce
    } else {
        Nivel::Nuevo
    }
}

/// Descuento de garantía. Sin beneficio mientras tenga una mora sin saldar.
pub fn beneficio_de(h: &Historial) -> u32 {
    if h.veces_moroso > h.deudas_saldadas {
        return 0;
    }
    match nivel_de_puntaje(puntaje_de(h)) {
        Nivel::Nuevo => 0,
        Nivel::Bronce => DESCUENTO_BRONCE_BPS,
        Nivel::Plata => DESCUENTO_PLATA_BPS,
        Nivel::Oro => DESCUENTO_ORO_BPS,
    }
}

// ---------------------------------------------------------------------------
// Almacenamiento
// ---------------------------------------------------------------------------

/// Todo vive lo máximo que permite la red y se renueva como mucho una vez al día.
fn renovar_instancia(env: &Env) {
    let max = env.storage().max_ttl();
    env.storage()
        .instance()
        .extend_ttl(max.saturating_sub(DIA_LEDGERS), max);
}

fn renovar(env: &Env, clave: &Clave) {
    let max = env.storage().max_ttl();
    env.storage()
        .persistent()
        .extend_ttl(clave, max.saturating_sub(DIA_LEDGERS), max);
}

fn cargar_hist(env: &Env, dir: &Address) -> Historial {
    env.storage()
        .persistent()
        .get(&Clave::Hist(dir.clone()))
        .unwrap_or_default()
}

fn cargar_reglas(env: &Env) -> Result<Reglas, Error> {
    env.storage()
        .instance()
        .get(&Clave::Reglas)
        .ok_or(Error::NoInicializado)
}

fn admin(env: &Env) -> Result<Address, Error> {
    env.storage()
        .instance()
        .get(&Clave::Admin)
        .ok_or(Error::NoInicializado)
}

// ---------------------------------------------------------------------------
// El contrato
// ---------------------------------------------------------------------------

#[contract]
pub struct HistorialContract;

#[contractimpl]
impl HistorialContract {
    /// Una sola vez: guarda el admin y las reglas por defecto.
    pub fn inicializar(env: Env, admin: Address) -> Result<(), Error> {
        let s = env.storage().instance();
        if s.has(&Clave::Admin) {
            return Err(Error::YaInicializado);
        }
        admin.require_auth();
        s.set(&Clave::Admin, &admin);
        s.set(
            &Clave::Reglas,
            &Reglas {
                cuota_minima: CUOTA_MINIMA_DEFECTO,
                tope_por_tanda: TOPE_POR_TANDA_DEFECTO,
            },
        );
        renovar_instancia(&env);
        Ok(())
    }

    /// (admin) Permite que un contrato de tanda escriba hechos. Público y con evento.
    pub fn autorizar_emisor(env: Env, emisor: Address) -> Result<(), Error> {
        admin(&env)?.require_auth();
        let clave = Clave::Emisor(emisor.clone());
        env.storage().persistent().set(&clave, &true);
        renovar(&env, &clave);
        renovar_instancia(&env);
        EvEmisorAutorizado { emisor }.publish(&env);
        Ok(())
    }

    /// (admin) Impide escrituras FUTURAS de un emisor. No borra nada de lo que ya escribió.
    pub fn revocar_emisor(env: Env, emisor: Address) -> Result<(), Error> {
        admin(&env)?.require_auth();
        let clave = Clave::Emisor(emisor.clone());
        env.storage().persistent().set(&clave, &false);
        renovar(&env, &clave);
        renovar_instancia(&env);
        EvEmisorRevocado { emisor }.publish(&env);
        Ok(())
    }

    /// (admin) Cambia las reglas anti-inflado para hechos futuros.
    pub fn configurar_reglas(env: Env, reglas: Reglas) -> Result<(), Error> {
        admin(&env)?.require_auth();
        if reglas.cuota_minima < 0 || reglas.tope_por_tanda == 0 {
            return Err(Error::ParametroInvalido);
        }
        env.storage().instance().set(&Clave::Reglas, &reglas);
        renovar_instancia(&env);
        EvReglas {
            cuota_minima: reglas.cuota_minima,
            tope_por_tanda: reglas.tope_por_tanda,
        }
        .publish(&env);
        Ok(())
    }

    /// (emisor autorizado) Agrega hechos de la tanda `tanda_id`, cuya cuota es `cuota`.
    /// Desde otro contrato, `emisor.require_auth()` se cumple solo si quien llama ES el emisor.
    pub fn registrar_lote(
        env: Env,
        emisor: Address,
        tanda_id: u32,
        cuota: i128,
        hechos: Vec<HechoMiembro>,
    ) -> Result<(), Error> {
        emisor.require_auth();
        let autorizado: bool = env
            .storage()
            .persistent()
            .get(&Clave::Emisor(emisor.clone()))
            .unwrap_or(false);
        if !autorizado {
            return Err(Error::NoAutorizado);
        }
        if hechos.len() > MAX_LOTE {
            return Err(Error::ParametroInvalido);
        }
        let reglas = cargar_reglas(&env)?;
        let elegible = cuota >= reglas.cuota_minima;
        let ahora = env.ledger().timestamp();
        let clave_tanda = Clave::PuntosTanda(emisor.clone(), tanda_id);
        let mut por_tanda: Option<Map<Address, u32>> = None; // se lee solo si hace falta

        for hm in hechos.iter() {
            if hm.monto < 0 {
                return Err(Error::ParametroInvalido);
            }
            let base = puntos_base(hm.hecho);
            // Positivos: solo en tandas elegibles y hasta el tope por tanda. Negativos: siempre.
            let puntos: i32 = if base > 0 {
                if elegible {
                    let mapa = por_tanda.get_or_insert_with(|| {
                        env.storage()
                            .persistent()
                            .get(&clave_tanda)
                            .unwrap_or_else(|| Map::new(&env))
                    });
                    let usados = mapa.get(hm.miembro.clone()).unwrap_or(0);
                    let dar = (base as u32).min(reglas.tope_por_tanda.saturating_sub(usados));
                    mapa.set(hm.miembro.clone(), usados + dar);
                    dar as i32
                } else {
                    0
                }
            } else {
                base
            };

            let mut h = cargar_hist(&env, &hm.miembro);
            if puntos > 0 {
                h.puntos_positivos += puntos as u32;
            } else {
                h.puntos_negativos += puntos.unsigned_abs();
            }
            match hm.hecho {
                Hecho::CuotaATiempo => {
                    h.cuotas_a_tiempo += 1;
                    h.monto_pagado += hm.monto;
                }
                Hecho::CuotaTarde => {
                    h.cuotas_tarde += 1;
                    h.monto_pagado += hm.monto;
                }
                Hecho::CuotaCubierta => h.cuotas_cubiertas += 1,
                Hecho::Moroso => h.veces_moroso += 1,
                Hecho::DeudaSaldada => h.deudas_saldadas += 1,
                Hecho::TandaCumplida => h.tandas_cumplidas += 1,
                Hecho::TandaConAtrasos => h.tandas_con_atrasos += 1,
                Hecho::Cobro => h.cobros += 1,
            }
            if h.primera_actividad == 0 {
                h.primera_actividad = ahora;
            }
            h.ultima_actividad = ahora;
            let clave = Clave::Hist(hm.miembro.clone());
            env.storage().persistent().set(&clave, &h);
            renovar(&env, &clave);

            EvHecho {
                miembro: hm.miembro,
                emisor: emisor.clone(),
                tanda_id,
                hecho: hm.hecho,
                monto: hm.monto,
                puntos,
            }
            .publish(&env);
        }
        if let Some(mapa) = por_tanda {
            env.storage().persistent().set(&clave_tanda, &mapa);
            renovar(&env, &clave_tanda);
        }
        renovar_instancia(&env);
        Ok(())
    }

    // -----------------------------------------------------------------------
    // Lecturas (sin firma)
    // -----------------------------------------------------------------------

    /// Acumulados de `dir` (todo en cero si no tiene historial).
    pub fn historial(env: Env, dir: Address) -> Historial {
        cargar_hist(&env, &dir)
    }

    pub fn puntaje(env: Env, dir: Address) -> u32 {
        puntaje_de(&cargar_hist(&env, &dir))
    }

    pub fn nivel(env: Env, dir: Address) -> Nivel {
        nivel_de_puntaje(puntaje_de(&cargar_hist(&env, &dir)))
    }

    /// Descuento de garantía que le corresponde a `dir`, en puntos básicos.
    pub fn beneficio_colateral_bps(env: Env, dir: Address) -> u32 {
        beneficio_de(&cargar_hist(&env, &dir))
    }

    pub fn es_emisor(env: Env, dir: Address) -> bool {
        env.storage()
            .persistent()
            .get(&Clave::Emisor(dir))
            .unwrap_or(false)
    }

    pub fn reglas(env: Env) -> Result<Reglas, Error> {
        cargar_reglas(&env)
    }

    /// Puntos positivos que `miembro` ya ganó en la tanda `tanda_id` del contrato `emisor`.
    pub fn puntos_en_tanda(env: Env, emisor: Address, tanda_id: u32, miembro: Address) -> u32 {
        env.storage()
            .persistent()
            .get::<_, Map<Address, u32>>(&Clave::PuntosTanda(emisor, tanda_id))
            .and_then(|m| m.get(miembro))
            .unwrap_or(0)
    }
}
