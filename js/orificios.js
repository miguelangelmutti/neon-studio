// Orificios: agujeros pasantes en el canal para llevar los cables del neón hacia atrás del cartel.
// Se guardan como centros (mm) y comparten un diámetro.

// Punto de los recorridos de neón más cercano a p: { punto, dist } (o null si no hay recorridos)
export function puntoEnRecorrido(neones, p) {
  let mejor = null;
  for (const { puntos, cerrado } of neones) {
    const n = puntos.length;
    for (let i = 0; i < (cerrado ? n : n - 1); i++) {
      const a = puntos[i], b = puntos[(i + 1) % n];
      const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
      const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
      const q = [a[0] + dx * t, a[1] + dy * t];
      const dist = Math.hypot(p[0] - q[0], p[1] - q[1]);
      if (!mejor || dist < mejor.dist) mejor = { punto: q, dist };
    }
  }
  return mejor;
}

// Dónde arranca cada tira: el comienzo de un trazo abierto o el punto más bajo de un contorno cerrado
export function iniciosDeTiras(neones) {
  return neones.map(({ puntos, cerrado }) => (cerrado
    ? puntos.reduce((m, q) => (q[1] < m[1] - 1e-6 || (Math.abs(q[1] - m[1]) <= 1e-6 && q[0] < m[0]) ? q : m))
    : puntos[0]));
}

export function circulo([cx, cy], diametro, lados = 40) {
  const r = diametro / 2;
  return Array.from({ length: lados }, (_, i) => {
    const a = (i / lados) * Math.PI * 2;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  });
}

export const formasOrificios = (centros, diametro) =>
  centros.map(c => ({ exterior: circulo(c, diametro), agujeros: [] }));
