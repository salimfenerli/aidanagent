/**
 * Kaynak kodu ustunde statik analiz yardimcilari.
 * ui.js <-> worker.js ikizlik testi ve hijyen testleri kullanir.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

function readRaw(file) {
  return fs.readFileSync(path.join(ROOT, file));
}
function readText(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

/**
 * Ust seviye bir bildirimin kaynagini isimle cikarir (suslu parantez esleyerek).
 * Desteklenen: `function NAME(...) {...}`, `var NAME = {...};`, `var NAME = [...];`
 * String/yorum icindeki parantezler atlanir, yoksa sayim kayar.
 */
function extractDecl(source, name) {
  const patterns = [
    new RegExp('^function\\s+' + name + '\\s*\\(', 'm'),
    new RegExp('^(?:var|let|const)\\s+' + name + '\\s*=', 'm'),
  ];
  let start = -1;
  for (const re of patterns) {
    const m = re.exec(source);
    if (m) { start = m.index; break; }
  }
  if (start < 0) return null;

  let i = start, depth = 0, opened = false;
  let inS = null, inLine = false, inBlock = false;
  while (i < source.length) {
    const c = source[i], n = source[i + 1];
    if (inLine) { if (c === '\n') inLine = false; i++; continue; }
    if (inBlock) { if (c === '*' && n === '/') { inBlock = false; i += 2; continue; } i++; continue; }
    if (inS) {
      if (c === '\\') { i += 2; continue; }
      if (c === inS) inS = null;
      i++; continue;
    }
    if (c === '/' && n === '/') { inLine = true; i += 2; continue; }
    if (c === '/' && n === '*') { inBlock = true; i += 2; continue; }
    if (c === '"' || c === "'" || c === '`') { inS = c; i++; continue; }
    if (c === '{' || c === '[') { depth++; opened = true; i++; continue; }
    if (c === '}' || c === ']') {
      depth--; i++;
      if (opened && depth === 0) {
        // `var X = {...};` icin noktali virgulu de al
        while (i < source.length && /[\s;]/.test(source[i])) { if (source[i] === ';') { i++; break; } i++; }
        return source.slice(start, i);
      }
      continue;
    }
    i++;
  }
  return null;
}

/** Karsilastirma icin satir sonu + satir sonu bosluklarini normalize et. */
function normalize(code) {
  return code.replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').trim();
}

module.exports = { ROOT, readRaw, readText, extractDecl, normalize };
