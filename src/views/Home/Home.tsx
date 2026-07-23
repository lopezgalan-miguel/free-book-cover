/**
 * CONTRATO · Vista Home
 * ---------------------
 * Pantalla de entrada del editor. En este primer nivel muestra un "hola mundo"
 * para validar el arranque, los estilos y los tokens de diseño.
 *
 * Evolución prevista: aquí se compondrá el editor completo montando el
 * escenario (features/canvas/Stage) y los paneles (texto, fuente, color,
 * lienzo, export). Mobile First: primero la hoja inferior (Sheet) con pestañas;
 * en pantallas grandes, paneles laterales fijos.
 */

export function Home() {
  return (
    <main className="flex min-h-full flex-col items-center justify-center gap-3 bg-stage px-6 text-center">
      <span className="font-mono text-xs uppercase tracking-[0.2em] text-accent">
        Editor de portadas
      </span>
      <h1 className="text-4xl font-semibold text-panel sm:text-5xl">Hola mundo</h1>
      <p className="max-w-sm text-sm text-muted">
        Base del editor lista. Estructura, estilos y modelo de dominio en su sitio.
      </p>
    </main>
  );
}
