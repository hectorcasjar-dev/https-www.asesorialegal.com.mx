// netlify/functions/generar-demanda.js
//
// Esta función corre en el servidor de Netlify, NUNCA en el navegador.
// Por eso es el único lugar seguro para comparar la contraseña y para
// guardar la clave real de la API de Anthropic.
//
// Variables de entorno que debes configurar en Netlify
// (Site settings → Environment variables) — NUNCA las escribas
// directamente en este archivo ni en el HTML:
//   ADMIN_PASSWORD      -> la contraseña que solo tú conoces
//   ANTHROPIC_API_KEY   -> tu clave real de la API de Anthropic

exports.handler = async function (event) {
  // Encabezados CORS: solo tu propio dominio puede llamar a esta función.
  // Aceptamos las dos variantes (con y sin "www") para que no falle
  // según cómo haya escrito la dirección quien visite el sitio.
  const ALLOWED_ORIGINS = [
    'https://www.asesorialegal.com.mx',
    'https://asesorialegal.com.mx',
  ];
  const requestOrigin = event.headers.origin || event.headers.Origin || '';
  const originToUse = ALLOWED_ORIGINS.includes(requestOrigin) ? requestOrigin : ALLOWED_ORIGINS[0];
  const headers = {
    'Access-Control-Allow-Origin': originToUse,
    'Access-Control-Allow-Headers': 'Content-Type, x-admin-password',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  // El navegador manda una petición "OPTIONS" antes del POST real; hay que responderla.
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Método no permitido' }) };
  }

  // 1) Verificar la contraseña ANTES de gastar un solo token en la IA.
  const password = event.headers['x-admin-password'] || '';
  if (!process.env.ADMIN_PASSWORD || password !== process.env.ADMIN_PASSWORD) {
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({ error: 'Contraseña incorrecta o faltante.' }),
    };
  }

  // 2) Leer los datos del expediente que mandó el navegador.
  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Cuerpo de la petición inválido.' }) };
  }

  const { systemPrompt, userPrompt } = payload;
  if (!systemPrompt || !userPrompt) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Faltan systemPrompt o userPrompt.' }) };
  }

  // 3) Ya con la contraseña validada, llamar a Anthropic usando TU clave,
  //    que solo existe en esta función, nunca en el navegador del visitante.
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1500,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({ error: 'Error de la API de Anthropic', detalle: data }),
      };
    }

    return { statusCode: 200, headers, body: JSON.stringify(data) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Error interno', detalle: err.message }) };
  }
};
