//! Pruebas de invariantes (ORQ): miles de operaciones al azar, pero reproducibles, sobre varias
//! tandas a la vez, revisando después de CADA operación las reglas que nunca deben romperse.
//!
//! Cada escenario arma un mundo con 6 a 15 personas, la bóveda principal (con interés real y a veces
//! casi sin fondos para intereses, así se prueba su tope de solvencia), a veces la bóveda rápida y a
//! veces el historial (con puntajes previos, requisitos y descuentos, y hasta un historial que deja
//! de aceptar hechos o se desconecta). Luego juega:
//! - crea tandas de 3 a 12 personas en todos los modos de turnos, con cuotas, multas, coberturas y
//!   rondas de 1 minuto a 90 días;
//! - la gente se une (eligiendo turno o no) y paga a tiempo, tarde o nunca, según su perfil;
//! - se saldan deudas, completas o en partes, por el moroso o por otra persona;
//! - hay ofertas en subastas, y propuestas, aceptaciones y cancelaciones de intercambios;
//! - en las subastas selladas se sella y se revela (también sellos copiados, revelaciones fuera de
//!   fase y con la sal o el monto equivocados), y al cerrar gana la mayor oferta revelada;
//! - hay tandas cuyos primeros turnos piden historial: al unirse, al llenarse y al intercambiar;
//! - se cierran rondas a tiempo o muy tarde (y antes de que venzan si todos pagaron, M1 v4), se
//!   cancelan tandas abiertas y se finalizan las terminadas;
//! - se pagan deudas también después de finalizar (M1 v4): directo a quien cobró de menos o, si su
//!   bolsa se retuvo y se repartió, en partes iguales a quienes recibieron el reparto.
//!
//! También intenta lo que debe fallar y comprueba el código de error exacto.
//!
//! Reglas que se revisan después de cada operación (`revisar`):
//! 1. No se crea ni se pierde dinero: la suma de todos los saldos no cambia nunca.
//! 2. El contrato tiene en mano EXACTAMENTE lo que debe: cuotas de la ronda en curso, bolsas
//!    retenidas, multas cobradas, primas por repartir y compensaciones de intercambios pendientes
//!    (más lo que quedó sin repartir en tandas donde todos terminaron en mora).
//! 3. Las participaciones que anota cada tanda suman las que la bóveda le reconoce al contrato. La
//!    bóveda puede pagarle a todos, y lo de cada tanda alcanza para su garantía.
//! 4. Nada negativo. La deuda es la suma de lo que se le debe a cada quien. Moroso ⇔ debe algo. Las
//!    bolsas retenidas están dentro de `retenido`. Cada turno tiene un solo dueño, y nadie cobra antes
//!    de su turno.
//! 5. Nunca se traba: `cerrar_ronda` y `finalizar` funcionan siempre que corresponde, y al terminar
//!    no queda garantía ni participaciones de la tanda.
//!
//! Además, operación por operación, se revisa que cada quien pague o reciba lo que dicen las reglas
//! (unirse, pagar cuota, cerrar ronda, pagar deuda, intercambios, finalizar y cancelar). Y en el modo
//! "testnet" (la mitad de los escenarios), antes de cada salto de tiempo, que ningún dato de una
//! tanda activa se archive en el camino.
//!
//! Si algo falla, el mensaje trae la semilla y las últimas operaciones. Para repetir una semilla:
//!   INVARIANTES_SEMILLA=123 cargo test -p tanda invariantes -- --nocapture
//! Para correr más escenarios (por defecto 8; en CI, 32; repartidos en 4 pruebas que corren en paralelo):
//!   INVARIANTES_SEMILLAS=1000 cargo test -p tanda --release invariantes
extern crate std;

use crate::test::U;
use crate::turnos::ClaveM3;
use crate::{
    ClaveM1, DataKey, Deuda, Error, Estado, Miembro, ModoTurnos, OpcionesTanda, Propuesta, Tanda,
    TandaContract, TandaContractClient, BPS, SIN_TURNO,
};
use boveda_simulada::{BovedaSimulada, BovedaSimuladaClient};
use core::cell::RefCell;
use core::fmt::Debug;
use historial::{HistorialContract, HistorialContractClient};
use soroban_sdk::{
    contracttype,
    testutils::{
        storage::{Instance as _, Persistent as _},
        Address as _, EnvTestConfig, Ledger,
    },
    token::{StellarAssetClient, TokenClient},
    Address, Bytes, BytesN, Env, IntoVal, Val,
};
use std::{collections::BTreeMap, format, string::String, vec::Vec as StdVec};

/// Escenarios por defecto (en `cargo test` de siempre). Más con `INVARIANTES_SEMILLAS`.
const SEMILLAS_POR_DEFECTO: u64 = 8;
/// Saldo de cada persona: de sobra para varias tandas grandes a la vez.
const SALDO: i128 = 1_000_000 * U;
const DIA: u64 = 86_400;
const SEG_POR_LEDGER: u64 = 5;
/// Límites de testnet (los mismos que usa `test_tiempos.rs`).
const MAX_TTL_TESTNET: u32 = 3_110_400;
const MIN_TTL_PERSISTENTE_TESTNET: u32 = 120_960;
/// En el modo testnet, nadie deja una ronda vencida sin cerrar más de esto: los pagos de la ronda
/// viven hasta su vencimiento + 30 días (M1) y aquí se revisa que nada se archive en el camino.
const ATRASO_MAX_CIERRE: u64 = 20 * DIA;

/// Misma forma que la clave privada `Clave::Shares` de la bóveda simulada, para leer su TTL.
#[contracttype]
#[derive(Clone)]
enum ClaveBoveda {
    Shares(Address),
}

// ---------------------------------------------------------------------------
// Azar reproducible (xorshift64*)
// ---------------------------------------------------------------------------

struct Azar(u64);

impl Azar {
    fn nuevo(semilla: u64) -> Self {
        Azar((semilla.wrapping_mul(0x9E37_79B9_7F4A_7C15) ^ 0xD1B5_4A32_D192_ED03) | 1)
    }
    fn sig(&mut self) -> u64 {
        let mut x = self.0;
        x ^= x >> 12;
        x ^= x << 25;
        x ^= x >> 27;
        self.0 = x;
        x.wrapping_mul(0x2545_F491_4F6C_DD1D)
    }
    /// Entero en [a, b].
    fn entre(&mut self, a: u64, b: u64) -> u64 {
        a + self.sig() % (b - a + 1)
    }
    /// Índice en [0, n).
    fn hasta(&mut self, n: usize) -> usize {
        (self.sig() % n as u64) as usize
    }
    /// Verdadero con probabilidad `pct` %.
    fn si(&mut self, pct: u64) -> bool {
        self.sig() % 100 < pct
    }
}

// ---------------------------------------------------------------------------
// El mundo de un escenario
// ---------------------------------------------------------------------------

/// Cómo se porta cada miembro en una tanda.
#[derive(Clone, Copy, Debug, PartialEq)]
enum Perfil {
    /// Paga siempre que le toca.
    Cumplido,
    /// Paga a veces a tiempo y a veces tarde.
    Distraido,
    /// Paga como la mitad de las veces.
    Irregular,
    /// Deja de pagar desde esa ronda (aunque a veces alguien salda su deuda).
    Desaparece(u32),
}

struct TandaM {
    id: u32,
    /// `None`: creada con `crear_tanda` (orden de llegada, como siempre).
    opciones: Option<OpcionesTanda>,
    perfiles: StdVec<(Address, Perfil)>,
    /// Finalizada o cancelada: ya se revisó al terminar y no cambia más.
    terminada: bool,
    /// Subasta sellada: lo que cada quien selló (descuento y sal) en la ronda `sellos_ronda`.
    sellos: StdVec<(Address, u32, [u8; 32])>,
    sellos_ronda: u32,
    /// Ronda y momento en que se cerró la anterior: ahí empezó de verdad (para la mitad sellada).
    inicio_real: Option<(u32, u64)>,
    /// (M1 v4) Al finalizar: quiénes recibieron las bolsas retenidas (vacío si no hubo reparto).
    repartidos: StdVec<Address>,
}

struct Mundo {
    semilla: u64,
    azar: Azar,
    env: Env,
    tanda: TandaContractClient<'static>,
    yo: Address,
    token: TokenClient<'static>,
    /// [principal, rápida (si hay)].
    bovedas: StdVec<Address>,
    hist: Option<Address>,
    hist_conectado: bool,
    gente: StdVec<Address>,
    testnet: bool,
    /// Todo el dinero que existe (no cambia).
    total: i128,
    tandas: StdVec<TandaM>,
    /// Lo que quedó en el contrato de tandas donde todos terminaron en mora (`EvFinalizada.sin_repartir`).
    sin_repartir: i128,
    bitacora: StdVec<String>,
    /// Cuántas veces pasó cada cosa (para ver que el juego recorre los casos difíciles).
    contador: RefCell<BTreeMap<String, u32>>,
}

fn garantia_turno(t: &Tanda, posicion: u32) -> i128 {
    let restantes = (t.n_miembros - 1 - posicion) as i128;
    (t.cuota * restantes * t.cobertura_bps as i128 / BPS).max(t.cuota)
}

/// La garantía que `pagar_deuda` repone para las cuotas que faltan (`deudas.rs`).
fn garantia_restantes(t: &Tanda, restantes: u32) -> i128 {
    if restantes == 0 {
        return 0;
    }
    (t.cuota * restantes as i128 * t.cobertura_bps as i128 / BPS).max(t.cuota)
}

fn intercambiable(m: &Miembro, ronda: u32) -> bool {
    m.posicion != SIN_TURNO && m.posicion > ronda && !m.cobro && !m.moroso
}

/// Los sellos que el modelo espera en la ronda `ronda` (los de rondas pasadas ya no cuentan).
fn sellos_modelo(tm: &TandaM, ronda: u32) -> &[(Address, u32, [u8; 32])] {
    if tm.sellos_ronda == ronda {
        &tm.sellos
    } else {
        &[]
    }
}

/// Subasta sellada: hasta aquí se sella y desde aquí se revela. Es la mitad del tiempo que la ronda
/// tuvo de verdad: si la anterior se cerró tarde (calendario anclado de M1), esta empezó al cerrarse
/// aquella y no en `inicio_ronda`.
fn mitad_modelo(tm: &TandaM, t: &Tanda) -> u64 {
    let vence = t.inicio_ronda + t.periodo_seg;
    let desde = match tm.inicio_real {
        Some((ronda, momento)) if ronda == t.ronda_actual => momento.clamp(t.inicio_ronda, vence),
        _ => t.inicio_ronda,
    };
    desde + (vence - desde) / 2
}

/// Subasta: en un empate gana quien va antes en el orden de respaldo (sorteado al llenarse).
fn antes_en_respaldo(respaldo: &soroban_sdk::Vec<Address>, a: &Address, b: &Address) -> bool {
    match (respaldo.first_index_of(a), respaldo.first_index_of(b)) {
        (Some(i), Some(j)) => i < j,
        (Some(_), None) => true,
        _ => false,
    }
}

impl Mundo {
    fn nuevo(semilla: u64) -> Mundo {
        let mut azar = Azar::nuevo(semilla);
        let env = Env::new_with_config(EnvTestConfig {
            capture_snapshot_at_drop: false,
        });
        env.mock_all_auths();
        env.cost_estimate().budget().reset_unlimited();
        let testnet = azar.si(50);
        env.ledger().with_mut(|l| {
            l.timestamp = 1_700_000_000;
            l.sequence_number = 1_000;
            if testnet {
                l.max_entry_ttl = MAX_TTL_TESTNET;
                l.min_persistent_entry_ttl = MIN_TTL_PERSISTENTE_TESTNET;
            }
        });

        let token_addr = env
            .register_stellar_asset_contract_v2(Address::generate(&env))
            .address();
        let sac = StellarAssetClient::new(&env, &token_addr);
        let token = TokenClient::new(&env, &token_addr);
        let mut total = 0;

        // Bóveda principal: interés real. A veces casi sin dinero para intereses (tope de solvencia).
        let apr = [0u32, 500, 500, 2_000][azar.hasta(4)];
        let principal = env.register(BovedaSimulada, (token_addr.clone(), apr, 1u32));
        let fondeo = if azar.si(20) { U } else { 10_000 * U };
        sac.mint(&principal, &fondeo);
        total += fondeo;
        let mut bovedas = StdVec::new();
        bovedas.push(principal.clone());

        let yo = env.register(TandaContract, ());
        let tanda = TandaContractClient::new(&env, &yo);
        tanda.inicializar(&Address::generate(&env), &principal, &None);

        // Bóveda rápida (acelerada) para las tandas de rondas de hasta 10 minutos.
        if azar.si(50) {
            let b = env.register(BovedaSimulada, (token_addr.clone(), 500u32, 52_560u32));
            let f = if azar.si(30) { 10 * U } else { 10_000 * U };
            sac.mint(&b, &f);
            total += f;
            tanda.configurar_boveda_rapida(&Some(b.clone()));
            bovedas.push(b);
        }

        let n_gente = azar.entre(6, 15) as usize;
        let mut gente = StdVec::new();
        for _ in 0..n_gente {
            let p = Address::generate(&env);
            sac.mint(&p, &SALDO);
            total += SALDO;
            gente.push(p);
        }

        // Historial crediticio, con algunos que ya traen puntaje de "otras tandas".
        let hist = if azar.si(50) {
            let h_addr = env.register(HistorialContract, ());
            let h = HistorialContractClient::new(&env, &h_addr);
            h.inicializar(&Address::generate(&env));
            h.autorizar_emisor(&yo);
            tanda.configurar_historial(&Some(h_addr.clone()));
            let otra = Address::generate(&env);
            h.autorizar_emisor(&otra);
            for (i, p) in gente.iter().enumerate() {
                let previas = [0u32, 0, 1, 3, 6][azar.hasta(5)];
                for k in 0..previas {
                    let mut lote = soroban_sdk::Vec::new(&env);
                    for _ in 0..12 {
                        lote.push_back(historial::HechoMiembro {
                            miembro: p.clone(),
                            hecho: historial::Hecho::CuotaATiempo,
                            monto: 100 * U,
                        });
                    }
                    h.registrar_lote(&otra, &(10_000 + i as u32 * 10 + k), &(100 * U), &lote);
                }
            }
            Some(h_addr)
        } else {
            None
        };

        Mundo {
            semilla,
            azar,
            env,
            tanda,
            yo,
            token,
            bovedas,
            hist_conectado: hist.is_some(),
            hist,
            gente,
            testnet,
            total,
            tandas: StdVec::new(),
            sin_repartir: 0,
            bitacora: StdVec::new(),
            contador: RefCell::new(BTreeMap::new()),
        }
    }

    // -----------------------------------------------------------------------
    // Ayudas
    // -----------------------------------------------------------------------

    fn ahora(&self) -> u64 {
        self.env.ledger().timestamp()
    }

    fn saldo(&self, a: &Address) -> i128 {
        self.token.balance(a)
    }

    fn saldos(&self) -> StdVec<i128> {
        self.gente.iter().map(|p| self.saldo(p)).collect()
    }

    fn idx(&self, a: &Address) -> usize {
        self.gente.iter().position(|p| p == a).unwrap()
    }

    fn nombre(&self, a: &Address) -> String {
        match self.gente.iter().position(|p| p == a) {
            Some(i) => format!("p{i}"),
            None => String::from("?"),
        }
    }

    fn persona(&mut self) -> Address {
        let i = self.azar.hasta(self.gente.len());
        self.gente[i].clone()
    }

