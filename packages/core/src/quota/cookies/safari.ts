/**
 * Safari cookie extraction — parses the `Cookies.binarycookies` format.
 * Not encrypted, just a packed binary layout:
 *   magic "cook" | u32be page_count | u32be page_size[page_count] | pages…
 * Each page: 0x00000100 | u32le cookie_count | u32le offset[count] | 0 | cookies
 * Each cookie: u32le size | 4 | u32le flags | 4 | u32le url,name,path,value off |
 *   8 end | f64le expiry(mac-2001) | f64le creation | null-terminated strings.
 */
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { type Cookie, hostMatches } from './types.js';

const PATHS = [
  path.join(os.homedir(), 'Library', 'Cookies', 'Cookies.binarycookies'),
  path.join(
    os.homedir(),
    'Library',
    'Containers',
    'com.apple.Safari',
    'Data',
    'Library',
    'Cookies',
    'Cookies.binarycookies',
  ),
];

function cstr(buf: Buffer, start: number): string {
  let end = start;
  while (end < buf.length && buf[end] !== 0) end++;
  return buf.toString('utf8', start, end);
}

function parsePage(buf: Buffer, base: number, domains: string[], out: Cookie[]): void {
  // buf is the whole file; base is the page start.
  const count = buf.readUInt32LE(base + 4);
  for (let i = 0; i < count; i++) {
    const cookieOff = base + buf.readUInt32LE(base + 8 + i * 4);
    if (cookieOff + 48 > buf.length) continue;
    const urlOff = buf.readUInt32LE(cookieOff + 16);
    const nameOff = buf.readUInt32LE(cookieOff + 20);
    const pathOff = buf.readUInt32LE(cookieOff + 24);
    const valueOff = buf.readUInt32LE(cookieOff + 28);
    const expiry = buf.readDoubleLE(cookieOff + 40);
    const domain = cstr(buf, cookieOff + urlOff);
    if (!hostMatches(domain, domains)) continue;
    out.push({
      name: cstr(buf, cookieOff + nameOff),
      value: cstr(buf, cookieOff + valueOff),
      domain,
      path: cstr(buf, cookieOff + pathOff),
      // mac epoch (2001-01-01) seconds → unix ms
      expires: expiry ? Math.round((expiry + 978307200) * 1000) : undefined,
      source: 'Safari',
    });
  }
}

export async function safariCookies(domains: string[]): Promise<Cookie[]> {
  const out: Cookie[] = [];
  for (const p of PATHS) {
    let buf: Buffer;
    try {
      buf = await fs.readFile(p);
    } catch {
      continue;
    }
    if (buf.length < 8 || buf.toString('latin1', 0, 4) !== 'cook') continue;
    const pageCount = buf.readUInt32BE(4);
    const sizes: number[] = [];
    for (let i = 0; i < pageCount; i++) sizes.push(buf.readUInt32BE(8 + i * 4));
    let offset = 8 + pageCount * 4;
    for (const size of sizes) {
      try {
        parsePage(buf, offset, domains, out);
      } catch {
        /* skip malformed page */
      }
      offset += size;
    }
    if (out.length) break; // first store with hits wins
  }
  return out;
}
