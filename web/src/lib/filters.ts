import { useSearchParams } from "react-router";

// List filters live in the URL, so a filtered view can be bookmarked or shared.
export function useFilters<K extends string>(keys: readonly K[]) {
  const [params, setParams] = useSearchParams();
  const values = Object.fromEntries(keys.map((key) => [key, params.get(key) ?? ""])) as Record<K, string>;
  const setFilter = (key: K, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };
  return [values, setFilter] as const;
}
