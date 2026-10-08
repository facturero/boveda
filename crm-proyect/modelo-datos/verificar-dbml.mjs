#!/usr/bin/env node
/**
 * Compara `crm.dbml` con las migraciones reales de cada servicio y avisa de lo que se desfasó.
 *
 *   node verificar-dbml.mjs [ruta/a/cmr-proyect]      (por defecto: C:/Users/sansh/cmr-proyect)
 *
 * Qué mira, por servicio (cada servicio es un `schema` del DBML):
 *   · que cada tabla que dejan las migraciones esté en el DBML, y que el DBML no tenga tablas que ya no existen;
 *   · que cada tabla tenga las MISMAS columnas (createTable + addColumn - removeColumn, aplicando renameColumn).
 * No mira tipos, índices ni relaciones: eso se revisa a mano al migrar. Sale con código 1 si hay diferencias.
 *
 * Solo lee el bloque `up` de cada migración y solo `.js`/`.cjs` (los `.bak` no cuentan). Los SQL crudos
 * (`sequelize.query('ALTER TABLE ...')`) no se interpretan: si añaden columnas, van en EXTRAS con el motivo.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const aquí = path.dirname(fileURLToPath(import.meta.url));
const raíz = path.resolve(process.argv[2] ?? 'C:/Users/sansh/cmr-proyect');

/** carpeta del servicio → schema del DBML */
const SERVICIOS = {
  'auth-service': 'auth',
  'organization-service': 'organization',
  'tax-service': 'tax',
  'customer-service': 'customer',
  'product-service': 'product',
  'inventory-service': 'inventory',
  'billing-service': 'billing',
  'fiscal-ecuador': 'fiscal',
  'document-service': 'document',
  'plugin-catalog-service': 'plugin_catalog',
  'notification-service': 'notification',
  'audit-log-service': 'audit',
  'assistant-service': 'assistant',
};

/** Columnas que existen en la base pero NO salen de createTable/addColumn (SQL crudo). tabla → motivo */
const EXTRAS = {
  'inventory.warehouses': { columnas: ['default_org_id'], motivo: 'columna generada por SQL crudo (garantiza una sola bodega por defecto por organización)' },
};

