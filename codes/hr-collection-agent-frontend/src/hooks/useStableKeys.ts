import { useCallback, useState } from 'react';

let counter = 0;
const nextKey = () => `row-${counter++}`;

/**
 * Stable React keys for list rows that have no id of their own.
 * Call `add` / `remove` together with the change of the list; if the length changes without them
 * (a new draft arrived), all keys start over.
 */
export function useStableKeys(length: number) {
  const [stored, setStored] = useState<string[]>(() => Array.from({ length }, nextKey));
  let keys = stored;
  if (stored.length !== length) {
    keys = Array.from({ length }, nextKey);
    setStored(keys); // adjusting state while rendering, the documented pattern for derived resets
  }
  const add = useCallback(() => setStored((current) => [...current, nextKey()]), []);
  const remove = useCallback((index: number) => setStored((current) => current.filter((_, i) => i !== index)), []);
  return { keys, add, remove };
}