    fn historial(&self) -> Option<HistorialContractClient<'static>> {
        self.hist
            .as_ref()
            .map(|h| HistorialContractClient::new(&self.env, h))
    }

    fn puntaje(&self, p: &Address) -> u32 {
        self.historial().map(|h| h.puntaje(p)).unwrap_or(0)
    }

    /// (M2 v4, N2a) Con el historial conectado, quien tiene una mora sin saldar no puede unirse.
    fn bloqueado_por_deuda(&self, p: &Address) -> bool {
        self.hist_conectado && self.historial().map(|h| h.tiene_mora(p)).unwrap_or(false)
    }

    fn boveda(&self, id: u32) -> BovedaSimuladaClient<'static> {
        BovedaSimuladaClient::new(&self.env, &self.tanda.get_boveda(&id))
    }

    /// Lo que puede perderse por redondeo de participaciones en toda la tanda `id`: la bóveda redondea
    /// a su favor hasta una participación (precio / ESCALA unidades mínimas) en cada depósito o retiro,
    /// y una tanda de n personas hace a lo sumo unos n² + 3n de esos. Con la bóveda rápida vieja el
    /// precio sube mucho (×720 a los 100 días) y esto llega a ~0,01 TUSD: polvo, pero no cero.
    fn tolerancia(&self, id: u32) -> i128 {
        let n = self.tanda.get_tanda(&id).n_miembros as i128;
        let por_operacion = self.boveda(id).precio() / boveda_simulada::ESCALA + 2;
        (n * n + 3 * n + 4) * por_operacion
    }

    fn miembros(&self, id: u32) -> StdVec<(Address, Miembro)> {
        self.tanda.get_miembros(&id).iter().collect()
    }

    fn miembro(&self, id: u32, a: &Address) -> Option<Miembro> {
        self.miembros(id)
            .into_iter()
            .find(|(d, _)| d == a)
            .map(|(_, m)| m)
    }

    fn propuestas(&self, id: u32) -> StdVec<Propuesta> {
        self.tanda
            .get_estado_turnos(&id)
            .propuestas
            .iter()
            .collect()
    }

    /// Subasta sellada: sha256(descuento en 4 bytes big-endian ‖ sal), como la web y el contrato.
    fn sello(&self, descuento_bps: u32, sal: &[u8; 32]) -> BytesN<32> {
        let mut datos = Bytes::from_array(&self.env, &descuento_bps.to_be_bytes());
        datos.append(&Bytes::from_array(&self.env, sal));
        self.env.crypto().sha256(&datos).to_bytes()
    }

    fn sal_al_azar(&mut self) -> [u8; 32] {
        let mut sal = [0u8; 32];
        for trozo in sal.chunks_mut(8) {
            trozo.copy_from_slice(&self.azar.sig().to_le_bytes());
        }
        sal
    }

    fn sellos_de(&self, k: usize, ronda: u32) -> StdVec<(Address, u32, [u8; 32])> {
        sellos_modelo(&self.tandas[k], ronda).to_vec()
    }

    fn mitad(&self, k: usize, t: &Tanda) -> u64 {
        mitad_modelo(&self.tandas[k], t)
    }

    /// Error de llegar al turno `pos` si es de los primeros que piden historial (`None` si puede).
    fn error_turno_protegido(&self, o: &OpcionesTanda, quien: &Address, pos: u32) -> Option<Error> {
        if pos >= o.primeros_con_historial {
            None
        } else if !self.hist_conectado {
            Some(Error::HistorialNoConfigurado)
        } else if self.puntaje(quien) < o.puntaje_primeros {
            Some(Error::TurnoExigeHistorial)
        } else {
            None
        }
    }

    /// Intercambio: `de` pasaría al turno de `con` (`b`) y `con` al de `de` (`a`); los dos tienen
    /// que poder llegar al turno nuevo.
    fn error_intercambio_protegido(
        &self,
        o: &OpcionesTanda,
        de: &Address,
        a: &Miembro,
        con: &Address,
        b: &Miembro,
    ) -> Option<Error> {
        self.error_turno_protegido(o, de, b.posicion)
            .or_else(|| self.error_turno_protegido(o, con, a.posicion))
    }

    fn anotar(&mut self, s: String) {
        self.bitacora.push(s);
        if self.bitacora.len() > 400 {
            self.bitacora.drain(0..200);
        }
    }

    fn fallar(&self, msg: &str) -> ! {
        let desde = self.bitacora.len().saturating_sub(40);
        let mut texto = String::new();
        for l in &self.bitacora[desde..] {
            texto.push_str("    ");
            texto.push_str(l);
            texto.push('\n');
        }
        panic!(
            "\n[invariantes] semilla {s} (modo testnet: {t}): {msg}\nÚltimas operaciones:\n{texto}\
             Para repetirla: INVARIANTES_SEMILLA={s} cargo test -p tanda invariantes -- --nocapture",
            s = self.semilla,
            t = self.testnet,
        );
    }

    fn contar(&self, que: &str) {
        *self
            .contador
            .borrow_mut()
            .entry(String::from(que))
            .or_insert(0) += 1;
    }

    fn exigir(&self, ok: bool, msg: impl FnOnce() -> String) {
        if !ok {
            self.fallar(&msg());
        }
    }

    /// Convierte la respuesta de un `try_*` en `Result<T, Error>`; cualquier otra falla (pánico,
    /// desbordamiento, error de la bóveda o del anfitrión) es un hallazgo.
    fn res<T, A: Debug, B: Debug>(
        &self,
        que: &str,
        r: Result<Result<T, A>, Result<Error, B>>,
    ) -> Result<T, Error> {
        match r {
            Ok(Ok(v)) => Ok(v),
            Err(Ok(e)) => Err(e),
            Ok(Err(e)) => self.fallar(&format!("{que}: respuesta ilegible {e:?}")),
            Err(Err(e)) => self.fallar(&format!(
                "{que}: se cayó sin un código de error de la tanda (pánico, desbordamiento, \
                 bóveda o anfitrión): {e:?}"
            )),
        }
    }

    /// Exige el resultado esperado: `None` = debe funcionar; `Some(e)` = debe fallar con `e`.
    fn segun<T: Debug>(
        &self,
        que: &str,
        r: Result<T, Error>,
        esperado: Option<Error>,
    ) -> Option<T> {
        match (esperado, r) {
            (None, Ok(v)) => {
                self.contar(&format!("{que}: ok"));
                Some(v)
            }
            (Some(e), Err(x)) if e == x => {
                self.contar(&format!("{que}: {e:?}"));
                None
            }
            (esperado, r) => self.fallar(&format!(
                "{que}: se esperaba {} y salió {r:?}",
                match esperado {
                    None => String::from("que funcionara"),
                    Some(e) => format!("el error {e:?}"),
                }
            )),
        }
    }

    // -----------------------------------------------------------------------
    // Crear, unirse, cancelar
    // -----------------------------------------------------------------------

    fn opciones_al_azar(&mut self, n: u32) -> OpcionesTanda {
        let modo = [
            ModoTurnos::Llegada,
            ModoTurnos::Eleccion,
            ModoTurnos::PrecioPorTurno,
            ModoTurnos::Sorteo,
            ModoTurnos::Subasta,
        ][self.azar.hasta(5)];
        // Los primeros turnos piden historial (donde cada quien elige su turno). Si el historial
        // existe pero está desconectado, crear la tanda debe fallar.
        let elige = matches!(modo, ModoTurnos::Eleccion | ModoTurnos::PrecioPorTurno);
        let (primeros, puntaje) = if elige && self.hist.is_some() && self.azar.si(40) {
            (
                self.azar.entre(1, n as u64 - 1) as u32,
                [40u32, 100, 100, 300][self.azar.hasta(4)],
            )
        } else {
            (0, 0)
        };
        OpcionesTanda {
            modo,
            permitir_intercambio: modo != ModoTurnos::Subasta && self.azar.si(80),
            prima_max_bps: if modo == ModoTurnos::PrecioPorTurno {
                self.azar.entre(1, 2_000) as u32
            } else {
                0
            },
            descuento_max_bps: if modo == ModoTurnos::Subasta {
                self.azar.entre(1, 5_000) as u32
            } else {
                0
            },
            primeros_con_historial: primeros,
            puntaje_primeros: puntaje,
            ofertas_selladas: modo == ModoTurnos::Subasta && self.azar.si(50),
        }
    }

    /// Opciones que no se pueden crear (todas dan `OpcionesInvalidas`), para `n` personas.
    fn opciones_invalidas(&mut self, n: u32) -> OpcionesTanda {
        let base = OpcionesTanda {
            modo: ModoTurnos::Subasta,
            permitir_intercambio: false,
            prima_max_bps: 0,
            descuento_max_bps: 1_000,
            primeros_con_historial: 0,
            puntaje_primeros: 0,
            ofertas_selladas: false,
        };
        let eleccion = OpcionesTanda {
            modo: ModoTurnos::Eleccion,
            descuento_max_bps: 0,
            ..base.clone()
        };
        match self.azar.hasta(6) {
            // Subasta con intercambio.
            0 => OpcionesTanda {
                permitir_intercambio: true,
                ..base
            },
            // Ofertas selladas fuera de la subasta.
            1 => OpcionesTanda {
                ofertas_selladas: true,
                ..eleccion
            },
            // Historial para los primeros turnos donde el turno no se elige.
            2 => OpcionesTanda {
                primeros_con_historial: 1,
                puntaje_primeros: 100,
                ..base
            },
            // Todos los turnos (o más) piden historial: ninguno queda para cualquiera.
            3 => OpcionesTanda {
                primeros_con_historial: n + self.azar.entre(0, 2) as u32,
                puntaje_primeros: 100,
                ..eleccion
            },
            // Turnos con historial pero sin puntaje.
            4 => OpcionesTanda {
                primeros_con_historial: 1,
                ..eleccion
            },
            // Puntaje sin turnos.
            _ => OpcionesTanda {
                puntaje_primeros: 100,
                ..eleccion
            },
        }
    }

    fn crear(&mut self) {
        let creador = self.persona();
        let tok = self.token.address.clone();
        if self.azar.si(6) {
            // Parámetros inválidos: se rechazan y no se crea nada.
            let antes = self.tanda.total_tandas();
            let (cuota, n, periodo, pen) = match self.azar.hasta(6) {
                0 => (0, 3, 60, 0),
                1 => (100 * U, 2, 60, 0),
                2 => (100 * U, 13, 60, 0),
                3 => (100 * U, 3, 59, 0),
                4 => (100 * U, 3, 90 * DIA + 1, 0),
                _ => (100 * U, 3, 60, 5_001),
            };
            let r = self
                .tanda
                .try_crear_tanda(&creador, &tok, &cuota, &n, &periodo, &pen, &0);
            let r = self.res("crear_tanda", r);
            self.anotar(format!(
                "crear_tanda inválida ({cuota}, {n}, {periodo}, {pen}) -> {r:?}"
            ));
            self.segun("crear_tanda inválida", r, Some(Error::ParametroInvalido));
            // Opciones de turnos inválidas.
            let mala = self.opciones_invalidas(3);
            let r = self.tanda.try_crear_tanda_avanzada(
                &creador,
                &tok,
                &(100 * U),
                &3,
                &60,
                &0,
                &0,
                &mala,
            );
            let r = self.res("crear_tanda_avanzada", r);
            self.anotar(format!("crear_tanda_avanzada inválida ({mala:?}) -> {r:?}"));
            self.segun("opciones inválidas", r, Some(Error::OpcionesInvalidas));
            self.exigir(self.tanda.total_tandas() == antes, || {
                String::from("una tanda rechazada cambió el contador")
            });
            return;
        }

        let n_max = 12.min(self.gente.len() as u64 + 1); // a veces no alcanza la gente: se cancela
        let n = if self.azar.si(25) {
            n_max
        } else {
            self.azar.entre(3, n_max)
        } as u32;
        let cuota: i128 = match self.azar.hasta(4) {
            0 => U, // 1 TUSD: debajo de la cuota mínima del historial
            1 => 100 * U,
            2 => self.azar.entre(1, 500 * U as u64) as i128, // cualquier monto, centavos raros
            _ => 25 * U + 3,
        };
        let hay_rapida = self.bovedas.len() > 1;
        let periodo = if hay_rapida && self.azar.si(40) {
            self.azar.entre(60, 600)
        } else {
            match self.azar.hasta(5) {
                0 => 60,
                1 => self.azar.entre(61, DIA),
                2 => 7 * DIA,
                3 => 30 * DIA,
                _ => self.azar.entre(DIA, 90 * DIA),
            }
        };
        let pen = if self.azar.si(30) {
            0
        } else {
            self.azar.entre(0, 5_000) as u32
        };
        let cob = match self.azar.hasta(5) {
            0 => 0,
            1 => 5_000,
            2 | 3 => 10_000,
            _ => self.azar.entre(0, 10_000) as u32,
        };
        let opciones = if self.azar.si(35) {
            None
        } else {
            Some(self.opciones_al_azar(n))
        };
        // Los primeros turnos con historial necesitan el historial conectado.
        let esperado = opciones
            .as_ref()
            .filter(|o| o.primeros_con_historial > 0 && !self.hist_conectado)
            .map(|_| Error::HistorialNoConfigurado);
        let antes = self.tanda.total_tandas();
        let r = match &opciones {
            None => {
                let r = self
                    .tanda
                    .try_crear_tanda(&creador, &tok, &cuota, &n, &periodo, &pen, &cob);
                self.res("crear_tanda", r)
            }
            Some(o) => {
                let r = self
                    .tanda
                    .try_crear_tanda_avanzada(&creador, &tok, &cuota, &n, &periodo, &pen, &cob, o);
                self.res("crear_tanda_avanzada", r)
            }
        };
        let Some(id) = self.segun("crear_tanda", r, esperado) else {
            self.anotar(format!(
                "crear_tanda_avanzada sin historial conectado ({opciones:?}) -> {esperado:?}"
            ));
            self.exigir(self.tanda.total_tandas() == antes, || {
                String::from("una tanda rechazada cambió el contador")
            });
            return;
        };
        self.anotar(format!(
            "t{id} creada: n={n} cuota={cuota} periodo={periodo}s multa={pen} cobertura={cob} \
             opciones={opciones:?}"
        ));
        let t = self.tanda.get_tanda(&id);
        self.exigir(
            t.estado == Estado::Abierta && t.n_miembros == n && t.cuota == cuota,
            || format!("t{id}: la tanda nueva no quedó como se pidió: {t:?}"),
        );
        // Cada tanda guarda su bóveda: la rápida si las rondas son de hasta 10 minutos.
        let esperada = if hay_rapida && periodo <= 600 {
            self.bovedas[1].clone()
        } else {
            self.bovedas[0].clone()
        };
        self.exigir(self.tanda.get_boveda(&id) == esperada, || {
            format!("t{id}: bóveda equivocada")
        });

        if self.hist.is_some() && self.azar.si(50) {
            let minimo = [0u32, 0, 0, 40, 100, 300][self.azar.hasta(6)];
            let descuento = self.azar.si(70);
            let r = self
                .tanda
                .try_configurar_requisitos(&id, &minimo, &descuento);
            let r = self.res("configurar_requisitos", r);
            self.anotar(format!(
                "t{id} requisitos: mínimo {minimo}, descuento {descuento} -> {r:?}"
            ));
            let esperado = if !self.hist_conectado && (minimo > 0 || descuento) {
                Some(Error::HistorialNoConfigurado)
            } else {
                None
            };
            self.segun("configurar_requisitos", r, esperado);
        }
        self.tandas.push(TandaM {
            id,
            opciones,
            perfiles: StdVec::new(),
            terminada: false,
            sellos: StdVec::new(),
            sellos_ronda: 0,
            inicio_real: None,
            repartidos: StdVec::new(),
        });
    }

    fn perfil_al_azar(&mut self, n: u32) -> Perfil {
        match self.azar.hasta(20) {
            0..=8 => Perfil::Cumplido,
            9..=12 => Perfil::Distraido,
            13..=15 => Perfil::Irregular,
            _ => Perfil::Desaparece(self.azar.entre(0, n as u64 - 1) as u32),
        }
    }

    /// Alguien (casi siempre de fuera) intenta unirse a la tanda `k`.
    fn unirse(&mut self, k: usize) {
        let id = self.tandas[k].id;
        let dentro: StdVec<Address> = self.miembros(id).into_iter().map(|(d, _)| d).collect();
        let fuera: StdVec<Address> = self
            .gente
            .iter()
            .filter(|p| !dentro.contains(p))
            .cloned()
            .collect();
        let p = if !fuera.is_empty() && self.azar.si(90) {
            fuera[self.azar.hasta(fuera.len())].clone()
        } else {
            self.persona()
        };
        let n = self.tanda.get_tanda(&id).n_miembros;
        let elige = matches!(
            self.tandas[k].opciones.as_ref().map(|o| o.modo),
            Some(ModoTurnos::Eleccion) | Some(ModoTurnos::PrecioPorTurno)
        );
        let turno = if (elige && self.azar.si(70)) || (!elige && self.azar.si(4)) {
            Some(self.azar.entre(0, n as u64) as u32)
        } else {
            None
        };
        self.unirse_persona(k, &p, turno);
    }

    fn unirse_persona(&mut self, k: usize, p: &Address, turno: Option<u32>) {
        let id = self.tandas[k].id;
        let opciones = self.tandas[k].opciones.clone();
        let modo = opciones.as_ref().map(|o| o.modo);
        let primeros = opciones
            .as_ref()
            .map(|o| o.primeros_con_historial)
            .unwrap_or(0);
        let t = self.tanda.get_tanda(&id);
        let lista = self.miembros(id);
        let ocupados: StdVec<u32> = lista.iter().map(|(_, m)| m.posicion).collect();
        let req = self.tanda.get_requisitos(&id);
        let puntaje = self.puntaje(p);
        let elige = matches!(
            modo,
            Some(ModoTurnos::Eleccion) | Some(ModoTurnos::PrecioPorTurno)
        );
        // Un turno que pide historial se revisa antes que todo lo demás (`unirse_en_turno`).
        let protegido = match (&opciones, turno) {
            (Some(o), Some(x)) => self.error_turno_protegido(o, p, x),
            _ => None,
        };
        let esperado = if protegido.is_some() {
            protegido
        } else if t.estado == Estado::Cancelada {
            Some(Error::EstadoInvalido)
        } else if t.estado != Estado::Abierta {
            Some(Error::TandaLlena)
        } else if lista.iter().any(|(d, _)| d == p) {
            Some(Error::YaEsMiembro)
        } else if self.bloqueado_por_deuda(p) {
            Some(Error::DeudaPendiente)
        } else if req.puntaje_minimo > 0 && !self.hist_conectado {
            Some(Error::HistorialNoConfigurado)
        } else if req.puntaje_minimo > 0 && puntaje < req.puntaje_minimo {
            Some(Error::PuntajeInsuficiente)
        } else {
            match (elige, turno) {
                (true, Some(x)) if x >= t.n_miembros => Some(Error::TurnoInvalido),
                (true, Some(x)) if ocupados.contains(&x) => Some(Error::TurnoOcupado),
                (false, Some(_)) => Some(Error::ModoNoPermite),
                // Sin elegir solo se da un turno que no pide historial.
                (true, None) if (primeros..t.n_miembros).all(|x| ocupados.contains(&x)) => {
                    Some(Error::TurnoExigeHistorial)
                }
                _ => None,
            }
        };

        // Turno y garantía que le corresponden (antes del sorteo, si lo hay).
        let pos = match modo {
            None | Some(ModoTurnos::Llegada) => lista.len() as u32,
            Some(ModoTurnos::Eleccion) | Some(ModoTurnos::PrecioPorTurno) => {
                turno.unwrap_or_else(|| {
                    (primeros..t.n_miembros)
                        .find(|x| !ocupados.contains(x))
                        .unwrap_or(0)
                })
            }
            _ => SIN_TURNO,
        };
        if esperado.is_none() && pos < primeros {
            self.contar("· unirse en un turno que pide historial");
        }
        let colateral = if esperado.is_none() {
            let base = if pos == SIN_TURNO {
                garantia_turno(&t, t.n_miembros - 1)
            } else {
                garantia_turno(&t, pos)
            };
            let bps = match self.historial() {
                Some(h) if req.descuento && self.hist_conectado => {
                    (h.beneficio_colateral_bps(p) as i128).min(BPS)
                }
                _ => 0,
            };
            let c = (base - base * bps / BPS).max(t.cuota.min(base));
            // Lo que la web muestra antes de firmar debe ser lo que se cobra.
            let mostrado = match turno {
                None => self.tanda.colateral_para_miembro(&id, p),
                Some(x) => self.tanda.cotizar_turno(&id, p, &x).0,
            };
            self.exigir(mostrado == c, || {
                format!("t{id}: la web mostraría una garantía de {mostrado} y se cobran {c}")
            });
            c
        } else {
            0
        };

        let s0 = self.saldo(p);
        let r = match turno {
            None => self.tanda.try_unirse(&id, p),
            Some(x) => self.tanda.try_unirse_en_turno(&id, p, &x),
        };
        let r = self.res("unirse", r);
        self.anotar(format!(
            "t{id} unirse({}, turno {turno:?}) -> {r:?}",
            self.nombre(p)
        ));
        if self.segun("unirse", r, esperado).is_none() {
            return;
        }
        let m = self.miembro(id, p).unwrap();
        let lleno = lista.len() as u32 + 1 == t.n_miembros;
        self.exigir(self.saldo(p) == s0 - colateral, || {
            format!(
                "t{id}: unirse cobró {} y debía cobrar {colateral}",
                s0 - self.saldo(p)
            )
        });
        self.exigir(
            m.colateral == colateral && m.colateral_inicial == colateral,
            || format!("t{id}: garantía anotada {m:?}, esperada {colateral}"),
        );
        if !(lleno && modo == Some(ModoTurnos::Sorteo)) {
            self.exigir(m.posicion == pos, || {
                format!("t{id}: turno {} y debía ser {pos}", m.posicion)
            });
        }
        let t1 = self.tanda.get_tanda(&id);
        if lleno {
            self.exigir(
                t1.estado == Estado::Activa
                    && t1.ronda_actual == 0
                    && t1.inicio_ronda == self.ahora(),
                || format!("t{id}: se llenó y no arrancó bien: {t1:?}"),
            );
        }
        let perfil = self.perfil_al_azar(t.n_miembros);
        self.tandas[k].perfiles.push((p.clone(), perfil));
    }

    /// Junta gente hasta llenar la tanda `k`; si no alcanza (requisitos, poca gente), la cancela.
    /// Si solo quedan turnos que piden historial, los elige alguien que lo tenga.
    fn llenar(&mut self, k: usize) {
        let id = self.tandas[k].id;
        let opciones = self.tandas[k].opciones.clone();
        let mut intentos = 0;
        while self.tanda.get_tanda(&id).estado == Estado::Abierta && intentos < 40 {
            intentos += 1;
            let t = self.tanda.get_tanda(&id);
            let lista = self.miembros(id);
            let dentro: StdVec<Address> = lista.iter().map(|(d, _)| d.clone()).collect();
            let ocupados: StdVec<u32> = lista.iter().map(|(_, m)| m.posicion).collect();
            let protegido = opciones.as_ref().and_then(|o| {
                (o.primeros_con_historial..t.n_miembros)
                    .all(|x| ocupados.contains(&x))
                    .then(|| {
                        let libre = (0..o.primeros_con_historial).find(|x| !ocupados.contains(x));
                        (libre.unwrap(), o.puntaje_primeros)
                    })
            });
            let req = self.tanda.get_requisitos(&id);
            let fuera: StdVec<Address> = self
                .gente
                .iter()
                .filter(|p| !dentro.contains(p))
                .filter(|p| !self.bloqueado_por_deuda(p))
                .filter(|p| {
                    req.puntaje_minimo == 0
                        || (self.hist_conectado && self.puntaje(p) >= req.puntaje_minimo)
                })
                .filter(|p| match protegido {
                    None => true,
                    Some((_, minimo)) => self.hist_conectado && self.puntaje(p) >= minimo,
                })
                .cloned()
                .collect();
            if fuera.is_empty() {
                break;
            }
            let p = fuera[self.azar.hasta(fuera.len())].clone();
            self.unirse_persona(k, &p, protegido.map(|(x, _)| x));
            self.revisar();
        }
        if self.tanda.get_tanda(&id).estado == Estado::Abierta {
            self.cancelar(k);
        }
    }

    fn cancelar(&mut self, k: usize) {
        let id = self.tandas[k].id;
        let t0 = self.tanda.get_tanda(&id);
        let lista = self.miembros(id);
        let valor = if t0.shares_boveda > 0 {
            self.boveda(id).valor(&t0.shares_boveda)
        } else {
            0
        };
        let tol = self.tolerancia(id);
        let s0 = self.saldos();
        let r = self.tanda.try_cancelar(&id);
        let r = self.res("cancelar", r);
        self.anotar(format!("t{id} cancelar -> {r:?}"));
        let esperado = (t0.estado != Estado::Abierta).then_some(Error::EstadoInvalido);
        if self.segun("cancelar", r, esperado).is_none() {
            return;
        }
        let s1 = self.saldos();
        let mut suma = 0;
        for (dir, m) in &lista {
            let i = self.idx(dir);
            let recibio = s1[i] - s0[i];
            suma += recibio;
            self.exigir(recibio >= m.colateral - tol, || {
                format!(
                    "t{id}: al cancelar {} recibió {recibio} y había dejado {}",
                    self.nombre(dir),
                    m.colateral
                )
            });
        }
        self.exigir(suma == valor, || {
            format!("t{id}: al cancelar se repartió {suma} y la bóveda devolvió {valor}")
        });
        self.revisar_terminada(id, Estado::Cancelada);
        self.tandas[k].terminada = true;
    }

    // -----------------------------------------------------------------------
    // Pagar cuotas y deudas
    // -----------------------------------------------------------------------

    /// Un miembro (o, a veces, alguien de fuera) intenta pagar según su perfil.
    fn pagar(&mut self, k: usize) {
        let id = self.tandas[k].id;
        let ronda = self.tanda.get_tanda(&id).ronda_actual;
        let (p, perfil) = if self.tandas[k].perfiles.is_empty() || self.azar.si(4) {
            (self.persona(), None)
        } else {
            let i = self.azar.hasta(self.tandas[k].perfiles.len());
            let (p, f) = self.tandas[k].perfiles[i].clone();
            (p, Some(f))
        };
        let intenta = match perfil {
            None | Some(Perfil::Cumplido) => true,
            Some(Perfil::Distraido) => self.azar.si(50),
            Some(Perfil::Irregular) => self.azar.si(35),
            Some(Perfil::Desaparece(r)) => ronda < r || self.azar.si(3),
        };
        if intenta {
            self.pagar_cuota(k, &p);
        }
    }

    fn pagar_cuota(&mut self, k: usize, p: &Address) {
        let id = self.tandas[k].id;
        let t = self.tanda.get_tanda(&id);
        let m0 = self.miembro(id, p);
        let (_, _, pagaron) = self.tanda.get_ronda(&id);
        let ahora = self.ahora();
        let esperado = if t.estado != Estado::Activa {
            Some(Error::EstadoInvalido)
        } else {
            match &m0 {
                None => Some(Error::NoEsMiembro),
                Some(m) if m.moroso => Some(Error::MiembroMoroso),
                _ if pagaron.contains(p) => Some(Error::YaPago),
                _ => None,
            }
        };
        let s0 = self.saldo(p);
        let r = self.tanda.try_pagar_cuota(&id, p);
        let r = self.res("pagar_cuota", r);
        self.anotar(format!(
            "t{id} r{} pagar_cuota({}) -> {r:?}",
            t.ronda_actual,
            self.nombre(p)
        ));
        if self.segun("pagar_cuota", r, esperado).is_none() {
            return;
        }
        let m0 = m0.unwrap();
        let m1 = self.miembro(id, p).unwrap();
        let tarde = ahora > t.inicio_ronda + t.periodo_seg;
        let multa = t.cuota * t.penalidad_bps as i128 / BPS;
        self.exigir(self.saldo(p) == s0 - t.cuota, || {
            format!("t{id}: pagar la cuota no cobró exactamente la cuota")
        });
        self.exigir(
            m1.atrasos == m0.atrasos + tarde as u32
                && m1.multas_pendientes == m0.multas_pendientes + if tarde { multa } else { 0 },
            || format!("t{id}: pago (tarde = {tarde}) mal anotado: {m0:?} -> {m1:?}"),
        );
    }

    /// Alguien paga (toda o una parte de) la deuda de alguien, con montos válidos e inválidos.
    fn pagar_deuda_al_azar(&mut self, k: usize) {
        let id = self.tandas[k].id;
        let lista = self.miembros(id);
        if lista.is_empty() {
            return;
        }
        let morosos: StdVec<Address> = lista
            .iter()
            .filter(|(_, m)| m.deuda > 0)
            .map(|(d, _)| d.clone())
            .collect();
        let deudor = if morosos.is_empty() || self.azar.si(5) {
            lista[self.azar.hasta(lista.len())].0.clone()
        } else {
            morosos[self.azar.hasta(morosos.len())].clone()
        };
        let pagador = if self.azar.si(60) {
            deudor.clone()
        } else {
            self.persona()
        };
        let deuda = self.miembro(id, &deudor).map(|m| m.deuda).unwrap_or(0);
        let monto = match self.azar.hasta(20) {
            0 => 0,
            1 => -5,
            2 => deuda + self.azar.entre(1, 1_000) as i128,
            3..=10 => deuda,
            _ if deuda > 1 => self.azar.entre(1, deuda as u64 - 1) as i128,
            _ => deuda.max(1),
        };
        self.pagar_deuda(k, &deudor, &pagador, monto);
    }

    fn pagar_deuda(&mut self, k: usize, deudor: &Address, pagador: &Address, monto: i128) {
        let id = self.tandas[k].id;
        let t0 = self.tanda.get_tanda(&id);
        let lista = self.miembros(id);
        let m0 = lista
            .iter()
            .find(|(d, _)| d == deudor)
            .map(|(_, m)| m.clone());
        let esperado = if monto <= 0 {
            Some(Error::MontoInvalido)
        } else if !matches!(
            t0.estado,
            Estado::Activa | Estado::PorLiquidar | Estado::Finalizada
        ) {
            Some(Error::EstadoInvalido)
        } else {
            match &m0 {
                None => Some(Error::NoEsMiembro),
                Some(m) if m.deuda <= 0 => Some(Error::SinDeuda),
                Some(m) if monto > m.deuda => Some(Error::PagoExcesivo),
                _ => None,
            }
        };

        // Lo que DEBE pasar (reglas de `deudas.rs`): del faltante más viejo al más nuevo, a quien
        // cobró de menos (o a su bolsa retenida); si salda y tenía la bolsa retenida, la recupera
        // menos sus multas y menos la garantía que le falte para las cuotas que quedan.
        let mut delta = std::vec![0i128; self.gente.len()];
        let mut garantia = 0;
        let mut recupera = false;
        let finalizada = t0.estado == Estado::Finalizada;
        if esperado.is_none() && finalizada {
            // M1 v4: directo de quien paga a quien cobró de menos; si su bolsa se retuvo y se repartió
            // al finalizar, en partes iguales a quienes la recibieron (el resto, al último).
            let m0 = m0.as_ref().unwrap();
            let d0 = self.tanda.get_deuda(&id, deudor);
            let reparto = self.tandas[k].repartidos.clone();
            delta[self.idx(pagador)] -= monto;
            let mut resto = monto;
            let mut al_reparto = 0;
            for f in d0.faltantes.iter() {
                if resto == 0 {
                    break;
                }
                let abono = resto.min(f.monto);
                resto -= abono;
                let cobro = if f.acreedor == *deudor {
                    m0.cobro
                } else {
                    lista
                        .iter()
                        .find(|(d, _)| *d == f.acreedor)
                        .map(|(_, m)| m.cobro)
                        .unwrap_or(true)
                };
                if cobro || reparto.is_empty() {
                    delta[self.idx(&f.acreedor)] += abono;
                } else {
                    al_reparto += abono;
                }
            }
            if al_reparto > 0 {
                let n = reparto.len() as i128;
                let parte = al_reparto / n;
                for (j, dir) in reparto.iter().enumerate() {
                    let extra = if j as i128 == n - 1 {
                        al_reparto - parte * n
                    } else {
                        0
                    };
                    delta[self.idx(dir)] += parte + extra;
                }
                self.contar("· pagar tras finalizar: a quienes recibieron el reparto");
            }
            self.contar("· pagar deuda tras finalizar");
        } else if esperado.is_none() {
            let m0 = m0.as_ref().unwrap();
            let d0 = self.tanda.get_deuda(&id, deudor);
            delta[self.idx(pagador)] -= monto;
            let mut resto = monto;
            let mut bolsa = d0.bolsa_retenida;
            for f in d0.faltantes.iter() {
                if resto == 0 {
                    break;
                }
                let abono = resto.min(f.monto);
                resto -= abono;
                if f.acreedor == *deudor && !m0.cobro {
                    bolsa += abono;
                } else {
                    let cobro = lista
                        .iter()
                        .find(|(d, _)| *d == f.acreedor)
                        .map(|(_, m)| m.cobro)
                        .unwrap_or(true);
                    if cobro {
                        delta[self.idx(&f.acreedor)] += abono;
                    }
                }
            }
            if m0.deuda == monto && bolsa > 0 {
                recupera = true;
                let multas = m0.multas_pendientes.min(bolsa);
                let restantes = if t0.estado == Estado::Activa {
                    t0.n_miembros - t0.ronda_actual
                } else {
                    0
                };
                garantia =
                    (garantia_restantes(&t0, restantes) - m0.colateral).clamp(0, bolsa - multas);
                delta[self.idx(deudor)] += bolsa - multas - garantia;
            }
        }

        let s0 = self.saldos();
        let c0 = self.saldo(&self.yo);
        let r = self.tanda.try_pagar_deuda(&id, deudor, pagador, &monto);
        let r = self.res("pagar_deuda", r);
        self.anotar(format!(
            "t{id} pagar_deuda(de {}, paga {}, {monto}) -> {r:?}",
            self.nombre(deudor),
            self.nombre(pagador)
        ));
        let Some(queda) = self.segun("pagar_deuda", r, esperado) else {
            return;
        };
        let m0 = m0.unwrap();
        let m1 = self.miembro(id, deudor).unwrap();
        let s1 = self.saldos();
        for i in 0..self.gente.len() {
            self.exigir(s1[i] - s0[i] == delta[i], || {
                format!(
                    "t{id}: pagar_deuda movió {} a p{i} y debía mover {}",
                    s1[i] - s0[i],
                    delta[i]
                )
            });
        }
        self.exigir(
            queda == m0.deuda - monto && m1.deuda == queda && m1.moroso == (queda > 0),
            || format!("t{id}: deuda mal actualizada: {m0:?} -> {m1:?} (queda {queda})"),
        );
        if finalizada {
            let d1 = self.tanda.get_deuda(&id, deudor);
            let suma: i128 = d1.faltantes.iter().map(|f| f.monto).sum();
            self.exigir(
                self.saldo(&self.yo) == c0 && suma == m1.deuda && m1.cobro == m0.cobro,
                || {
                    format!(
                        "t{id}: pagar tras finalizar tocó el contrato o la deuda: {m1:?} {d1:?}"
                    )
                },
            );
            if queda == 0 {
                self.contar("· saldó su deuda tras finalizar");
            }
        }
        if recupera {
            self.contar("· saldó su deuda y recuperó su bolsa retenida");
            let d1 = self.tanda.get_deuda(&id, deudor);
            self.exigir(
                m1.cobro && d1.bolsa_retenida == 0 && m1.colateral == m0.colateral + garantia,
                || format!("t{id}: al saldar no recuperó bien su bolsa: {m1:?}, {d1:?}"),
            );
        }
    }

    // -----------------------------------------------------------------------
    // Turnos: ofertas e intercambios (M3)
    // -----------------------------------------------------------------------

    fn turnos_al_azar(&mut self, k: usize) {
        let Some(o) = self.tandas[k].opciones.clone() else {
            // Sin opciones de turnos: nada de esto se permite.
            let id = self.tandas[k].id;
            let (a, b) = (self.persona(), self.persona());
            let r = self.tanda.try_ofertar(&id, &a, &100);
            let r = self.res("ofertar", r);
            self.segun("ofertar sin subasta", r, Some(Error::ModoNoPermite));
            let r = self.tanda.try_proponer_intercambio(&id, &a, &b, &0);
            let r = self.res("proponer_intercambio", r);
            self.segun("intercambio sin opciones", r, Some(Error::ModoNoPermite));
            return;
        };
        if o.modo == ModoTurnos::Subasta && o.ofertas_selladas && self.azar.si(80) {
            match self.azar.hasta(20) {
                0..=6 => self.sellar(k),
                7..=13 => self.revelar(k),
                14..=18 => self.ronda_sellada(k),
                _ => self.ofertar(k), // la oferta abierta no aplica: ModoNoPermite
            }
        } else if o.modo == ModoTurnos::Subasta && self.azar.si(70) {
            if self.azar.si(8) {
                self.sellar(k); // sellar en una subasta abierta: ModoNoPermite
            } else {
                self.ofertar(k);
            }
        } else if self.propuestas(self.tandas[k].id).is_empty() {
            match self.azar.hasta(10) {
                0..=7 => self.proponer(k),
                8 => self.aceptar(k),
                _ => self.cancelar_propuesta(k),
            }
        } else {
            match self.azar.hasta(10) {
                0..=2 => self.proponer(k),
                3..=6 => self.aceptar(k),
                _ => self.cancelar_propuesta(k),
            }
        }
    }

    fn ofertar(&mut self, k: usize) {
        let id = self.tandas[k].id;
        let o = self.tandas[k].opciones.clone().unwrap();
        let t = self.tanda.get_tanda(&id);
        let lista = self.miembros(id);
        let sin_turno: StdVec<Address> = lista
            .iter()
            .filter(|(_, m)| m.posicion == SIN_TURNO)
            .map(|(d, _)| d.clone())
            .collect();
        let p = if !sin_turno.is_empty() && self.azar.si(85) {
            sin_turno[self.azar.hasta(sin_turno.len())].clone()
        } else {
            self.persona()
        };
        let mejor = self.tanda.get_estado_turnos(&id).mejor_oferta_bps;
        let d = if mejor < o.descuento_max_bps && self.azar.si(75) {
            self.azar
                .entre(mejor as u64 + 1, o.descuento_max_bps as u64) as u32
        } else {
            self.azar.entre(1, o.descuento_max_bps as u64 + 50) as u32
        };
        let esperado = match self.error_subasta(k, &p, false) {
            Some(e) => Some(e),
            None if d <= mejor || d > o.descuento_max_bps => Some(Error::OfertaInvalida),
            None => None,
        };
        let r = self.tanda.try_ofertar(&id, &p, &d);
        let r = self.res("ofertar", r);
        self.anotar(format!(
            "t{id} r{} ofertar({}, {d} bps) -> {r:?}",
            t.ronda_actual,
            self.nombre(&p)
        ));
        if self.segun("ofertar", r, esperado).is_some() {
            let et = self.tanda.get_estado_turnos(&id);
            self.exigir(
                et.mejor_oferta_bps == d && et.mejor_postor == Some(p.clone()),
                || format!("t{id}: la oferta no quedó como la mejor"),
            );
        }
    }

    /// Los errores de una jugada de subasta de `p`, en el orden del contrato: el modo (abierta o
    /// sellada, según `sellada`), el estado, si hay subasta en esta ronda y si `p` puede jugar.
    fn error_subasta(&self, k: usize, p: &Address, sellada: bool) -> Option<Error> {
        let id = self.tandas[k].id;
        let t = self.tanda.get_tanda(&id);
        let es_la_subasta = self.tandas[k]
            .opciones
            .as_ref()
            .map(|o| o.modo == ModoTurnos::Subasta && o.ofertas_selladas == sellada)
            .unwrap_or(false);
        if !es_la_subasta {
            Some(Error::ModoNoPermite)
        } else if t.estado != Estado::Activa {
            Some(Error::EstadoInvalido)
        } else if t.ronda_actual + 1 >= t.n_miembros
            || self.ahora() > t.inicio_ronda + t.periodo_seg
        {
            Some(Error::SinSubasta)
        } else {
            match self.miembro(id, p) {
                None => Some(Error::NoEsMiembro),
                Some(m) if m.posicion != SIN_TURNO || m.moroso => Some(Error::NoPuedeOfertar),
                _ => None,
            }
        }
    }

    /// Subasta sellada, primera mitad: alguien sella su oferta (a veces copia el sello de otro, o
    /// sella un monto que no vale y que solo se nota al revelar).
    fn sellar(&mut self, k: usize) {
        let id = self.tandas[k].id;
        let max = self.tandas[k]
            .opciones
            .as_ref()
            .map(|o| o.descuento_max_bps)
            .unwrap_or(0);
        let t = self.tanda.get_tanda(&id);
        let sin_turno: StdVec<Address> = self
            .miembros(id)
            .into_iter()
            .filter(|(_, m)| m.posicion == SIN_TURNO)
            .map(|(d, _)| d)
            .collect();
        let p = if !sin_turno.is_empty() && self.azar.si(85) {
            sin_turno[self.azar.hasta(sin_turno.len())].clone()
        } else {
            self.persona()
        };
        let sellos = self.sellos_de(k, t.ronda_actual);
        // Copiar el sello de otra persona (anticopia: SelloRepetido).
        let de_otros: StdVec<_> = sellos.iter().filter(|(q, _, _)| *q != p).cloned().collect();
        let copia = if !de_otros.is_empty() && self.azar.si(15) {
            Some(de_otros[self.azar.hasta(de_otros.len())].clone())
        } else {
            None
        };
        let (d, sal) = match &copia {
            Some((_, d, sal)) => (*d, *sal),
            None => {
                let d = match self.azar.hasta(20) {
                    0 => 0,
                    1 => max + self.azar.entre(1, 50) as u32,
                    // El mismo monto que otro, con otra sal: no es copia, es un empate.
                    2..=6 if !sellos.is_empty() => sellos[self.azar.hasta(sellos.len())].1,
                    _ => self.azar.entre(1, max.max(1) as u64) as u32,
                };
                (d, self.sal_al_azar())
            }
        };
        let de_otro = copia.is_some();
        let esperado = match self.error_subasta(k, &p, true) {
            Some(e) => Some(e),
            None if self.ahora() >= self.mitad(k, &t) => Some(Error::FaseEquivocada),
            None if de_otro => Some(Error::SelloRepetido),
            None => None,
        };
        let sello = self.sello(d, &sal);
        let r = self.tanda.try_ofertar_sellada(&id, &p, &sello);
        let r = self.res("ofertar_sellada", r);
        self.anotar(format!(
            "t{id} r{} ofertar_sellada({}, {d} bps{}) -> {r:?}",
            t.ronda_actual,
            self.nombre(&p),
            if de_otro { ", sello copiado" } else { "" }
        ));
        if self.segun("ofertar_sellada", r, esperado).is_none() {
            return;
        }
        let tm = &mut self.tandas[k];
        if tm.sellos_ronda != t.ronda_actual {
            tm.sellos.clear();
            tm.sellos_ronda = t.ronda_actual;
        }
        tm.sellos.retain(|(q, _, _)| *q != p);
        tm.sellos.push((p.clone(), d, sal));
        self.exigir(
            self.tanda.get_estado_turnos(&id).sellos.contains(&p),
            || format!("t{id}: el sello de {} no quedó guardado", self.nombre(&p)),
        );
    }

    /// Una ronda de subasta sellada de principio a fin: sellan varios (a veces copiando o empatando),
    /// el reloj pasa a la segunda mitad y revelan (a veces mal). Después, `cerrar` revisa que cobre
    /// la mayor oferta revelada.
    fn ronda_sellada(&mut self, k: usize) {
        for _ in 0..self.azar.entre(1, 5) {
            self.sellar(k);
            self.revisar();
        }
        let t = self.tanda.get_tanda(&self.tandas[k].id);
        let mitad = self.mitad(k, &t);
        if t.estado == Estado::Activa && self.ahora() < mitad {
            let vence = t.inicio_ronda + t.periodo_seg;
            let seg = mitad - self.ahora() + self.azar.entre(0, (vence - mitad) / 2);
            self.avanzar(seg);
        }
        for _ in 0..self.azar.entre(1, 6) {
            self.revelar(k);
            self.revisar();
        }
    }

    /// Subasta sellada, segunda mitad: alguien revela (a veces con la sal o el monto equivocados,
    /// o sin haber sellado). A veces el reloj se adelanta hasta esta mitad para jugarla.
    fn revelar(&mut self, k: usize) {
        let id = self.tandas[k].id;
        let max = self.tandas[k]
            .opciones
            .as_ref()
            .map(|o| o.descuento_max_bps)
            .unwrap_or(0);
        let t = self.tanda.get_tanda(&id);
        let mitad = self.mitad(k, &t);
        if t.estado == Estado::Activa && self.ahora() < mitad && self.azar.si(50) {
            let vence = t.inicio_ronda + t.periodo_seg;
            let hasta = mitad + self.azar.entre(0, (vence - mitad) / 2);
            let seg = hasta - self.ahora();
            self.avanzar(seg);
        }
        let sellos = self.sellos_de(k, t.ronda_actual);
        let (p, d, sal) = if !sellos.is_empty() && self.azar.si(85) {
            let (p, d, sal) = sellos[self.azar.hasta(sellos.len())].clone();
            match self.azar.hasta(20) {
                0 => (p, d, self.sal_al_azar()),  // otra sal
                1 => (p, d.wrapping_add(1), sal), // otro monto
                _ => (p, d, sal),
            }
        } else {
            let lista = self.miembros(id);
            let p = if !lista.is_empty() && self.azar.si(80) {
                lista[self.azar.hasta(lista.len())].0.clone()
            } else {
                self.persona()
            };
            (p, self.azar.entre(1, 100) as u32, self.sal_al_azar())
        };
        let coincide = sellos
            .iter()
            .any(|(q, d0, s0)| *q == p && *d0 == d && *s0 == sal);
        let esperado = match self.error_subasta(k, &p, true) {
            Some(e) => Some(e),
            None if self.ahora() < mitad => Some(Error::FaseEquivocada),
            None if !coincide => Some(Error::SelloInvalido),
            None if d == 0 || d > max => Some(Error::OfertaInvalida),
            None => None,
        };
        let et0 = self.tanda.get_estado_turnos(&id);
        let r = self
            .tanda
            .try_revelar_oferta(&id, &p, &d, &BytesN::from_array(&self.env, &sal));
        let r = self.res("revelar_oferta", r);
        self.anotar(format!(
            "t{id} r{} revelar_oferta({}, {d} bps) -> {r:?}",
            t.ronda_actual,
            self.nombre(&p)
        ));
        if self.segun("revelar_oferta", r, esperado).is_none() {
            return;
        }
        // Revelada: el sello ya no sirve. Gana si supera la mejor, o si la empata y va antes en el
        // orden de respaldo (así nadie tiene que apurarse a revelar).
        self.tandas[k].sellos.retain(|(q, _, _)| *q != p);
        let gana = match &et0.mejor_postor {
            None => true,
            Some(q) => {
                if d == et0.mejor_oferta_bps {
                    self.contar("· revelación empatada: decide el orden de respaldo");
                }
                d > et0.mejor_oferta_bps
                    || (d == et0.mejor_oferta_bps && antes_en_respaldo(&et0.respaldo, &p, q))
            }
        };
        let (postor, bps) = if gana {
            (Some(p.clone()), d)
        } else {
            (et0.mejor_postor.clone(), et0.mejor_oferta_bps)
        };
        let et1 = self.tanda.get_estado_turnos(&id);
        self.exigir(
            et1.mejor_postor == postor && et1.mejor_oferta_bps == bps && !et1.sellos.contains(&p),
            || {
                format!(
                    "t{id}: al revelar {d} bps de {}, la mejor oferta quedó {:?} ({} bps) y \
                     debía quedar {postor:?} ({bps} bps)",
                    self.nombre(&p),
                    et1.mejor_postor,
                    et1.mejor_oferta_bps
                )
            },
        );
    }

    fn proponer(&mut self, k: usize) {
        let id = self.tandas[k].id;
        let o = self.tandas[k].opciones.clone().unwrap();
        let t = self.tanda.get_tanda(&id);
        let lista = self.miembros(id);
        let elegir = |m: &mut Mundo| -> Address {
            if !lista.is_empty() && m.azar.si(92) {
                lista[m.azar.hasta(lista.len())].0.clone()
            } else {
                m.persona()
            }
        };
        let validos: StdVec<Address> = lista
            .iter()
            .filter(|(_, m)| intercambiable(m, t.ronda_actual))
            .map(|(d, _)| d.clone())
            .collect();
        // Con turnos que piden historial, a menudo se cruza uno de esos con uno que no.
        let (protegidos, libres): (StdVec<Address>, StdVec<Address>) =
            validos.iter().cloned().partition(|d| {
                lista
                    .iter()
                    .any(|(x, m)| x == d && m.posicion < o.primeros_con_historial)
            });
        let (de, con) = if !protegidos.is_empty() && !libres.is_empty() && self.azar.si(60) {
            let a = protegidos[self.azar.hasta(protegidos.len())].clone();
            let b = libres[self.azar.hasta(libres.len())].clone();
            if self.azar.si(50) {
                (a, b)
            } else {
                (b, a)
            }
        } else if validos.len() >= 2 && self.azar.si(75) {
            let i = self.azar.hasta(validos.len());
            let j = (i + 1 + self.azar.hasta(validos.len() - 1)) % validos.len();
            (validos[i].clone(), validos[j].clone())
        } else {
            (elegir(self), elegir(self))
        };
        let comp: i128 = match self.azar.hasta(10) {
            0..=3 => 0,
            4..=6 => self.azar.entre(1, t.cuota as u64) as i128,
            _ => -(self.azar.entre(1, t.cuota as u64) as i128),
        };
        let a = lista.iter().find(|(x, _)| *x == de).map(|(_, m)| m.clone());
        let b = lista
            .iter()
            .find(|(x, _)| *x == con)
            .map(|(_, m)| m.clone());
        let props = self.propuestas(id);
        let esperado = if !o.permitir_intercambio {
            Some(Error::ModoNoPermite)
        } else if t.estado != Estado::Activa {
            Some(Error::EstadoInvalido)
        } else {
            match (&a, &b) {
                (None, _) | (_, None) => Some(Error::NoEsMiembro),
                (Some(a), Some(b))
                    if de == con
                        || !intercambiable(a, t.ronda_actual)
                        || !intercambiable(b, t.ronda_actual) =>
                {
                    Some(Error::IntercambioInvalido)
                }
                // Nadie llega por un intercambio a un turno que pide más historial del que tiene.
                (Some(a), Some(b)) => self
                    .error_intercambio_protegido(&o, &de, a, &con, b)
                    .or_else(|| {
                        props
                            .iter()
                            .any(|p| p.de == de)
                            .then_some(Error::PropuestaExistente)
                    }),
            }
        };
        let s0 = self.saldo(&de);
        let r = self.tanda.try_proponer_intercambio(&id, &de, &con, &comp);
        let r = self.res("proponer_intercambio", r);
        self.anotar(format!(
            "t{id} r{} proponer_intercambio({} -> {}, {comp}) -> {r:?}",
            t.ronda_actual,
            self.nombre(&de),
            self.nombre(&con)
        ));
        if self.segun("proponer_intercambio", r, esperado).is_some() {
            self.exigir(self.saldo(&de) == s0 - comp.max(0), || {
                format!("t{id}: proponer no guardó la compensación exacta")
            });
        }
    }

    fn aceptar(&mut self, k: usize) {
        let id = self.tandas[k].id;
        let t = self.tanda.get_tanda(&id);
        let props = self.propuestas(id);
        let (de, con) = if !props.is_empty() && self.azar.si(80) {
            let p = props[self.azar.hasta(props.len())].clone();
            (p.de, p.con)
        } else {
            (self.persona(), self.persona())
        };
        let prop = props.iter().find(|p| p.de == de && p.con == con).cloned();
        let a = self.miembro(id, &de);
        let b = self.miembro(id, &con);
        let esperado = if t.estado != Estado::Activa {
            Some(Error::EstadoInvalido)
        } else {
            match (&prop, &a, &b) {
                (None, _, _) => Some(Error::SinPropuesta),
                (_, Some(a), Some(b))
                    if !intercambiable(a, t.ronda_actual) || !intercambiable(b, t.ronda_actual) =>
                {
                    Some(Error::IntercambioInvalido)
                }
                // Se revisa otra vez al aceptar: el puntaje o el historial pudieron cambiar.
                (_, Some(a), Some(b)) => self.tandas[k]
                    .opciones
                    .as_ref()
                    .and_then(|o| self.error_intercambio_protegido(o, &de, a, &con, b)),
                _ => None,
            }
        };
        let (s_de, s_con) = (self.saldo(&de), self.saldo(&con));
        let r = self.tanda.try_aceptar_intercambio(&id, &con, &de);
        let r = self.res("aceptar_intercambio", r);
        self.anotar(format!(
            "t{id} r{} aceptar_intercambio({} acepta a {}) -> {r:?}",
            t.ronda_actual,
            self.nombre(&con),
            self.nombre(&de)
        ));
        if self.segun("aceptar_intercambio", r, esperado).is_none() {
            return;
        }
        let comp = prop.unwrap().compensacion;
        let (a0, b0) = (a.unwrap(), b.unwrap());
        let (a1, b1) = (
            self.miembro(id, &de).unwrap(),
            self.miembro(id, &con).unwrap(),
        );
        self.exigir(
            a1.posicion == b0.posicion && b1.posicion == a0.posicion,
            || format!("t{id}: el intercambio no cambió los turnos"),
        );
        let primeros = self.tandas[k]
            .opciones
            .as_ref()
            .map(|o| o.primeros_con_historial)
            .unwrap_or(0);
        if a0.posicion < primeros || b0.posicion < primeros {
            self.contar("· intercambio aceptado con un turno que pide historial");
        }
        // comp > 0: ya la había dejado `de`; la recibe `con`. comp < 0: `con` le paga a `de`.
        self.exigir(
            self.saldo(&de) - s_de == (-comp).max(0) && self.saldo(&con) - s_con == comp,
            || format!("t{id}: la compensación {comp} no se movió bien"),
        );
    }

    fn cancelar_propuesta(&mut self, k: usize) {
        let id = self.tandas[k].id;
        let props = self.propuestas(id);
        let (de, quien) = if !props.is_empty() && self.azar.si(85) {
            let p = props[self.azar.hasta(props.len())].clone();
            let quien = match self.azar.hasta(3) {
                0 => p.de.clone(),
                1 => p.con.clone(),
                _ => self.persona(),
            };
            (p.de, quien)
        } else {
            (self.persona(), self.persona())
        };
        let prop = props.iter().find(|p| p.de == de).cloned();
        let esperado = match &prop {
            None => Some(Error::SinPropuesta),
            Some(p) if quien != p.de && quien != p.con => Some(Error::NoAutorizado),
            _ => None,
        };
        let s0 = self.saldo(&de);
        let r = self.tanda.try_cancelar_propuesta(&id, &de, &quien);
        let r = self.res("cancelar_propuesta", r);
        self.anotar(format!(
            "t{id} cancelar_propuesta(de {}, por {}) -> {r:?}",
            self.nombre(&de),
            self.nombre(&quien)
        ));
        if self.segun("cancelar_propuesta", r, esperado).is_some() {
            let comp = prop.unwrap().compensacion;
            self.exigir(self.saldo(&de) == s0 + comp.max(0), || {
                format!("t{id}: al cancelar la propuesta no volvió la compensación")
            });
        }
    }

    // -----------------------------------------------------------------------
    // Cerrar rondas y finalizar
    // -----------------------------------------------------------------------

    fn cerrar(&mut self, k: usize) {
        let id = self.tandas[k].id;
        let sin_opciones = self.tandas[k].opciones.is_none();
        let t0 = self.tanda.get_tanda(&id);
        let ahora = self.ahora();
        let lista0 = self.miembros(id);
        let (_, _, pagaron) = self.tanda.get_ronda(&id);
        let et0 = self.tanda.get_estado_turnos(&id);
        let tol = self.tolerancia(id);
        let s0 = self.saldos();
        let r = self.tanda.try_cerrar_ronda(&id);
        let r = self.res("cerrar_ronda", r);
        self.anotar(format!(
            "t{id} r{} cerrar_ronda ({} de {} pagaron) -> {r:?}",
            t0.ronda_actual,
            pagaron.len(),
            lista0.len()
        ));
        // M1 v4: antes de que venza, solo si todos pagaron y nunca en la subasta.
        let antes = ahora < t0.inicio_ronda + t0.periodo_seg;
        let subasta = self.tandas[k].opciones.as_ref().map(|o| o.modo) == Some(ModoTurnos::Subasta);
        let esperado = if t0.estado != Estado::Activa {
            Some(Error::EstadoInvalido)
        } else if antes && subasta {
            Some(Error::SubastaNoCierraAntes)
        } else if antes && (pagaron.len() as usize) < lista0.len() {
            Some(Error::RondaNoVencida)
        } else if antes && t0.inicio_ronda + 2 * t0.periodo_seg > ahora + 120 * DIA {
            Some(Error::CierreMuyAdelantado)
        } else {
            None
        };
        if self.segun("cerrar_ronda", r, esperado).is_none() {
            return;
        }
        if antes {
            self.contar("· cerrar antes: todos pagaron");
        }
        let t1 = self.tanda.get_tanda(&id);
        let lista1 = self.miembros(id);
        let s1 = self.saldos();
        let ronda = t0.ronda_actual;

        // La ronda que sigue empieza de verdad ahora (para la mitad de la subasta sellada).
        self.tandas[k].inicio_real = Some((t0.ronda_actual + 1, ahora));

        // Cuotas: lo que les pasa a quienes no pagaron es igual en todos los modos de turnos.
        let multa = t0.cuota * t0.penalidad_bps as i128 / BPS;
        let mut bolsa = pagaron.len() as i128 * t0.cuota;
        let mut en_mora = StdVec::new();
        for (i, (dir, m0)) in lista0.iter().enumerate() {
            let m1 = &lista1[i].1;
            let mut e = m0.clone();
            if !pagaron.contains(dir) {
                e.atrasos += 1;
                // (M1 v5) La garantía cubre al instante solo si alcanza para TODAS las cuotas que le
                // quedan (esta y las siguientes) y no debe nada de antes. Si no, la cuota es deuda y
                // la garantía no se toca: se reparte entre los afectados al finalizar.
                // Antes de su turno (fijo), solo necesita cubrir esta cuota: lo respalda su pozo.
                let le_quedan = t0.cuota * (t0.n_miembros - ronda) as i128;
                let antes_de_su_turno =
                    !m0.cobro && m0.posicion != SIN_TURNO && m0.posicion > ronda;
                let necesita = if antes_de_su_turno {
                    t0.cuota
                } else {
                    le_quedan
                };
                let cubierto = if m0.deuda == 0 && m0.colateral >= necesita {
                    e.multas_pendientes += multa;
                    t0.cuota
                } else {
                    e.deuda += t0.cuota;
                    e.moroso = true;
                    self.contar("· cerrar: la garantía no alcanza, la cuota queda como deuda");
                    0
                };
                if cubierto > 0 {
                    self.contar("· cerrar: la garantía alcanza y cubre al instante");
                }
                e.colateral -= cubierto;
                bolsa += cubierto;
            }
            en_mora.push(e.moroso);
            let ok = m1.atrasos == e.atrasos
                && m1.multas_pendientes == e.multas_pendientes
                && m1.deuda == e.deuda
                && m1.moroso == e.moroso
                && if sin_opciones {
                    m1.colateral == e.colateral
                } else {
                    // Con turnos, la garantía solo puede subir (se completa al cobrar o con dividendos).
                    m1.colateral >= e.colateral
                };
            self.exigir(ok, || {
                format!(
                    "t{id}: al cerrar, {} quedó {m1:?} y debía quedar {e:?}",
                    self.nombre(dir)
                )
            });
        }

        // Turno: exactamente un dueño de la ronda que se cerró; cobra si está al día.
        let duenos: StdVec<usize> = (0..lista1.len())
            .filter(|i| lista1[*i].1.posicion == ronda)
            .collect();
        self.exigir(duenos.len() == 1, || {
            format!("t{id}: la ronda {ronda} tiene {} dueños", duenos.len())
        });
        let (dir_b, mb1) = lista1[duenos[0]].clone();
        if sin_opciones {
            self.exigir(duenos[0] == ronda as usize, || {
                format!("t{id}: sin opciones cobra quien llegó en el lugar {ronda}")
            });
        }
        self.exigir(mb1.moroso || mb1.cobro, || {
            format!("t{id}: el dueño de la ronda {ronda} está al día y no cobró")
        });

        // Subasta (abierta o sellada): cobra la mejor oferta (en la sellada, la mayor revelada) si
        // quien la hizo sigue sin turno y al día; si no, el primero del orden de respaldo que pueda;
        // y si todos los que faltan están en mora, el primero sin turno (su bolsa se retiene).
        if self.tandas[k].opciones.as_ref().map(|o| o.modo) == Some(ModoTurnos::Subasta) {
            let puede = |d: &Address| {
                lista0
                    .iter()
                    .position(|(x, _)| x == d)
                    .is_some_and(|i| lista0[i].1.posicion == SIN_TURNO && !en_mora[i])
            };
            let ganador = et0
                .mejor_postor
                .clone()
                .filter(|d| puede(d))
                .or_else(|| et0.respaldo.iter().find(|d| puede(d)))
                .or_else(|| {
                    lista0
                        .iter()
                        .find(|(_, m)| m.posicion == SIN_TURNO)
                        .map(|(d, _)| d.clone())
                });
            self.exigir(ganador.as_ref() == Some(&dir_b), || {
                format!(
                    "t{id}: la ronda {ronda} de la subasta la cobró {} y debía cobrarla {:?} \
                     (mejor oferta: {:?})",
                    self.nombre(&dir_b),
                    ganador.as_ref().map(|d| self.nombre(d)),
                    et0.mejor_postor.as_ref().map(|d| self.nombre(d))
                )
            });
            if et0.mejor_postor.as_ref() == Some(&dir_b) {
                let sellada = self.tandas[k]
                    .opciones
                    .as_ref()
                    .is_some_and(|o| o.ofertas_selladas);
                self.contar(if sellada {
                    "· cerrar: cobra la mayor oferta revelada"
                } else {
                    "· cerrar: cobra la mejor oferta"
                });
            }
        }

        // Dinero: nadie más que el beneficiario recibe algo, salvo compensaciones de propuestas
        // que se retiraron solas (su turno llegó o alguien cayó en mora).
        let et1 = self.tanda.get_estado_turnos(&id);
        let mut esperado = std::vec![0i128; self.gente.len()];
        for p in et0.propuestas.iter() {
            if !et1.propuestas.iter().any(|q| q == p) && p.compensacion > 0 {
                esperado[self.idx(&p.de)] += p.compensacion;
            }
        }
        let ib = self.idx(&dir_b);
        for i in 0..self.gente.len() {
            if i != ib {
                self.exigir(s1[i] - s0[i] == esperado[i], || {
                    format!(
                        "t{id}: al cerrar, p{i} recibió {} y debía recibir {}",
                        s1[i] - s0[i],
                        esperado[i]
                    )
                });
            }
        }
        let recibio = s1[ib] - s0[ib] - esperado[ib];
        if mb1.moroso {
            self.contar("· cerrar: el dueño del turno estaba en mora");
        }
        let retenido = t1.retenido - t0.retenido;
        if sin_opciones {
            // Bolsa completa (salvo redondeo de la bóveda) al beneficiario, o retenida si es moroso.
            let llego = if mb1.moroso { retenido } else { recibio };
            self.exigir(
                llego <= bolsa && llego >= bolsa - tol && (!mb1.moroso || recibio == 0),
                || {
                    format!(
                        "t{id}: la bolsa era {bolsa} y llegaron {llego} (moroso: {})",
                        mb1.moroso
                    )
                },
            );
        } else {
            self.exigir(
                recibio >= 0
                    && recibio <= bolsa + et0.fondo_primas
                    && (!mb1.moroso || recibio == 0),
                || format!("t{id}: el beneficiario recibió {recibio} de una bolsa de {bolsa}"),
            );
        }

        // Calendario anclado (M1). Si se cerró antes (v4), la siguiente vence un periodo después de la
        // fecha límite de esta: su `inicio_ronda` queda en el futuro (es esa fecha límite).
        let vence0 = t0.inicio_ronda + t0.periodo_seg;
        let vence1 = (vence0 + t0.periodo_seg).max(ahora + t0.periodo_seg.min(3 * DIA));
        let estado = if ronda + 1 == t0.n_miembros {
            Estado::PorLiquidar
        } else {
            Estado::Activa
        };
        self.exigir(
            t1.ronda_actual == ronda + 1
                && t1.inicio_ronda == vence1 - t0.periodo_seg
                && if antes {
                    t1.inicio_ronda == vence0
                } else {
                    t1.inicio_ronda <= ahora
                }
                && t1.estado == estado,
            || format!("t{id}: la ronda siguiente quedó mal: {t1:?}"),
        );
    }

    fn finalizar(&mut self, k: usize) {
        let id = self.tandas[k].id;
        let t0 = self.tanda.get_tanda(&id);
        let lista = self.miembros(id);
        let valor = if t0.shares_boveda > 0 {
            self.boveda(id).valor(&t0.shares_boveda)
        } else {
            0
        };
        let tol = self.tolerancia(id);
        let deudas0: StdVec<(Address, Deuda)> = self.tanda.get_deudas(&id).iter().collect();
        let c0 = self.saldo(&self.yo);
        let s0 = self.saldos();
        let r = self.tanda.try_finalizar(&id);
        let r = self.res("finalizar", r);
        self.anotar(format!("t{id} finalizar -> {r:?}"));
        let esperado = (t0.estado != Estado::PorLiquidar).then_some(Error::EstadoInvalido);
        if self.segun("finalizar", r, esperado).is_none() {
            return;
        }
        let t1 = self.tanda.get_tanda(&id);
        let s1 = self.saldos();

        // (M1 v5) La garantía de cada moroso (con su parte del rendimiento) se reparte entre quienes
        // cobraron de menos, en proporción a lo que le faltó a cada uno (sin contar su propia ronda).
        // Si el afectado cobró su bolsa, se le paga directo; si no (también era moroso), va al fondo que
        // se reparte entre quienes cumplieron. Lo que sobre vuelve al moroso, menos sus multas. Las
        // unidades sueltas del redondeo (menos de una por afectado) caen en el primero que la red
        // ordena, por eso aquí se acotan en vez de adivinar quién.
        let suma_col: i128 = lista.iter().map(|(_, m)| m.colateral).sum();
        let n = lista.len();
        let mut directo = std::vec![0i128; n]; // lo que cobra cada uno de garantías ajenas (piso)
        let mut devuelto = std::vec![0i128; n]; // lo que le vuelve a cada moroso de su garantía
        let mut usado = std::vec![0i128; n]; // cuánto de su deuda pagó cada moroso con su garantía
        let mut al_pozo = 0i128; // lo que va al fondo de quienes cumplieron (piso)
        let mut sueltas = 0i128; // unidades de redondeo repartidas entre todos los afectados
        let mut multas_morosos = 0i128; // multas cobradas a lo que les sobró
        let mut garantia_morosos = 0i128; // lo que sale del total para los morosos
        for (i, (dir, m)) in lista.iter().enumerate() {
            if !m.moroso || m.colateral <= 0 {
                continue;
            }
            let bruto = valor.max(0) * m.colateral / suma_col;
            garantia_morosos += bruto;
            // Lo que se le debe a cada afectado (agrupado), sin su propia ronda.
            let mut debe: StdVec<(Address, i128)> = StdVec::new();
            if let Some((_, d)) = deudas0.iter().find(|(x, _)| x == dir) {
                for f in d.faltantes.iter().filter(|f| f.acreedor != *dir) {
                    match debe.iter_mut().find(|(x, _)| *x == f.acreedor) {
                        Some(e) => e.1 += f.monto,
                        None => debe.push((f.acreedor.clone(), f.monto)),
                    }
                }
            }
            let total_debe: i128 = debe.iter().map(|(_, v)| *v).sum();
            let a = bruto.min(total_debe);
            usado[i] = a;
            let mut piso_total = 0;
            for (acreedor, debido) in &debe {
                let parte = a * debido / total_debe;
                piso_total += parte;
                let j = self.idx(acreedor);
                let cobro = lista.iter().find(|(x, _)| x == acreedor).unwrap().1.cobro;
                if cobro {
                    directo[lista.iter().position(|(x, _)| x == acreedor).unwrap()] += parte;
                } else {
                    al_pozo += parte;
                }
                let _ = j;
            }
            if total_debe > 0 {
                sueltas += a - piso_total;
            }
            let sobra = bruto - a;
            let multas = m.multas_pendientes.min(sobra);
            multas_morosos += multas;
            devuelto[i] = sobra - multas;
            if a > 0 {
                self.contar("· finalizar: la garantía de un moroso se reparte entre los afectados");
            }
            if a > 0 && a < total_debe {
                self.contar("· finalizar: la garantía no alcanza (reparto proporcional)");
            }
            if sobra > 0 {
                self.contar("· finalizar: al moroso le sobra garantía");
            }
        }
        // La deuda que le queda a cada moroso (y si deja de serlo).
        for (i, (dir, m)) in lista.iter().enumerate() {
            if usado[i] == 0 {
                continue;
            }
            let m1 = self.miembro(id, dir).unwrap();
            self.exigir(
                m1.deuda == m.deuda - usado[i] && m1.moroso == (m1.deuda > 0),
                || {
                    format!(
                        "t{id}: la garantía de {} pagó {} de su deuda y quedó {m1:?} (debía deber {})",
                        self.nombre(dir),
                        usado[i],
                        m.deuda - usado[i]
                    )
                },
            );
            if m1.deuda == 0 {
                self.contar("· finalizar: la garantía saldó toda la deuda del moroso");
            }
        }
        // Al fondo de los que cumplieron: lo calculado más, como mucho, las unidades sueltas.
        let pozo_extra = t1.retenido - t0.retenido;
        self.exigir(
            pozo_extra >= al_pozo && pozo_extra <= al_pozo + sueltas,
            || {
                format!(
                    "t{id}: al fondo de quienes cumplieron fueron {pozo_extra} de las garantías y \
                     debían ser entre {al_pozo} y {}",
                    al_pozo + sueltas
                )
            },
        );

        // Quiénes se reparten multas y bolsas retenidas: los que nunca se atrasaron; si no hay,
        // los que no están en mora.
        let mut elegibles: StdVec<usize> = (0..lista.len())
            .filter(|i| !lista[*i].1.moroso && lista[*i].1.atrasos == 0)
            .collect();
        if elegibles.is_empty() {
            elegibles = (0..lista.len()).filter(|i| !lista[*i].1.moroso).collect();
        }
        let pozo = t1.fondo_premios + t1.retenido;
        // M1 v4: si se repartieron bolsas retenidas, el contrato anota a quiénes (para pagar deudas).
        let repartidos: StdVec<Address> = if t1.retenido > 0 {
            elegibles.iter().map(|i| lista[*i].0.clone()).collect()
        } else {
            StdVec::new()
        };
        let guardado: Option<soroban_sdk::Vec<Address>> = self.env.as_contract(&self.yo, || {
            self.env
                .storage()
                .persistent()
                .get(&ClaveM1::Repartidos(id))
        });
        let guardado: StdVec<Address> = guardado.map(|v| v.iter().collect()).unwrap_or_default();
        self.exigir(guardado == repartidos, || {
            format!("t{id}: el reparto anotado no es el esperado")
        });
        self.tandas[k].repartidos = repartidos;
        for (j, (dir, m)) in lista.iter().enumerate() {
            let recibio = s1[self.idx(dir)] - s0[self.idx(dir)];
            if m.moroso {
                // Un moroso solo recibe lo que le sobró de su garantía y lo que le tocó de la de otros
                // morosos como afectado (v5). Nunca la parte de un fondo: no cumplió.
                self.exigir(
                    recibio >= devuelto[j] + directo[j] - tol
                        && recibio <= devuelto[j] + directo[j] + sueltas + tol,
                    || {
                        format!(
                            "t{id}: {} estaba en mora y recibió {recibio}; debía recibir {} de lo \
                             que le sobró y {} de garantías ajenas",
                            self.nombre(dir),
                            devuelto[j],
                            directo[j]
                        )
                    },
                );
                continue;
            }
            let sin_multas = m.colateral - m.multas_pendientes.min(m.colateral);
            let parte = if elegibles.contains(&j) {
                pozo / elegibles.len() as i128
            } else {
                0
            };
            self.exigir(recibio >= sin_multas + parte + directo[j] - tol, || {
                format!(
                    "t{id}: {} recibió {recibio} y le tocaban al menos {} (garantía sin multas {sin_multas} \
                     + parte del fondo {parte} + garantías ajenas {})",
                    self.nombre(dir),
                    sin_multas + parte + directo[j],
                    directo[j]
                )
            });
        }
        let _ = (multas_morosos, garantia_morosos);
        if lista.iter().any(|(_, m)| m.moroso) {
            self.contar("· finalizar con alguien en mora");
        }
        if lista.iter().all(|(_, m)| m.moroso) {
            self.contar("· finalizar con TODOS en mora");
            // Todos en mora: ni el fondo de multas ni las bolsas retenidas se reparten
            // (`sin_repartir`): quedan en el contrato. (v5) Lo demás sí sale: lo que les toca a los
            // afectados que cobraron y lo que le sobra de su garantía a cada moroso.
            let queda = t1.fondo_premios + t1.retenido;
            self.exigir(
                self.saldo(&self.yo) - c0 == queda - (t0.retenido + t0.fondo_premios),
                || {
                    format!(
                        "t{id}: todos en mora y el contrato quedó con {} de más en vez de {}",
                        self.saldo(&self.yo) - c0,
                        queda - (t0.retenido + t0.fondo_premios)
                    )
                },
            );
            self.sin_repartir += queda;
        }
        self.revisar_terminada(id, Estado::Finalizada);
        self.tandas[k].terminada = true;
    }

    fn revisar_terminada(&self, id: u32, estado: Estado) {
        let t = self.tanda.get_tanda(&id);
        self.exigir(t.estado == estado && t.shares_boveda == 0, || {
            format!("t{id}: terminó mal: {t:?}")
        });
        for (dir, m) in self.miembros(id) {
            self.exigir(m.colateral == 0, || {
                format!(
                    "t{id}: {} quedó con garantía {}",
                    self.nombre(&dir),
                    m.colateral
                )
            });
        }
        let et = self.tanda.get_estado_turnos(&id);
        self.exigir(et.fondo_primas == 0 && et.propuestas.is_empty(), || {
            format!("t{id}: terminó con primas o propuestas pendientes")
        });
    }

    // -----------------------------------------------------------------------
    // Lo que debe fallar sin cambiar nada
    // -----------------------------------------------------------------------

    fn operacion_invalida(&mut self, k: usize) {
        let id = self.tandas[k].id;
        let t = self.tanda.get_tanda(&id);
        let p = self.persona();
        let tiene_miembros = !self.miembros(id).is_empty();
        let (que, r, esperado) = match (t.estado, self.azar.hasta(4)) {
            (Estado::Abierta, 0) => {
                let r = self.tanda.try_cerrar_ronda(&id);
                (
                    "cerrar_ronda",
                    self.res("cerrar_ronda", r).map(|_| ()),
                    Error::EstadoInvalido,
                )
            }
            (Estado::Abierta, 1) => {
                let r = self.tanda.try_finalizar(&id);
                (
                    "finalizar",
                    self.res("finalizar", r).map(|_| ()),
                    Error::EstadoInvalido,
                )
            }
            (Estado::Abierta, 2) if tiene_miembros => {
                let r = self.tanda.try_configurar_requisitos(&id, &0, &false);
                (
                    "configurar_requisitos",
                    self.res("configurar_requisitos", r).map(|_| ()),
                    Error::RequisitosBloqueados,
                )
            }
            (Estado::Abierta, _) => {
                let r = self.tanda.try_pagar_deuda(&id, &p, &p, &1);
                (
                    "pagar_deuda",
                    self.res("pagar_deuda", r).map(|_| ()),
                    Error::EstadoInvalido,
                )
            }
            (Estado::Activa, 0) => {
                let r = self.tanda.try_finalizar(&id);
                (
                    "finalizar",
                    self.res("finalizar", r).map(|_| ()),
                    Error::EstadoInvalido,
                )
            }
            (Estado::Activa, 1) => {
                let r = self.tanda.try_cancelar(&id);
                (
                    "cancelar",
                    self.res("cancelar", r).map(|_| ()),
                    Error::EstadoInvalido,
                )
            }
            (Estado::Activa, 2) => {
                let r = self.tanda.try_configurar_requisitos(&id, &0, &false);
                (
                    "configurar_requisitos",
                    self.res("configurar_requisitos", r).map(|_| ()),
                    Error::RequisitosBloqueados,
                )
            }
            (Estado::Activa, _) | (_, 0) => {
                let r = self.tanda.try_unirse(&id, &p);
                (
                    "unirse",
                    self.res("unirse", r).map(|_| ()),
                    Error::TandaLlena,
                )
            }
            (_, 1) => {
                let r = self.tanda.try_cerrar_ronda(&id);
                (
                    "cerrar_ronda",
                    self.res("cerrar_ronda", r).map(|_| ()),
                    Error::EstadoInvalido,
                )
            }
            (_, 2) => {
                let r = self.tanda.try_cancelar(&id);
                (
                    "cancelar",
                    self.res("cancelar", r).map(|_| ()),
                    Error::EstadoInvalido,
                )
            }
            _ => {
                let r = self.tanda.try_pagar_cuota(&id, &p);
                (
                    "pagar_cuota",
                    self.res("pagar_cuota", r).map(|_| ()),
                    Error::EstadoInvalido,
                )
            }
        };
        self.anotar(format!("t{id} {que} (debe fallar) -> {r:?}"));
        self.segun(que, r, Some(esperado));
        self.exigir(self.tanda.get_tanda(&id) == t, || {
            format!("t{id}: {que} falló pero cambió la tanda")
        });
    }

    /// El historial deja de aceptar hechos de la tanda, se desconecta o se vuelve a conectar.
    /// Nada de eso debe trabar ninguna tanda.
    fn cambiar_historial(&mut self) {
        let Some(h_addr) = self.hist.clone() else {
            return;
        };
        let h = HistorialContractClient::new(&self.env, &h_addr);
        match self.azar.hasta(3) {
            0 => {
                h.revocar_emisor(&self.yo);
                self.anotar(String::from("historial: la tanda ya no puede escribir"));
            }
            1 => {
                self.tanda.configurar_historial(&None);
                self.hist_conectado = false;
                self.anotar(String::from("historial: desconectado"));
            }
            _ => {
                h.autorizar_emisor(&self.yo);
                self.tanda.configurar_historial(&Some(h_addr));
                self.hist_conectado = true;
                self.anotar(String::from("historial: conectado y autorizado"));
            }
        }
    }

    // -----------------------------------------------------------------------
    // El tiempo
    // -----------------------------------------------------------------------

    fn activas(&self) -> StdVec<(usize, Tanda)> {
        (0..self.tandas.len())
            .filter(|k| !self.tandas[*k].terminada)
            .map(|k| (k, self.tanda.get_tanda(&self.tandas[k].id)))
            .filter(|(_, t)| t.estado == Estado::Activa)
            .collect()
    }

    /// El salto más largo que se permite ahora (modo testnet: nadie deja una ronda vencida sin
    /// cerrar más de `ATRASO_MAX_CIERRE`).
    fn tope(&self, seg: u64) -> u64 {
        if !self.testnet {
            return seg.min(400 * DIA);
        }
        let ahora = self.ahora();
        self.activas().iter().fold(seg, |tope, (_, t)| {
            let limite = t.inicio_ronda + t.periodo_seg + ATRASO_MAX_CIERRE;
            tope.min(limite.saturating_sub(ahora))
        })
    }

    fn avanzar(&mut self, seg: u64) {
        let seg = self.tope(seg);
        if seg == 0 {
            return;
        }
        if self.testnet {
            self.revisar_vidas(seg);
        }
        let testnet = self.testnet;
        self.env.ledger().with_mut(|l| {
            l.timestamp += seg;
            l.sequence_number += if testnet {
                (seg / SEG_POR_LEDGER) as u32
            } else {
                1
            };
        });
        self.anotar(format!("pasan {seg} s"));
    }

    fn avanzar_al_azar(&mut self) {
        let ahora = self.ahora();
        let proximo = self
            .activas()
            .iter()
            .map(|(_, t)| t.inicio_ronda + t.periodo_seg)
            .min();
        let seg = match (self.azar.hasta(10), proximo) {
            (0..=3, _) => self.azar.entre(1, 600),
            (4..=7, Some(v)) => v.saturating_sub(ahora) + self.azar.entre(0, 3_600),
            (4..=7, None) => self.azar.entre(1, DIA),
            _ => self.azar.entre(DIA, 40 * DIA),
        };
        self.avanzar(seg);
    }

    /// Una tanda activa con la ronda vencida hace más de `ATRASO_MAX_CIERRE` (solo modo testnet).
    fn vencida_hace_mucho(&self) -> Option<usize> {
        if !self.testnet {
            return None;
        }
        let ahora = self.ahora();
        self.activas()
            .into_iter()
            .find(|(_, t)| t.inicio_ronda + t.periodo_seg + ATRASO_MAX_CIERRE <= ahora)
            .map(|(k, _)| k)
    }

    fn ttl<K: IntoVal<Env, Val>>(&self, contrato: &Address, clave: &K) -> Option<u32> {
        self.env.as_contract(contrato, || {
            let p = self.env.storage().persistent();
            if p.has(clave) {
                Some(p.get_ttl(clave))
            } else {
                None
            }
        })
    }

    /// Ningún dato que necesita una tanda activa se archiva al pasar `seg` segundos.
    fn revisar_vidas(&self, seg: u64) {
        let salto = (seg / SEG_POR_LEDGER) as u32;
        let env = &self.env;
        let instancia = |c: &Address| env.as_contract(c, || env.storage().instance().get_ttl());
        for (k, t) in self.activas() {
            let id = self.tandas[k].id;
            let boveda = self.tanda.get_boveda(&id);
            let mut vidas: StdVec<(String, Option<u32>)> = std::vec![
                (
                    String::from("instancia de la tanda"),
                    Some(instancia(&self.yo)),
                ),
                (
                    String::from("instancia de la bóveda"),
                    Some(instancia(&boveda)),
                ),
                (
                    String::from("bóveda: Shares(tanda)"),
                    self.ttl(&boveda, &ClaveBoveda::Shares(self.yo.clone())),
                ),
                (
                    String::from("Tanda"),
                    self.ttl(&self.yo, &DataKey::Tanda(id)),
                ),
                (
                    String::from("Miembros"),
                    self.ttl(&self.yo, &DataKey::Miembros(id)),
                ),
                (
                    String::from("BovedaDe"),
                    self.ttl(&self.yo, &ClaveM1::BovedaDe(id)),
                ),
            ];
            for (dir, _) in self.miembros(id) {
                let n = self.nombre(&dir);
                vidas.push((
                    format!("Miembro({n})"),
                    self.ttl(&self.yo, &DataKey::Miembro(id, dir.clone())),
                ));
                vidas.push((
                    format!("DeudaDe({n})"),
                    self.ttl(&self.yo, &ClaveM1::DeudaDe(id, dir.clone())),
                ));
                vidas.push((
                    format!("Pagado({}, {n})", t.ronda_actual),
                    self.ttl(&self.yo, &DataKey::Pagado(id, t.ronda_actual, dir.clone())),
                ));
            }
            for (nombre, clave) in [
                ("Opciones", ClaveM3::Opciones(id)),
                ("Turnos", ClaveM3::Turnos(id)),
                ("Oferta", ClaveM3::Oferta(id)),
                ("Respaldo", ClaveM3::Respaldo(id)),
                ("Propuestas", ClaveM3::Propuestas(id)),
                ("FondoPrimas", ClaveM3::FondoPrimas(id)),
                ("Sellos", ClaveM3::Sellos(id)),
                ("InicioReal", ClaveM3::InicioReal(id)),
            ] {
                vidas.push((String::from(nombre), self.ttl(&self.yo, &clave)));
            }
            for (nombre, ttl) in vidas {
                if let Some(ttl) = ttl {
                    self.exigir(ttl >= salto, || {
                        format!(
                            "t{id}: {nombre} se archivaría (le quedan {ttl} ledgers y pasan {salto})"
                        )
                    });
                }
            }
        }
    }

    // -----------------------------------------------------------------------
    // Las reglas que siempre se cumplen
    // -----------------------------------------------------------------------

    fn revisar(&self) {
        // 1. No se crea ni se pierde dinero.
        let mut suma = self.saldo(&self.yo);
        for b in &self.bovedas {
            suma += self.saldo(b);
        }
        for p in &self.gente {
            suma += self.saldo(p);
        }
        self.exigir(suma == self.total, || {
            format!(
                "el dinero no cuadra: hay {suma} y debería haber {}",
                self.total
            )
        });

        let mut en_mano = self.sin_repartir;
        let mut shares = std::vec![0i128; self.bovedas.len()];
        for tm in self.tandas.iter().filter(|tm| !tm.terminada) {
            let id = tm.id;
            let t = self.tanda.get_tanda(&id);
            let lista = self.miembros(id);
            let deudas: StdVec<_> = self.tanda.get_deudas(&id).iter().collect();
            let (ronda, _, pagaron) = self.tanda.get_ronda(&id);
            let et = self.tanda.get_estado_turnos(&id);
            let boveda = self.tanda.get_boveda(&id);
            let b = self.bovedas.iter().position(|x| *x == boveda).unwrap();
            shares[b] += t.shares_boveda;

            self.exigir(
                t.shares_boveda >= 0
                    && t.retenido >= 0
                    && t.fondo_premios >= 0
                    && et.fondo_primas >= 0
                    && t.ronda_actual <= t.n_miembros
                    && ronda == t.ronda_actual,
                || format!("t{id}: datos imposibles: {t:?}, primas {}", et.fondo_primas),
            );
            self.exigir(
                pagaron.iter().all(|p| lista.iter().any(|(d, _)| *d == p)),
                || format!("t{id}: pagó alguien que no es miembro"),
            );

            // 2. Lo que el contrato tiene en mano por esta tanda.
            let compensaciones: i128 = et.propuestas.iter().map(|p| p.compensacion.max(0)).sum();
            en_mano += match t.estado {
                Estado::Activa => {
                    pagaron.len() as i128 * t.cuota
                        + t.retenido
                        + t.fondo_premios
                        + et.fondo_primas
                        + compensaciones
                }
                Estado::PorLiquidar => {
                    t.retenido + t.fondo_premios + et.fondo_primas + compensaciones
                }
                _ => 0,
            };
            if t.estado != Estado::Activa {
                self.exigir(et.fondo_primas == 0 && et.propuestas.is_empty(), || {
                    format!("t{id}: primas o propuestas fuera de una tanda activa")
                });
            }

            // 4. Miembros y deudas.
            let mut suma_col = 0;
            let mut bolsas = 0;
            for (dir, m) in &lista {
                let d = deudas
                    .iter()
                    .find(|(x, _)| x == dir)
                    .map(|(_, d)| d.clone());
                let faltan: i128 = d
                    .as_ref()
                    .map(|d| d.faltantes.iter().map(|f| f.monto).sum())
                    .unwrap_or(0);
                let bolsa = d.as_ref().map(|d| d.bolsa_retenida).unwrap_or(0);
                bolsas += bolsa;
                suma_col += m.colateral;
                let ok = m.colateral >= 0
                    && m.deuda >= 0
                    && m.multas_pendientes >= 0
                    && bolsa >= 0
                    && m.moroso == (m.deuda > 0)
                    && m.deuda == faltan
                    && d.as_ref()
                        .map(|d| d.faltantes.iter().all(|f| f.monto > 0))
                        .unwrap_or(true)
                    && m.atrasos <= t.ronda_actual + 1
                    && (!m.cobro || (m.posicion != SIN_TURNO && m.posicion < t.ronda_actual));
                self.exigir(ok, || {
                    format!("t{id}: {} imposible: {m:?}, deuda {d:?}", self.nombre(dir))
                });
            }
            if t.estado == Estado::Activa || t.estado == Estado::PorLiquidar {
                let exacto = matches!(
                    tm.opciones.as_ref().map(|o| o.modo),
                    None | Some(ModoTurnos::Llegada)
                        | Some(ModoTurnos::Eleccion)
                        | Some(ModoTurnos::Sorteo)
                );
                // Con precio por turno o subasta, `retenido` también guarda lo que sobra de primas y
                // descuentos sin nadie al día; esas partes no son bolsa de nadie.
                self.exigir(
                    if exacto {
                        t.retenido == bolsas
                    } else {
                        t.retenido >= bolsas
                    },
                    || format!("t{id}: retenido {} y bolsas retenidas {bolsas}", t.retenido),
                );
            }

            // 3. Lo de esta tanda en la bóveda alcanza para su garantía.
            if t.shares_boveda > 0 || suma_col > 0 {
                let valor = BovedaSimuladaClient::new(&self.env, &boveda).valor(&t.shares_boveda);
                self.exigir(valor >= suma_col - self.tolerancia(id), || {
                    format!(
                        "t{id}: sus participaciones valen {valor} y su garantía suma {suma_col}"
                    )
                });
            }

            // Turnos: cada turno tiene un solo dueño.
            let pos: StdVec<u32> = lista.iter().map(|(_, m)| m.posicion).collect();
            let unicos = pos
                .iter()
                .filter(|p| **p != SIN_TURNO)
                .all(|p| pos.iter().filter(|q| *q == p).count() == 1);
            let modo = tm.opciones.as_ref().map(|o| o.modo);
            let sin_turno = pos.iter().filter(|p| **p == SIN_TURNO).count() as u32;
            let ok = unicos
                && pos.iter().all(|p| *p == SIN_TURNO || *p < t.n_miembros)
                && match (t.estado, modo) {
                    (Estado::Abierta, Some(ModoTurnos::Sorteo) | Some(ModoTurnos::Subasta)) => {
                        sin_turno == lista.len() as u32
                    }
                    (Estado::Abierta, None | Some(ModoTurnos::Llegada)) => {
                        pos.iter().enumerate().all(|(i, p)| *p == i as u32)
                    }
                    (Estado::Abierta, _) => sin_turno == 0,
                    (_, Some(ModoTurnos::Subasta)) => {
                        sin_turno == t.n_miembros - t.ronda_actual.min(t.n_miembros)
                    }
                    _ => sin_turno == 0,
                };
            self.exigir(ok, || format!("t{id}: turnos imposibles: {pos:?} en {t:?}"));

            // Subasta sellada: la mitad que muestra la web y quiénes sellaron son los del modelo.
            let sellada = tm.opciones.as_ref().is_some_and(|o| o.ofertas_selladas);
            let fin = if sellada && t.estado == Estado::Activa {
                mitad_modelo(tm, &t)
            } else {
                0
            };
            let sellos = sellos_modelo(tm, t.ronda_actual);
            self.exigir(
                et.fin_sellado == fin
                    && et.sellos.len() as usize == sellos.len()
                    && sellos.iter().all(|(q, _, _)| et.sellos.contains(q)),
                || {
                    format!(
                        "t{id}: fin del sellado {} y sellos de {:?}; el modelo espera {fin} y {:?}",
                        et.fin_sellado,
                        et.sellos
                            .iter()
                            .map(|q| self.nombre(&q))
                            .collect::<StdVec<_>>(),
                        sellos
                            .iter()
                            .map(|(q, _, _)| self.nombre(q))
                            .collect::<StdVec<_>>()
                    )
                },
            );
            if let Some(postor) = &et.mejor_postor {
                let m = lista.iter().find(|(d, _)| d == postor).map(|(_, m)| m);
                self.exigir(m.map(|m| m.posicion == SIN_TURNO).unwrap_or(false), || {
                    format!("t{id}: la mejor oferta es de alguien que ya tiene turno")
                });
            }
        }

        // 2. El contrato tiene exactamente lo que debe tener.
        let tiene = self.saldo(&self.yo);
        self.exigir(tiene == en_mano, || {
            format!("el contrato tiene {tiene} y debería tener {en_mano}")
        });

        // 3. Las participaciones de las tandas suman lo que la bóveda le reconoce al contrato, y la
        //    bóveda puede pagarle a todos.
        for (b, dir) in self.bovedas.iter().enumerate() {
            let bv = BovedaSimuladaClient::new(&self.env, dir);
            self.exigir(bv.shares_de(&self.yo) == shares[b], || {
                format!(
                    "bóveda {b}: el contrato tiene {} participaciones y las tandas anotan {}",
                    bv.shares_de(&self.yo),
                    shares[b]
                )
            });
            let total = bv.total_shares();
            self.exigir(bv.valor(&total) <= self.saldo(dir), || {
                format!("bóveda {b}: promete más de lo que tiene")
            });
        }
    }

    fn revisar_final(&self) {
        self.exigir(self.tandas.iter().all(|tm| tm.terminada), || {
            String::from("quedaron tandas sin terminar")
        });
        for tm in &self.tandas {
            let t = self.tanda.get_tanda(&tm.id);
            self.exigir(
                t.shares_boveda == 0
                    && (t.estado == Estado::Finalizada || t.estado == Estado::Cancelada),
                || format!("t{}: no terminó bien: {t:?}", tm.id),
            );
        }
        self.revisar();
        self.exigir(self.saldo(&self.yo) == self.sin_repartir, || {
            String::from("terminó todo y quedó dinero en el contrato")
        });
    }

    // -----------------------------------------------------------------------
    // El juego
    // -----------------------------------------------------------------------

    /// (M1 v4) Una tanda finalizada donde alguien todavía debe (para pagar después de finalizar).
    fn finalizada_con_deuda(&mut self) -> Option<usize> {
        let ks: StdVec<usize> = (0..self.tandas.len())
            .filter(|k| {
                let id = self.tandas[*k].id;
                self.tandas[*k].terminada
                    && self.tanda.get_tanda(&id).estado == Estado::Finalizada
                    && self.miembros(id).iter().any(|(_, m)| m.deuda > 0)
            })
            .collect();
        if ks.is_empty() {
            None
        } else {
            Some(ks[self.azar.hasta(ks.len())])
        }
    }

    fn paso(&mut self) {
        if let Some(k) = self.vencida_hace_mucho() {
            self.cerrar(k);
            return;
        }
        let vivas: StdVec<usize> = (0..self.tandas.len())
            .filter(|k| !self.tandas[*k].terminada)
            .collect();
        if vivas.len() < 3 && (vivas.is_empty() || self.azar.si(6)) {
            self.crear();
            return;
        }
        let r = self.azar.hasta(100);
        if r < 12 {
            self.avanzar_al_azar();
            return;
        }
        if r < 13 {
            self.cambiar_historial();
            return;
        }
        if r < 16 {
            if let Some(k) = self.finalizada_con_deuda() {
                self.pagar_deuda_al_azar(k);
                return;
            }
        }
        let k = vivas[self.azar.hasta(vivas.len())];
        let estado = self.tanda.get_tanda(&self.tandas[k].id).estado;
        let r = self.azar.hasta(100);
        // En tandas con subasta o intercambios, más jugadas de turnos.
        let con_jugadas = self.tandas[k]
            .opciones
            .as_ref()
            .map(|o| o.permitir_intercambio || o.modo == ModoTurnos::Subasta)
            .unwrap_or(false);
        if estado == Estado::Activa && con_jugadas && r < 25 {
            self.turnos_al_azar(k);
            return;
        }
        match estado {
            Estado::Abierta => match r {
                0..=84 => self.unirse(k),
                85..=86 => self.cancelar(k),
                _ => self.operacion_invalida(k),
            },
            Estado::Activa => match r {
                0..=44 => self.pagar(k),
                45..=56 => self.pagar_deuda_al_azar(k),
                57..=66 => self.cerrar(k),
                67..=81 => self.turnos_al_azar(k),
                82..=91 => self.avanzar_al_azar(),
                _ => self.operacion_invalida(k),
            },
            Estado::PorLiquidar => match r {
                0..=34 => self.pagar_deuda_al_azar(k),
                35..=44 => self.operacion_invalida(k),
                _ => self.finalizar(k),
            },
            _ => self.fallar("una tanda terminada quedó como viva"),
        }
    }

    /// Lleva todas las tandas hasta el final: llena o cancela las abiertas, juega las rondas que
    /// faltan (cada uno según su perfil) y finaliza.
    fn terminar(&mut self) {
        for _ in 0..2_000 {
            let vivas: StdVec<usize> = (0..self.tandas.len())
                .filter(|k| !self.tandas[*k].terminada)
                .collect();
            if vivas.is_empty() {
                return;
            }
            let estados: StdVec<(usize, Tanda)> = vivas
                .iter()
                .map(|k| (*k, self.tanda.get_tanda(&self.tandas[*k].id)))
                .collect();
            if let Some((k, _)) = estados
                .iter()
                .find(|(_, t)| t.estado == Estado::PorLiquidar)
            {
                let k = *k;
                if self.azar.si(40) {
                    self.pagar_deuda_al_azar(k);
                    self.revisar();
                }
                self.finalizar(k);
                // M1 v4: a veces alguien paga su deuda ya con la tanda finalizada.
                for _ in 0..self.azar.entre(0, 3) {
                    if self
                        .miembros(self.tandas[k].id)
                        .iter()
                        .any(|(_, m)| m.deuda > 0)
                    {
                        self.revisar();
                        self.pagar_deuda_al_azar(k);
                    }
                }
            } else if let Some((k, _)) = estados.iter().find(|(_, t)| t.estado == Estado::Abierta) {
                let k = *k;
                if self.azar.si(8) {
                    self.cancelar(k);
                } else {
                    self.llenar(k);
                }
            } else {
                // La activa que vence primero: su ronda completa.
                let (k, t) = estados
                    .iter()
                    .min_by_key(|(_, t)| t.inicio_ronda + t.periodo_seg)
                    .cloned()
                    .unwrap();
                let perfiles = self.tandas[k].perfiles.clone();
                // M1 v4: a veces todos pagan (para que se pueda cerrar antes).
                let todos = self.azar.si(25);
                for (p, perfil) in perfiles {
                    let paga = todos
                        || match perfil {
                            Perfil::Cumplido => true,
                            Perfil::Distraido => self.azar.si(60),
                            Perfil::Irregular => self.azar.si(40),
                            Perfil::Desaparece(r) => t.ronda_actual < r,
                        };
                    if paga {
                        self.pagar_cuota(k, &p);
                        self.revisar();
                    }
                }
                if self.azar.si(30) {
                    self.pagar_deuda_al_azar(k);
                    self.revisar();
                }
                let sellada = self.tandas[k]
                    .opciones
                    .as_ref()
                    .is_some_and(|o| o.ofertas_selladas);
                if sellada && self.azar.si(70) {
                    self.ronda_sellada(k);
                } else {
                    for _ in 0..self.azar.entre(0, 3) {
                        self.turnos_al_azar(k);
                        self.revisar();
                    }
                }
                // M1 v4: si todos pagaron, a veces se cierra antes (en la subasta debe fallar).
                let (_, _, pagaron) = self.tanda.get_ronda(&self.tandas[k].id);
                if pagaron.len() == t.n_miembros && self.azar.si(70) {
                    self.cerrar(k);
                    if self.tanda.get_tanda(&self.tandas[k].id).ronda_actual != t.ronda_actual {
                        self.revisar();
                        continue;
                    }
                }
                let vence = t.inicio_ronda + t.periodo_seg;
                let extra = self.azar.entre(0, t.periodo_seg.min(2 * DIA));
                let falta = vence.saturating_sub(self.ahora()) + extra;
                self.avanzar(falta);
                self.cerrar(k);
            }
            self.revisar();
        }
        self.fallar("las tandas no terminaron en 2 000 pasos");
    }
}

