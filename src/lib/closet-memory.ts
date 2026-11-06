// What you'd narrowed the closet down to, kept in memory so it survives opening an
// item. Starts empty on a fresh load, on both server and client, so hydration matches.
let saved: unknown = null;

export function rememberClosetView(view: unknown) {
  saved = view;
}

export function recallClosetView<T>(): T | null {
  return saved as T | null;
}

export function forgetClosetView() {
  saved = null;
}
