import { ID_PREFIXES, type EntityKind, type Id, type IdGenerator } from '@/domain/ids';

/** Production ID generator: kind prefix + random UUID. */
export const randomIdGenerator: IdGenerator = {
  next<K extends EntityKind>(kind: K): Id<K> {
    return `${ID_PREFIXES[kind]}_${crypto.randomUUID()}` as Id<K>;
  },
};
