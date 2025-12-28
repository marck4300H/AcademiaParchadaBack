/**
 * Utilidades para manejo de franjas horarias
 */

/**
 * Suma horas a una hora en formato "HH:MM:SS"
 * @param {string} hora - Hora en formato "14:00:00"
 * @param {number} horasASumar - Cantidad de horas a sumar
 * @returns {string} - Hora resultante en formato "HH:MM:SS"
 */
export const sumarHoras = (hora, horasASumar) => {
  const [hh, mm, ss] = hora.split(':').map(Number);
  const fecha = new Date(2000, 0, 1, hh, mm, ss);
  fecha.setHours(fecha.getHours() + horasASumar);
  
  const nuevaHora = fecha.getHours().toString().padStart(2, '0');
  const nuevosMinutos = fecha.getMinutes().toString().padStart(2, '0');
  const nuevosSegundos = fecha.getSeconds().toString().padStart(2, '0');
  
  return `${nuevaHora}:${nuevosMinutos}:${nuevosSegundos}`;
};

/**
 * Calcula la diferencia en horas entre dos horas
 * @param {string} horaInicio - Hora inicio "14:00:00"
 * @param {string} horaFin - Hora fin "18:00:00"
 * @returns {number} - Cantidad de horas
 */
export const calcularDiferenciaHoras = (horaInicio, horaFin) => {
  const [hhInicio, mmInicio, ssInicio] = horaInicio.split(':').map(Number);
  const [hhFin, mmFin, ssFin] = horaFin.split(':').map(Number);
  
  const inicio = new Date(2000, 0, 1, hhInicio, mmInicio, ssInicio);
  const fin = new Date(2000, 0, 1, hhFin, mmFin, ssFin);
  
  const diferenciaMs = fin - inicio;
  const diferenciaHoras = diferenciaMs / (1000 * 60 * 60);
  
  return diferenciaHoras;
};

/**
 * Divide un bloque de tiempo en franjas de 1 hora
 * @param {string} horaInicio - "14:00:00"
 * @param {string} horaFin - "18:00:00"
 * @returns {Array} - Array de objetos {hora_inicio, hora_fin}
 */
export const dividirEnFranjasDeUnaHora = (horaInicio, horaFin) => {
  const totalHoras = calcularDiferenciaHoras(horaInicio, horaFin);
  const franjas = [];
  
  for (let i = 0; i < totalHoras; i++) {
    const inicio = sumarHoras(horaInicio, i);
    const fin = sumarHoras(horaInicio, i + 1);
    
    franjas.push({
      hora_inicio: inicio,
      hora_fin: fin
    });
  }
  
  return franjas;
};

/**
 * Busca franjas consecutivas que cubran la duración requerida
 * @param {Array} franjas - Array de franjas disponibles
 * @param {string} horaInicio - Hora de inicio deseada
 * @param {number} duracionHoras - Duración en horas
 * @returns {Array|null} - Array de IDs de franjas o null si no hay disponibles
 */
export const buscarFranjasConsecutivas = (franjas, horaInicio, duracionHoras) => {
  // Ordenar franjas por hora de inicio
  const franjasOrdenadas = [...franjas].sort((a, b) => 
    a.hora_inicio.localeCompare(b.hora_inicio)
  );
  
  const franjasNecesarias = [];
  let horaActual = horaInicio;
  
  for (let i = 0; i < duracionHoras; i++) {
    const horaFin = sumarHoras(horaActual, 1);
    
    // Buscar la franja que coincida exactamente
    const franja = franjasOrdenadas.find(f => 
      f.hora_inicio === horaActual && f.hora_fin === horaFin
    );
    
    if (!franja) {
      console.log(`❌ No se encontró franja para ${horaActual} - ${horaFin}`);
      return null; // No hay franja disponible para esta hora
    }
    
    franjasNecesarias.push(franja.id);
    horaActual = horaFin; // Avanzar a la siguiente hora
  }
  
  return franjasNecesarias;
};

/**
 * Valida que una hora esté en formato correcto
 * @param {string} hora - "14:00:00"
 * @returns {boolean}
 */
export const validarFormatoHora = (hora) => {
  const regex = /^([0-1][0-9]|2[0-3]):([0-5][0-9]):([0-5][0-9])$/;
  return regex.test(hora);
};
