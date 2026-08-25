// Per-backend output gain for 16-bit PCM WAV.
//
// Chatterbox renders roughly 11 dB quieter than the XTTS server (measured
// -28.0 LUFS vs -16.8 LUFS on the same line), which is far enough down to be
// hard to hear over anything else running. It leaves ~10 dB of peak headroom,
// so a fixed boost fits without clipping.
//
// Deliberately a FIXED gain per backend, not per-clip normalisation: speak()
// synthesises one sentence at a time, so normalising each clip independently
// would boost quiet sentences harder than loud ones and pump across a single
// utterance. A constant factor preserves the relative dynamics.

const HEADER_MIN = 12;

// Walk the RIFF chunk list rather than assuming data starts at byte 44 —
// some encoders emit LIST/fact chunks before it.
function findDataChunk(buf) {
  if (buf.length < HEADER_MIN) return null;
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') return null;

  let offset = 12;
  let bitsPerSample = 16;

  while (offset + 8 <= buf.length) {
    const id = buf.toString('ascii', offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    const body = offset + 8;

    if (id === 'fmt ' && body + 16 <= buf.length) {
      bitsPerSample = buf.readUInt16LE(body + 14);
    } else if (id === 'data') {
      return { start: body, end: Math.min(body + size, buf.length), bitsPerSample };
    }

    offset = body + size + (size % 2); // chunks are word-aligned
  }
  return null;
}

/**
 * Scale a 16-bit PCM WAV in place. Returns the buffer unchanged if the gain is
 * a no-op, the format isn't 16-bit PCM, or the header can't be parsed — a
 * quieter voice beats a broken one.
 */
export function applyGain(buf, gain) {
  if (!gain || gain === 1) return buf;

  const chunk = findDataChunk(buf);
  if (!chunk || chunk.bitsPerSample !== 16) return buf;

  for (let i = chunk.start; i + 1 < chunk.end; i += 2) {
    const scaled = Math.round(buf.readInt16LE(i) * gain);
    buf.writeInt16LE(Math.max(-32768, Math.min(32767, scaled)), i);
  }
  return buf;
}

export const dbToGain = db => Math.pow(10, db / 20);
