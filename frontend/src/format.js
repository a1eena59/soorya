export const rupees = (n) =>
  n == null ? "–" : `₹${Math.round(n).toLocaleString("en-IN")}`;

export const lakh = (n) =>
  n == null ? "–" : Math.abs(n) >= 100000 ? `₹${(n / 100000).toFixed(2)} lakh` : rupees(n);

export const units = (n) => (n == null ? "–" : Math.round(n).toLocaleString("en-IN"));

export const range = ([a, b], suffix = "") => `${a}–${b}${suffix}`;
