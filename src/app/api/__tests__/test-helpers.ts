import { vi } from "vitest";

export interface FakeDoc { id: string; exists: boolean; data: () => unknown }
export function fakeDoc(id: string, data: unknown | undefined): FakeDoc {
  return { id, exists: data !== undefined, data: () => data };
}

/** Build a chainable Firestore mock. `seed` maps "collection/doc" -> data and
 *  "collection" -> array of {id,...data} for list queries. */
export function makeDb(seed: {
  docs?: Record<string, unknown>;
  collections?: Record<string, Array<{ id: string } & Record<string, unknown>>>;
}) {
  const docs = seed.docs ?? {};
  const collections = seed.collections ?? {};
  const sets: Array<{ path: string; data: unknown }> = [];
  const updates: Array<{ path: string; data: unknown }> = [];
  const deletes: Array<{ path: string }> = [];

  function collection(name: string) {
    const list = collections[name] ?? [];
    const query = {
      _items: list.slice(),
      orderBy(field: string, dir: "asc" | "desc" = "asc") {
        this._items.sort((a, b) => {
          const av = String(a[field] ?? ""); const bv = String(b[field] ?? "");
          return dir === "desc" ? bv.localeCompare(av) : av.localeCompare(bv);
        });
        return this;
      },
      where() { return this; },
      limit(n: number) { this._items = this._items.slice(0, n); return this; },
      async get() {
        return { empty: this._items.length === 0, docs: this._items.map((it) => fakeDoc(it.id, it)) };
      },
    };
    return {
      ...query,
      doc(id: string) {
        const path = `${name}/${id}`;
        return {
          id,
          path,
          async get() { return fakeDoc(id, docs[path]); },
          async set(data: unknown) { sets.push({ path, data }); docs[path] = data; },
          async update(data: unknown) { updates.push({ path, data }); },
          async delete() { deletes.push({ path }); delete docs[path]; },
          collection(sub: string) { return collection(`${name}/${id}/${sub}`); },
        };
      },
      async add(data: Record<string, unknown>) {
        const id = `gen-${Math.random().toString(36).slice(2, 8)}`;
        sets.push({ path: `${name}/${id}`, data });
        docs[`${name}/${id}`] = data;
        return { id };
      },
    };
  }

  function batch() {
    const ops: Array<{ path: string }> = [];
    return {
      delete(ref: { path: string }) { ops.push({ path: ref.path }); },
      async commit() { for (const op of ops) { deletes.push(op); delete docs[op.path]; } },
    };
  }

  return {
    db: { collection, batch },
    _sets: sets,
    _updates: updates,
    _deletes: deletes,
  };
}

export function makePublish() {
  const calls: Array<{ topic: string; message: unknown }> = [];
  const publish = vi.fn(async (topic: string, message: unknown) => { calls.push({ topic, message }); return "msg-id"; });
  return { publish, calls };
}
