// Valores cerrados del contrato (§4). Los códigos son estables; las etiquetas son del front.
const opts = pairs => pairs.map(([v, l]) => ({ v, l }));

export const SI_NO_NS = opts([['si', 'Sí'], ['no', 'No'], ['no_sabe', 'No sé']]);

export const OPTIONS = {
  materialParedes: opts([
    ['concreto_ladrillo', 'Concreto o ladrillo'], ['madera_tablaroca', 'Madera o tablaroca'],
    ['bahareque_adobe', 'Bahareque o adobe'], ['zinc_carton_madera_no_tratada', 'Zinc, cartón o madera sin tratar'],
    ['reciclado_desecho', 'Material reciclado o de desecho']]),
  nivelAguaMax: opts([
    ['no_entro', 'No entró agua'], ['tobillo', 'Tobillo'], ['rodilla', 'Rodilla'],
    ['cintura', 'Cintura'], ['pecho', 'Pecho'], ['techo', 'Hasta el techo']]),
  inundadaAntes: SI_NO_NS,
  censoPrevio: SI_NO_NS,
  inscritaRud: SI_NO_NS,
  genero: opts([['femenino', 'Femenino'], ['masculino', 'Masculino'], ['no_binario_otro', 'No binario u otro'], ['prefiere_no_responder', 'Prefiere no responder']]),
  manejoEstudios: opts([['normalidad', 'Con normalidad'], ['con_dificultades', 'Con dificultades'], ['no_estudia', 'No estudia'], ['otro', 'Otro']]),
  medioAlerta: opts([['alerta_oficial', 'Alerta oficial'], ['vecinos', 'Aviso de vecinos'], ['sirena', 'Sirena'], ['no_se_entero', 'No se enteró'], ['otro', 'Otro']]),
  lugarPernocta: opts([
    ['misma_vivienda', 'En la misma vivienda'], ['familiares_amistades', 'Con familiares o amistades'], ['albergue', 'En un albergue'],
    ['arrendado_temporal', 'Arriendo temporal'], ['intemperie_improvisado', 'A la intemperie o improvisado'], ['sin_lugar', 'No tiene lugar']]),
  ingresos: opts([['interrumpida_total', 'Interrumpidos del todo'], ['reducida_temporal', 'Reducidos temporalmente'], ['no_afectada', 'No afectados'], ['otro', 'Otro']]),
  lodo: opts([['nada', 'Nada'], ['poco', 'Poco'], ['mucho', 'Mucho']]),
  acceso: opts([['despejado', 'Despejado'], ['con_escombros', 'Con escombros'], ['bloqueado', 'Bloqueado']]),
  dictamen: opts([['puede_habitarse', 'Puede habitarse'], ['evacuacion_temporal', 'Evacuación temporal'], ['evacuacion_definitiva', 'Evacuación definitiva'], ['nadie_ha_ido', 'Nadie ha ido']])
};

export const NIVELES_DANO = [
  { v: 0, l: 'Sin daño' }, { v: 1, l: 'Leve' }, { v: 2, l: 'Moderado' }, { v: 3, l: 'Severo' }, { v: 4, l: 'Pérdida total' }
];

export const labelOf = (list, value) => list?.find(item => item.v === value)?.l ?? value ?? '';
