// Minimal client-side ID3v2 tag reader — extracts song title (TIT2) and
// artist (TPE1) from an MP3 File. Handles ID3v2.3 (plain frame size) and
// ID3v2.4 (synchsafe). Returns {} on anything it can't read.

export interface SongTags {
  title?: string;
  artist?: string;
}

function decodeFrame(bytes: Uint8Array): string {
  const enc = bytes[0];
  const data = bytes.subarray(1);
  let text: string;
  try {
    if (enc === 1) text = new TextDecoder('utf-16').decode(data);        // UTF-16 + BOM
    else if (enc === 2) text = new TextDecoder('utf-16be').decode(data); // UTF-16BE
    else if (enc === 3) text = new TextDecoder('utf-8').decode(data);    // UTF-8
    else text = new TextDecoder('iso-8859-1').decode(data);              // Latin-1
  } catch {
    text = new TextDecoder('utf-8').decode(data);
  }
  return text.replace(/\0+$/g, '').trim();
}

export async function parseId3(file: File): Promise<SongTags> {
  try {
    const head = new Uint8Array(await file.slice(0, 10).arrayBuffer());
    // "ID3"
    if (head[0] !== 0x49 || head[1] !== 0x44 || head[2] !== 0x33) return {};
    const major = head[3]; // 3 or 4
    const tagSize = (head[6] << 21) | (head[7] << 14) | (head[8] << 7) | head[9]; // synchsafe
    const buf = new Uint8Array(await file.slice(0, 10 + tagSize).arrayBuffer());

    const out: SongTags = {};
    let offset = 10;
    while (offset + 10 <= buf.length) {
      const id = String.fromCharCode(buf[offset], buf[offset + 1], buf[offset + 2], buf[offset + 3]);
      if (!/^[A-Z0-9]{4}$/.test(id)) break; // padding or end of frames

      const s4 = buf[offset + 4], s5 = buf[offset + 5], s6 = buf[offset + 6], s7 = buf[offset + 7];
      const frameSize = major === 4
        ? (s4 << 21) | (s5 << 14) | (s6 << 7) | s7   // v2.4 synchsafe
        : (s4 << 24) | (s5 << 16) | (s6 << 8) | s7;  // v2.3 plain
      if (frameSize <= 0) break;

      const start = offset + 10;
      const frame = buf.subarray(start, start + frameSize);
      if (id === 'TIT2') out.title = decodeFrame(frame);
      else if (id === 'TPE1') out.artist = decodeFrame(frame);

      if (out.title && out.artist) break;
      offset = start + frameSize;
    }
    return out;
  } catch {
    return {};
  }
}

// Fallback: turn a filename into a readable title.
// "Kickstart_My_Heart__2021-_Remaster_.mp3" -> "Kickstart My Heart 2021 Remaster"
export function titleFromFilename(name: string): string {
  return name
    .replace(/\.[a-z0-9]+$/i, '')      // strip extension
    .replace(/[_]+/g, ' ')             // underscores -> spaces
    .replace(/\s*-\s*/g, ' ')          // dashes -> spaces
    .replace(/\s{2,}/g, ' ')           // collapse spaces
    .trim();
}
