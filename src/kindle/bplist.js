import { readFileSync } from 'node:fs';
import bplistParser from 'bplist-parser';

const signature = Buffer.from('bplist00');

function readBigEndianInteger(buffer, offset, length) {
  let value = 0n;
  for (let index = 0; index < length; index += 1) {
    value = (value << 8n) | BigInt(buffer[offset + index]);
  }
  return Number(value);
}

export function carveBinaryPlists(buffer) {
  const starts = [];
  for (let offset = 0; ; offset += signature.length) {
    offset = buffer.indexOf(signature, offset);
    if (offset === -1) break;
    starts.push(offset);
  }

  const results = [];
  for (let index = 0; index < starts.length; index += 1) {
    const start = starts[index];
    const limit = starts[index + 1] ?? buffer.length;

    for (let end = start + 40; end <= limit; end += 1) {
      const trailer = end - 32;
      const offsetSize = buffer[trailer + 6];
      const referenceSize = buffer[trailer + 7];
      if (offsetSize < 1 || offsetSize > 8 || referenceSize < 1 || referenceSize > 8) {
        continue;
      }

      const objectCount = readBigEndianInteger(buffer, trailer + 8, 8);
      const topObject = readBigEndianInteger(buffer, trailer + 16, 8);
      const offsetTable = readBigEndianInteger(buffer, trailer + 24, 8);
      const expectedEnd = start + offsetTable + objectCount * offsetSize + 32;

      if (
        objectCount < 1 ||
        objectCount > 32_768 ||
        topObject >= objectCount ||
        offsetTable < signature.length ||
        expectedEnd !== end
      ) {
        continue;
      }

      try {
        const [plist] = bplistParser.parseBuffer(buffer.subarray(start, end));
        results.push(plist);
        break;
      } catch {
        // A SQLite page can contain bytes that resemble a plist trailer.
      }
    }
  }

  return results;
}

export function unarchiveKeyedPlist(archive) {
  if (!archive || archive.$archiver !== 'NSKeyedArchiver' || !archive.$objects) {
    return archive;
  }

  const objects = archive.$objects;
  const resolving = new Set();

  function resolve(value) {
    if (Array.isArray(value)) return value.map(resolve);
    if (!value || typeof value !== 'object') return value;

    if (Number.isInteger(value.UID)) {
      if (resolving.has(value.UID)) return undefined;
      resolving.add(value.UID);
      const resolved = resolve(objects[value.UID]);
      resolving.delete(value.UID);
      return resolved;
    }

    if (Array.isArray(value['NS.keys']) && Array.isArray(value['NS.objects'])) {
      return Object.fromEntries(
        value['NS.keys'].map((key, index) => [String(resolve(key)), resolve(value['NS.objects'][index])]),
      );
    }

    if (Array.isArray(value['NS.objects'])) return value['NS.objects'].map(resolve);

    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== '$class')
        .map(([key, nestedValue]) => [key, resolve(nestedValue)]),
    );
  }

  return resolve(archive.$top.root);
}

export function readArchivedObjects(paths) {
  return paths.flatMap((path) => carveBinaryPlists(readFileSync(path)).map(unarchiveKeyedPlist));
}