fn escenario(semilla: u64) -> BTreeMap<String, u32> {
    let mut m = Mundo::nuevo(semilla);
    let pasos = m.azar.entre(150, 350);
    for _ in 0..pasos {
        m.paso();
        m.revisar();
    }
    m.terminar();
    m.revisar_final();
    let mut c = m.contador.take();
    for tm in &m.tandas {
        let modo = match &tm.opciones {
            None => String::from("sin opciones"),
            Some(o) => format!("{:?}", o.modo),
        };
        *c.entry(format!("· tandas {modo}")).or_insert(0) += 1;
    }
    *c.entry(String::from(if m.testnet {
        "· escenarios testnet"
    } else {
        "· escenarios rápidos"
    }))
    .or_insert(0) += 1;
    c
}

/// Las semillas se reparten en 4 pruebas para que corran en paralelo.
fn grupo(g: u64) {
    if let Ok(s) = std::env::var("INVARIANTES_SEMILLA") {
        if g == 0 {
            let _ = escenario(
                s.trim()
                    .parse()
                    .expect("INVARIANTES_SEMILLA debe ser un número"),
            );
        }
        return;
    }
    let n: u64 = std::env::var("INVARIANTES_SEMILLAS")
        .ok()
        .and_then(|s| s.trim().parse().ok())
        .unwrap_or(SEMILLAS_POR_DEFECTO);
    let mut total: BTreeMap<String, u32> = BTreeMap::new();
    for s in (1..=n).filter(|s| s % 4 == g) {
        for (k, v) in escenario(s) {
            *total.entry(k).or_insert(0) += v;
        }
    }
    // Con INVARIANTES_DETALLE=1 (y `-- --nocapture`) muestra cuántas veces pasó cada cosa.
    if std::env::var("INVARIANTES_DETALLE").is_ok() {
        for (k, v) in total {
            std::println!("[grupo {g}] {v:>6}  {k}");
        }
    }
}

