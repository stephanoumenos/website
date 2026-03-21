import { PMTiles, Protocol } from "pmtiles";
import maplibregl from "maplibre-gl";

/**
 * PMTiles source that fetches the entire file once into memory.
 * Workaround for hosts (e.g. Cloudflare Pages) that don't support
 * HTTP range requests.
 */
class BufferSource {
  private pending: Promise<ArrayBuffer> | null = null;
  private buffer: ArrayBuffer | null = null;
  private url: string;

  constructor(url: string) {
    this.url = url;
  }

  getKey() {
    return this.url;
  }

  async getBytes(
    offset: number,
    length: number,
  ): Promise<{ data: ArrayBuffer }> {
    if (!this.buffer) {
      if (!this.pending) {
        this.pending = fetch(this.url).then((r) => r.arrayBuffer());
      }
      this.buffer = await this.pending;
    }
    return { data: this.buffer.slice(offset, offset + length) };
  }
}

let protocol: Protocol | null = null;

export function registerPMTiles(urls: string[]) {
  if (!protocol) {
    protocol = new Protocol();
    maplibregl.addProtocol("pmtiles", protocol.tile);
  }
  for (const url of urls) {
    protocol.add(new PMTiles(new BufferSource(url)));
  }
}
