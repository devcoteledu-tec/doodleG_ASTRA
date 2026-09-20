export function normalizeIndianPhone(input: string): string {
  const clean = input.replace(/^whatsapp:/, '').replace(/[\s\-()]/g, '');
  if (/^[6-9]\d{9}$/.test(clean)) return `+91${clean}`;
  if (/^91[6-9]\d{9}$/.test(clean)) return `+${clean}`;
  return clean;
}