#[test]
fn invariantes_al_azar_0() {
    grupo(0);
}

#[test]
fn invariantes_al_azar_1() {
    grupo(1);
}

#[test]
fn invariantes_al_azar_2() {
    grupo(2);
}

#[test]
fn invariantes_al_azar_3() {
    grupo(3);
}

// ---------------------------------------------------------------------------
// Hallazgo: rendimiento negativo por redondeo y un pago final negativo
// ---------------------------------------------------------------------------

/// Juega una tanda de 3 donde el último en el reparto termina con 1 unidad mínima de garantía (dos
/// multas del 50 % sobre una cuota de 1,0000001 TUSD), en una bóveda rápida de `dias` días de vida
/// (precio de la participación ~7×`dias`). Devuelve (rendimiento, resultado de `finalizar`).
fn jugar_reparto_con_redondeo(dias: u64) -> (i128, bool) {
    let env = Env::new_with_config(EnvTestConfig {
        capture_snapshot_at_drop: false,
    });
    env.mock_all_auths();
    env.ledger().with_mut(|l| {
        l.timestamp = 1_700_000_000;
        l.sequence_number = 1_000;
    });
    let token_addr = env
        .register_stellar_asset_contract_v2(Address::generate(&env))
        .address();
    let sac = StellarAssetClient::new(&env, &token_addr);
    let token = TokenClient::new(&env, &token_addr);
    let boveda = env.register(BovedaSimulada, (token_addr.clone(), 500u32, 52_560u32));
    sac.mint(&boveda, &(1_000_000 * U));
    env.ledger().with_mut(|l| l.timestamp += dias * DIA);
    let yo = env.register(TandaContract, ());
    let tanda = TandaContractClient::new(&env, &yo);
    tanda.inicializar(&Address::generate(&env), &boveda, &None);
    let gente: StdVec<Address> = (0..3)
        .map(|_| {
            let p = Address::generate(&env);
            sac.mint(&p, &(1_000 * U));
            p
        })
        .collect();
    let cuota = 10_000_001;
    let id = tanda.crear_tanda(&gente[0], &token_addr, &cuota, &3, &60, &5_000, &0);
    for p in &gente {
        tanda.unirse(&id, p);
    }
    for ronda in 0..3 {
        tanda.pagar_cuota(&id, &gente[0]);
        tanda.pagar_cuota(&id, &gente[1]);
        if ronda == 2 {
            tanda.pagar_cuota(&id, &gente[2]);
        }
        env.ledger().with_mut(|l| {
            l.timestamp += 61;
            l.sequence_number += 1;
        });
        if ronda < 2 {
            tanda.pagar_cuota(&id, &gente[2]); // tarde: multa de 5 000 000
        }
        tanda.cerrar_ronda(&id);
    }
    let t = tanda.get_tanda(&id);
    let valor = BovedaSimuladaClient::new(&env, &boveda).valor(&t.shares_boveda);
    let garantias: i128 = tanda
        .get_miembros(&id)
        .iter()
        .map(|(_, m)| m.colateral)
        .sum();
    let ok = tanda.try_finalizar(&id).is_ok();
    let total: i128 = gente.iter().map(|p| token.balance(p)).sum::<i128>()
        + token.balance(&yo)
        + token.balance(&boveda);
    assert_eq!(total, 1_003_000 * U, "el dinero no cuadra");
    (valor - garantias, ok)
}

