/**
 * Full-text fuzzy search across the loaded catalog (skills + plugins +
 * MCP servers + presets + tools). Each hit carries its category, the
 * id, the display name, and a match score so the CLI / TUI can rank.
 *
 * Scoring is intentionally tiny — no fzf / lev distance — to keep the
 * binary small. Strategy:
 *   · exact id match           → 100
 *   · id prefix                → 80
 *   · id contains              → 60
 *   · name contains            → 50
 *   · description contains     → 30
 *   · tag contains             → 20
 * Sums across the multi-field matches and clamps at 100.
 */
import { CatalogLoader } from '../catalog/index.js';

export type SearchCategory = 'skill' | 'plugin' | 'mcp' | 'preset' | 'tool';

export interface SearchHit {
  category: SearchCategory;
  id: string;
  name: string;
  description: string;
  score: number;
  tags?: string[];
}

export async function searchCatalog(
  query: string,
  loader: CatalogLoader = new CatalogLoader(),
): Promise<SearchHit[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const catalog = await loader.load();
  const hits: SearchHit[] = [];

  const score = (id: string, name: string, description: string, tags: string[] = []): number => {
    const idL = id.toLowerCase();
    const nameL = name.toLowerCase();
    const descL = (description ?? '').toLowerCase();
    let s = 0;
    if (idL === q) s += 100;
    else if (idL.startsWith(q)) s += 80;
    else if (idL.includes(q)) s += 60;
    if (nameL.includes(q)) s += 50;
    if (descL.includes(q)) s += 30;
    if (tags.some((t) => t.toLowerCase().includes(q))) s += 20;
    return Math.min(s, 100);
  };

  for (const item of catalog.skills) {
    const s = score(item.id, item.name, item.description, item.tags ?? []);
    if (s > 0) {
      hits.push({
        category: 'skill',
        id: item.id,
        name: item.name,
        description: item.description,
        score: s,
        tags: item.tags,
      });
    }
  }

  for (const item of catalog.plugins) {
    const s = score(item.id, item.name, item.description, item.tags ?? []);
    if (s > 0) {
      hits.push({
        category: 'plugin',
        id: item.id,
        name: item.name,
        description: item.description,
        score: s,
        tags: item.tags,
      });
    }
  }

  for (const item of catalog.mcpServers) {
    const s = score(item.id, item.name, item.description, item.tags ?? []);
    if (s > 0) {
      hits.push({
        category: 'mcp',
        id: item.id,
        name: item.name,
        description: item.description,
        score: s,
        tags: item.tags,
      });
    }
  }

  for (const item of catalog.presets) {
    const s = score(item.id, item.name, item.description, []);
    if (s > 0) {
      hits.push({
        category: 'preset',
        id: item.id,
        name: item.name,
        description: item.description,
        score: s,
      });
    }
  }

  for (const item of catalog.tools) {
    const s = score(item.id, item.name, item.description, []);
    if (s > 0) {
      hits.push({
        category: 'tool',
        id: item.id,
        name: item.name,
        description: item.description,
        score: s,
      });
    }
  }

  hits.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return hits;
}
