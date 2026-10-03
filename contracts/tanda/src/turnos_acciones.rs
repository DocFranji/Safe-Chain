//! Reservado para la misión **M3**: acciones de turnos (`crear_tanda_avanzada`, `unirse_en_turno`, `ofertar`, intercambios).
//!
//! Empieza vacío a propósito: el módulo ya está declarado en `lib.rs`, así ninguna misión
//! choca con otra al agregar archivos. Agrega aquí tu bloque:
//!
//! ```ignore
//! use soroban_sdk::{contractimpl, Address, Env};
//! use crate::{Error, TandaContract, TandaContractArgs, TandaContractClient};
//!
//! #[contractimpl]
//! impl TandaContract {
//!     pub fn mi_funcion(env: Env, ...) -> Result<..., Error> { ... }
//! }
//! ```
//!
//! Instrucciones: `.claude/agents/m3-turnos.md` y `agentes/PROTOCOLO.md`.