/// Antes del arreglo, `finalizar` se trababa con la bóveda rápida de 100 y de 140–150 días (rendimiento
/// de -722, -1980 y -1830 unidades mínimas). Ahora termina siempre, sin crear ni perder dinero.
#[test]
fn finalizar_no_se_traba_con_rendimiento_negativo_por_redondeo() {
    for dias in [1u64, 50, 100, 130, 140, 150, 200, 300] {
        let (rendimiento, ok) = jugar_reparto_con_redondeo(dias);
        assert!(
            ok,
            "con la bóveda de {dias} días (rendimiento {rendimiento}) finalizar se trabó"
        );
    }
}

/// Una tanda creada con un token distinto al de su bóveda no arranca (el depósito en la bóveda falla
/// al unirse) y no toca el dinero que el contrato guarda para otras tandas. (Supuesto de
/// `docs/seguridad.md` §4.)
#[test]
fn tanda_con_otro_token_no_arranca_ni_toca_dinero_ajeno() {
    let env = Env::new_with_config(EnvTestConfig {
        capture_snapshot_at_drop: false,
    });
    env.mock_all_auths();
    let tusd = env
        .register_stellar_asset_contract_v2(Address::generate(&env))
        .address();
    let otro = env
        .register_stellar_asset_contract_v2(Address::generate(&env))
        .address();
    let boveda = env.register(BovedaSimulada, (tusd.clone(), 500u32, 1u32));
    let yo = env.register(TandaContract, ());
    let tanda = TandaContractClient::new(&env, &yo);
    tanda.inicializar(&Address::generate(&env), &boveda, &None);
    let ana = Address::generate(&env);
    StellarAssetClient::new(&env, &tusd).mint(&ana, &(1_000 * U));
    StellarAssetClient::new(&env, &otro).mint(&ana, &(1_000 * U));
    // El contrato ya guarda TUSD de otra tanda (por ejemplo, cuotas de una ronda en curso).
    StellarAssetClient::new(&env, &tusd).mint(&yo, &(500 * U));

    let id = tanda.crear_tanda(&ana, &otro, &(100 * U), &3, &60, &0, &10_000);
    let r = tanda.try_unirse(&id, &ana);
    assert!(r.is_err(), "unirse con un token sin bóveda debía fallar");
    let tusd_c = TokenClient::new(&env, &tusd);
    assert_eq!(tusd_c.balance(&yo), 500 * U, "tocó el TUSD de otras tandas");
    assert_eq!(tusd_c.balance(&ana), 1_000 * U);
    assert_eq!(TokenClient::new(&env, &otro).balance(&ana), 1_000 * U);
    assert_eq!(tanda.get_tanda(&id).estado, Estado::Abierta);
}