// ---------------------------------------------------------------- migraciones
function bloqueUp(texto) {
  const i = texto.search(/async\s+down\s*\(/);
  return i === -1 ? texto : texto.slice(0, i);
}

/** Claves de primer nivel de un literal `{ a: ..., b: ... }` que empieza en `inicio` (la posición de la `{`). */
function clavesDelObjeto(texto, inicio) {
  const claves = [];
  let prof = 0;
  let comilla = null;
  let esperaClave = false;
  for (let i = inicio; i < texto.length; i++) {
    const c = texto[i];
    if (comilla) {
      if (c === '\\') i++;
      else if (c === comilla) comilla = null;
      continue;
    }
    if (c === '/' && texto[i + 1] === '/') {
      while (i < texto.length && texto[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && texto[i + 1] === '*') {
      i = texto.indexOf('*/', i + 2) + 1;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      if (prof === 1 && esperaClave) {
        const fin = texto.indexOf(c, i + 1);
        const nombre = texto.slice(i + 1, fin);
        if (/^\s*:/.test(texto.slice(fin + 1, fin + 6))) claves.push(nombre);
        i = fin;
        esperaClave = false;
        continue;
      }
      comilla = c;
      continue;
    }
    if (c === '{' || c === '(' || c === '[') {
      prof++;
      if (prof === 1) esperaClave = true;
      continue;
    }
    if (c === '}' || c === ')' || c === ']') {
      prof--;
      if (prof === 0) break;
      continue;
    }
    if (prof === 1 && c === ',') {
      esperaClave = true;
      continue;
    }
    if (prof === 1 && esperaClave && /[A-Za-z_]/.test(c)) {
      const m = /^([A-Za-z_]\w*)\s*:/.exec(texto.slice(i));
      if (m) {
        claves.push(m[1]);
        i += m[1].length - 1;
      }
      esperaClave = false;
    }
  }
  return claves;
}

function tablasDeMigraciones(carpeta) {
  const dir = path.join(carpeta, 'migrations');
  const tablas = new Map(); // nombre → Set(columnas)
  if (!fs.existsSync(dir)) return tablas;

  const archivos = fs.readdirSync(dir).filter((f) => /\.c?js$/.test(f)).sort();
  for (const f of archivos) {
    const up = bloqueUp(fs.readFileSync(path.join(dir, f), 'utf8'));

    for (const m of up.matchAll(/createTable\(\s*['"`](\w+)['"`]\s*,\s*\{/g)) {
      const inicio = m.index + m[0].length - 1;
      tablas.set(m[1], new Set(clavesDelObjeto(up, inicio)));
    }
    for (const m of up.matchAll(/addColumn\(\s*['"`](\w+)['"`]\s*,\s*['"`](\w+)['"`]/g)) {
      tablas.get(m[1])?.add(m[2]);
    }
    for (const m of up.matchAll(/removeColumn\(\s*['"`](\w+)['"`]\s*,\s*['"`](\w+)['"`]/g)) {
      tablas.get(m[1])?.delete(m[2]);
    }
    for (const m of up.matchAll(/renameColumn\(\s*['"`](\w+)['"`]\s*,\s*['"`](\w+)['"`]\s*,\s*['"`](\w+)['"`]/g)) {
      const cols = tablas.get(m[1]);
      if (cols?.delete(m[2])) cols.add(m[3]);
    }
    for (const m of up.matchAll(/dropTable\(\s*['"`](\w+)['"`]/g)) {
      tablas.delete(m[1]);
    }
  }
  return tablas;
}

// ---------------------------------------------------------------------- DBML
function tablasDelDbml(texto) {
  const tablas = new Map(); // "schema.tabla" → Set(columnas)
  for (const m of texto.matchAll(/^Table\s+(\w+)\.(\w+)\s*\{([\s\S]*?)^\}/gm)) {
    const cuerpo = m[3].split(/^\s*indexes\s*\{/m)[0];
    const columnas = new Set();
    for (const linea of cuerpo.split('\n')) {
      const l = linea.trim();
      if (!l || l.startsWith('//') || l.startsWith('Note')) continue;
      const nombre = /^(\w+)\s+\S/.exec(l)?.[1];
      if (nombre) columnas.add(nombre);
    }
    tablas.set(`${m[1]}.${m[2]}`, columnas);
  }
  return tablas;
}

// --------------------------------------------------------------------- cotejo
const dbml = tablasDelDbml(fs.readFileSync(path.join(aquí, 'crm.dbml'), 'utf8'));
const diferencias = [];
let tablasRevisadas = 0;

for (const [servicio, schema] of Object.entries(SERVICIOS)) {
  const carpeta = [path.join(raíz, 'backend', servicio)].find((p) => fs.existsSync(p));
  if (!carpeta) {
    console.log(`(salto ${servicio}: no está en ${raíz})`);
    continue;
  }
  const reales = tablasDeMigraciones(carpeta);
  const enDbml = new Set([...dbml.keys()].filter((k) => k.startsWith(schema + '.')).map((k) => k.slice(schema.length + 1)));

  for (const [tabla, columnas] of reales) {
    tablasRevisadas++;
    const clave = `${schema}.${tabla}`;
    if (!dbml.has(clave)) {
      diferencias.push(`${clave}: la tabla existe en las migraciones y NO está en crm.dbml`);
      continue;
    }
    const extras = new Set(EXTRAS[clave]?.columnas ?? []);
    const delDbml = dbml.get(clave);
    for (const c of columnas) if (!delDbml.has(c)) diferencias.push(`${clave}.${c}: columna en las migraciones y NO en crm.dbml`);
    for (const c of delDbml) if (!columnas.has(c) && !extras.has(c)) diferencias.push(`${clave}.${c}: columna en crm.dbml que NINGUNA migración crea`);
  }
  for (const tabla of enDbml) {
    if (!reales.has(tabla)) diferencias.push(`${schema}.${tabla}: tabla en crm.dbml que ninguna migración deja creada`);
  }
}

if (diferencias.length === 0) {
  console.log(`OK — crm.dbml coincide con las migraciones (${tablasRevisadas} tablas revisadas en ${Object.keys(SERVICIOS).length} servicios).`);
} else {
  console.log(`crm.dbml está desfasado (${diferencias.length} diferencia(s)):`);
  for (const d of diferencias) console.log('  - ' + d);
  process.exitCode = 1;
}
