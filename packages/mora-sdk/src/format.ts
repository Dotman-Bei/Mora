// Display helpers with no Stellar SDK dependency, so UI that only formats
// addresses doesn't pull the SDK into its bundle.

/** GABC…WXYZ */
export function shortAddress(a: string, head = 4, tail = 4): string {
  return a.length <= head + tail + 1 ? a : `${a.slice(0, head)}…${a.slice(-tail)}`;
}
