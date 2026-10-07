#!/usr/bin/env node
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Allow HTTPS to tvc.homeserver.hu even if intermediate cert is missing
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const outDir = path.join(repoRoot, 'web', 'catalog');
const outFile = path.join(outDir, 'programs.json');
const outShellFile = path.join(repoRoot, 'web', 'shell', 'catalog.json');

const baseUrl = 'https://tvc.homeserver.hu/html/';
const localHtmlDirs = [
  path.join(repoRoot, '..', 'TVCWEB', 'html'),
  'c:/Users/kks/Documents/Antigravity/TVCWEB/html'
];
const pageNames = Array.from('0123456789abcdefghijklmnopqrstuvwxyz');

function stripHtml(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeUrl(value, pageUrl) {
  if (!value) return '';
  const url = value.trim();
  if (/^(https?:)?\/\//i.test(url)) return url.replace(/^http:/i, 'https:');
  return new URL(url, pageUrl).href;
}

function parseDate(str) {
  if (!str) return '';
  const value = String(str).trim();

  const dayMonthYear = value.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (dayMonthYear) {
    return `${dayMonthYear[3]}-${dayMonthYear[2].padStart(2, '0')}-${dayMonthYear[1].padStart(2, '0')}`;
  }

  const yearMonthDay = value.match(/^(\d{4})[.-](\d{1,2})[.-](\d{1,2})$/);
  if (yearMonthDay) {
    return `${yearMonthDay[1]}-${yearMonthDay[2].padStart(2, '0')}-${yearMonthDay[3].padStart(2, '0')}`;
  }

  return value;
}

function fileTypeFromName(name) {
  const file = String(name || '').toLowerCase();
  if (/\.zip$/i.test(file)) return 'zip';
  if (/(\.cas|\.com|\.bas|\.prg)$/i.test(file)) return 'cas';
  if (/(\.dsk|\.img)$/i.test(file)) return 'dsk';
  if (/(\.wav|\.tap|\.tzx|\.cdt)$/i.test(file)) return 'wav';
  if (/(\.rom|\.bin)$/i.test(file)) return 'rom';
  return 'ismeretlen';
}

function collectPageEntries(html, pageUrl) {
  const entries = [];
  const seen = new Set();

  // 1. Try structured .game-item cards first
  const gameItemChunks = html.split('<div class="game-item">').slice(1);
  if (gameItemChunks.length > 0) {
    for (const chunk of gameItemChunks) {
      const titleMatch = chunk.match(/<h2>\s*([^<]+)\s*<\/h2>/i);
      if (!titleMatch) continue;
      const title = stripHtml(titleMatch[1]);

      const typeMatch = chunk.match(/<div class="game-header">[\s\S]*?<span>\s*([^<]+)\s*<\/span>/i);
      const category = typeMatch ? stripHtml(typeMatch[1]) : 'Játék';

      const imgMatch = chunk.match(/class="main-thumb"[^>]*src="([^"]+)"|src="([^"]+)"[^>]*class="main-thumb"/i);
      const rawImg = imgMatch ? (imgMatch[1] || imgMatch[2]) : '';
      const imageUrl = rawImg ? normalizeUrl(rawImg, pageUrl) : '';

      const dlMatch = chunk.match(/href="([^"]+)"[^>]*class="download-btn"|class="download-btn"[^>]*href="([^"]+)"/i);
      const rawDl = dlMatch ? (dlMatch[1] || dlMatch[2]) : '';
      if (!rawDl) continue;
      const downloadUrl = normalizeUrl(rawDl, pageUrl);

      const descMatch = chunk.match(/<div class="description">\s*([\s\S]*?)\s*<\/div>/i);
      const description = descMatch ? stripHtml(descMatch[1]) : `TVC ${category}`;

      const yearMatch = chunk.match(/Kiadás éve:[\s\S]*?class="meta-value">\s*([^<]+)\s*<\/div>/i);
      const date = yearMatch ? parseDate(stripHtml(yearMatch[1])) : '';

      const fileName = rawDl.split('/').pop() || (title + '.zip');
      const key = `${downloadUrl}|${title}`;
      if (seen.has(key)) continue;
      seen.add(key);

      entries.push({
        title,
        description,
        image_url: imageUrl,
        download_url: downloadUrl,
        file_name: fileName,
        type: category,
        date
      });
    }
  }

  // 2. Generic fallback for other download links
  const pageImg = (html.match(/<img\b[^>]*src=(['"])(.*?)\1[^>]*>/i) || [])[2] || '';
  const pageDate = (html.match(/\b(\d{4}[.-]\d{2}[.-]\d{2}|\d{1,2}\.\d{1,2}\.\d{4})\b/) || [])[1] || '';
  const links = [...html.matchAll(/<a\b[^>]*href=(['"])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi)];

  for (const match of links) {
    const href = normalizeUrl(match[2], pageUrl);
    const text = stripHtml(match[3]);
    const urlLower = href.toLowerCase();

    if (!/(\.zip|\.cas|\.wav|\.tap|\.dsk|\.img|\.bin|\.rom)(\?.*)?$/i.test(urlLower)) continue;

    const label = text || href.split('/').pop() || 'Program';
    const key = `${href}|${label}`;
    if (seen.has(key)) continue;
    seen.add(key);

    entries.push({
      title: label.replace(/\.[^.]+$/i, '').trim() || 'Program',
      description: text || 'TVC program',
      image_url: pageImg ? normalizeUrl(pageImg, pageUrl) : '',
      download_url: href,
      file_name: href.split('/').pop() || 'program.zip',
      type: fileTypeFromName(href),
      date: parseDate(pageDate)
    });
  }

  return entries;
}

async function loadPageHtml(pageChar) {
  const pageFileName = `tvc_programok_${pageChar}.html`;
  const decoder = new TextDecoder('windows-1250');

  // Check local directories first for speed and offline stability
  for (const dir of localHtmlDirs) {
    const localPath = path.join(dir, pageFileName);
    if (existsSync(localPath)) {
      const buf = readFileSync(localPath);
      return { html: decoder.decode(buf), pageUrl: baseUrl + pageFileName };
    }
  }

  // Fallback to fetch over network
  const url = new URL(pageFileName, baseUrl).href;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  return { html: decoder.decode(buf), pageUrl: url };
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  mkdirSync(path.dirname(outShellFile), { recursive: true });

  const programs = [];
  const seen = new Set();

  for (const pageChar of pageNames) {
    try {
      const { html, pageUrl } = await loadPageHtml(pageChar);
      const entries = collectPageEntries(html, pageUrl);

      for (const entry of entries) {
        const key = `${entry.download_url}|${entry.title}`;
        if (seen.has(key)) continue;
        seen.add(key);
        programs.push(entry);
      }
    } catch (e) {
      // Missing page is expected on some letters
    }
  }

  const jsonStr = JSON.stringify(programs, null, 2) + '\n';
  writeFileSync(outFile, jsonStr, 'utf8');
  writeFileSync(outShellFile, jsonStr, 'utf8');
  console.log(`Wrote ${programs.length} catalog entries to ${outFile} and ${outShellFile}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
