import { mkdir, open, readFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';

export interface MediaStorage {
  write(id: string, bytes: Buffer): Promise<void>;
  read(id: string): Promise<Buffer>;
  remove(id: string): Promise<void>;
}
export class LocalMediaStorage implements MediaStorage {
  constructor(private directory: string) {}
  private path(id: string) {
    return resolve(this.directory, `${z.uuid().parse(id)}.webp`);
  }
  async write(id: string, bytes: Buffer) {
    const path = this.path(id);
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const file = await open(path, 'wx', 0o600);
    try {
      await file.writeFile(bytes);
      await file.sync();
    } finally {
      await file.close();
    }
  }
  read(id: string) {
    return readFile(this.path(id));
  }
  async remove(id: string) {
    try {
      await unlink(this.path(id));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
}
