import { inflateRawSync } from "node:zlib";

/** Read an xlsx sheet into a grid. Inline strings (t="str" and t="inlineStr") and shared strings both work. */
export function parseXlsxGrid(bytes: Uint8Array): string[][] {
  const files = unzip(Buffer.from(bytes));
  const sheetName =
    [...files.keys()].find((name) => /xl\/worksheets\/sheet1\.xml$/.test(name)) ??
    [...files.keys()].find((name) => /xl\/worksheets\/sheet\d+\.xml$/.test(name));
  if (!sheetName) throw new Error("The workbook has no sheet.");
  const shared = readSharedStrings(files.get("xl/sharedStrings.xml"));
  const xml = files.get(sheetName)?.toString("utf8") ?? "";
  return readSheet(xml, shared);
}

function readSharedStrings(file: Buffer | undefined): string[] {
  if (!file) return [];
  const xml = file.toString("utf8");
  const out: string[] = [];
  const items = xml.match(/<si[\s>][\s\S]*?<\/si>/g) ?? [];
  for (const item of items) {
    const parts = [...item.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((match) => decodeXml(match[1] ?? ""));
    out.push(parts.join(""));
  }
  return out;
}

function readSheet(xml: string, shared: string[]): string[][] {
  const rows: string[][] = [];
  const rowXml = xml.match(/<row[\s>][\s\S]*?<\/row>/g) ?? [];
  for (const row of rowXml) {
    const cells = [...row.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)];
    const values: string[] = [];
    let cursor = 0;
    for (const cell of cells) {
      const attrs = cell[1] ?? "";
      const body = cell[2] ?? "";
      const ref = /r="([A-Z]+)\d+"/i.exec(attrs)?.[1];
      const index = ref ? columnIndex(ref) : cursor;
      while (values.length < index) values.push("");
      values[index] = cellText(attrs, body, shared);
      cursor = index + 1;
    }
    if (values.some((value) => value.trim() !== "")) rows.push(values);
  }
  return rows;
}

function cellText(attrs: string, body: string, shared: string[]): string {
  const type = /t="([^"]+)"/.exec(attrs)?.[1] ?? "";
  if (type === "inlineStr" || /<is[\s>]/.test(body)) {
    const parts = [...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((match) => decodeXml(match[1] ?? ""));
    return parts.join("");
  }
  const raw = decodeXml(/<v[^>]*>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? "");
  if (type === "s") {
    const index = Number(raw);
    return shared[index] ?? "";
  }
  return raw;
}

function columnIndex(letters: string): number {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&");
}

function unzip(data: Buffer): Map<string, Buffer> {
  const eocd = data.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error("That file is not an xlsx workbook.");
  const count = data.readUInt16LE(eocd + 10);
  let offset = data.readUInt32LE(eocd + 16);
  const files = new Map<string, Buffer>();
  for (let i = 0; i < count; i++) {
    if (data.readUInt32LE(offset) !== 0x02014b50) break;
    const method = data.readUInt16LE(offset + 10);
    const compressed = data.readUInt32LE(offset + 20);
    const nameLen = data.readUInt16LE(offset + 28);
    const extraLen = data.readUInt16LE(offset + 30);
    const commentLen = data.readUInt16LE(offset + 32);
    const localOffset = data.readUInt32LE(offset + 42);
    const name = data.subarray(offset + 46, offset + 46 + nameLen).toString("utf8");
    const localNameLen = data.readUInt16LE(localOffset + 26);
    const localExtraLen = data.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localNameLen + localExtraLen;
    const blob = data.subarray(start, start + compressed);
    const content = method === 0 ? blob : method === 8 ? inflateRawSync(blob) : null;
    if (content) files.set(name, content);
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}
