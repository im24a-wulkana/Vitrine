/** Postgres values in the shapes the app expects: numbers and strings, not Date objects. Keyed by type id. */
export const LOCAL_PARSERS = {
  1700: (v: string) => parseFloat(v), // numeric
  1082: (v: string) => v, // date
  1184: (v: string) => new Date(v.replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00")).toISOString(), // timestamptz
};
